// mpb-public — öffentliche Aktionen (verify_jwt = false)
// register, request_reset, set_password (Reset + Einladung), check_token, invoice (Zahlseite mit GiroCode), lead,
// cron_due_mail (tägliche Übersicht fälliger STK/MTK; per pg_cron, höchstens eine Mail je Einrichtung und Tag)
import postgres from "npm:postgres@3";
import QRCode from "npm:qrcode@1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Direktverbindung: wenige, kurzlebige Verbindungen je Isolate (Slot-Erschoepfung am 2026-09-03, siehe mpb-api).
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 10, max_lifetime: 600, connect_timeout: 10 });

// auth.users ist mit anderen Vaydena-Produkten geteilt. Wird dort ein Konto gelöscht und mit derselben
// E-Mail neu angelegt, zeigt mpbuch.members.id ins Leere ("verwaist"). Die Verknüpfung wird erst nach
// eingelöstem Reset-Link (Nachweis des Postfachs) auf das neue Konto umgestellt.
async function orphanMember(email: string) {
  const r = await sql`select m.id from mpbuch.members m where lower(m.email) = ${email}
    and not exists (select 1 from auth.users x where x.id = m.id) order by m.created_at desc limit 1`;
  return r.length ? String(r[0].id) : null;
}
async function relinkOrphan(uid: string, email: string) {
  await sql.begin(async (tx: any) => {
    if ((await tx`select 1 from mpbuch.members where id = ${uid} limit 1`).length) return;
    const m = await tx`select m.id from mpbuch.members m where lower(m.email) = ${email}
      and not exists (select 1 from auth.users x where x.id = m.id) order by m.created_at desc limit 1 for update`;
    if (!m.length) return;
    const old = m[0].id;
    await tx`update mpbuch.members set id = ${uid}, updated_at = now() where id = ${old}`;
    await tx`update mpbuch.entries set member_id = ${uid} where member_id = ${old}`;
    await tx`update mpbuch.audit set member_id = ${uid} where member_id = ${old}`;
    console.log("relinkOrphan: Mitglied neu verknüpft", String(old), "->", uid);
  });
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://medizinproduktebuch.vaydena.de";
const PRODUCT = "Vaydena Medizinproduktebuch";

const BANK = { holder: "Karl-Heinz Bicker", iban: "DE95700510030000785303", bic: "BYLADEM1FSI" };
const ISSUER = {
  name: "Vaydena - Softwarelösungen", owner: "Karl-Heinz Bicker",
  street: "Biberstraße 27", zip: "85354", city: "Freising",
  email: "kontakt@vaydena.de", tel: "0151-24012554",
};
const TAX_NOTE = "Gemäß § 19 UStG wird keine Umsatzsteuer berechnet (Kleinunternehmerregelung).";
const PLAN_LABEL: Record<string, string> = { trial: "Test", starter: "Starter", team: "Team", business: "Business" };
const TRIAL_DAYS = 14;

// ---------- Helfer ----------
function str(v: unknown, max: number): string { return String(v == null ? "" : v).trim().slice(0, max); }
function esc(s: unknown) { return String(s == null ? "" : s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string)); }
function ymd(v: unknown): string { if (!v) return ""; const s = v instanceof Date ? v.toISOString() : String(v); return s.slice(0, 10); }
function dmy(v: unknown): string { const s = ymd(v); const p = s.split("-"); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s; }
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function formatIban(iban: string) { return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim(); }
async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function gotrue(path: string, method: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method, headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text(); let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* */ }
  return { ok: r.ok, status: r.status, data };
}
function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for") || "";
  return (xf.split(",")[0] || req.headers.get("cf-connecting-ip") || "unknown").trim().slice(0, 64);
}
// true = Limit erreicht; record=true zählt diesen Versuch gleich mit
async function rateHit(kind: string, key: string, max: number, window: string, record = true): Promise<boolean> {
  const r = await sql`select count(*)::int as n from mpbuch.rate_events where kind = ${kind} and key = ${key} and created_at > now() - ${window}::interval`;
  if (r[0].n >= max) return true;
  if (record) await sql`insert into mpbuch.rate_events (kind, key) values (${kind}, ${key})`;
  if (Math.random() < 0.02) await sql`delete from mpbuch.rate_events where created_at < now() - interval '2 days'`;
  return false;
}

async function passwordOk(email: string, password: string) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: SERVICE, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  await r.text();
  return r.ok;
}

// ---------- GiroCode (EPC-QR) ----------
function buildEpcPayload(p: { holder: string; iban: string; bic: string; amount: number; reference: string }): string | null {
  const holder = p.holder.trim();
  const iban = p.iban.replace(/\s+/g, "").toUpperCase();
  const bic = (p.bic || "").replace(/\s+/g, "").toUpperCase();
  const reference = (p.reference || "").trim();
  if (!holder || holder.length > 70) return null;
  if (!iban || iban.length > 34) return null;
  if (bic && bic.length !== 8 && bic.length !== 11) return null;
  if (reference.length > 140) return null;
  if (!Number.isFinite(p.amount)) return null;
  const amount = Math.round(p.amount * 100) / 100;
  if (amount < 0.01 || amount > 999999999.99) return null;
  const lines = ["BCD", "002", "1", "SCT", bic, holder, iban, `EUR${amount.toFixed(2)}`, "", "", reference];
  const payload = lines.join("\n");
  if (new TextEncoder().encode(payload).length > 331) return null;
  return payload;
}
function buildGiro(p: { holder: string; iban: string; bic: string; amount: number; reference: string }): { path: string; size: number } | null {
  const payload = buildEpcPayload(p);
  if (!payload) return null;
  try {
    const qr = QRCode.create(payload, { errorCorrectionLevel: "M" });
    const n = qr.modules.size; const data = qr.modules.data; const quiet = 4; const size = n + quiet * 2;
    let path = "";
    for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (data[r * n + cc]) path += `M${cc + quiet} ${r + quiet}h1v1h-1z`;
    return { path, size };
  } catch { return null; }
}

// ---------- Mail (best-effort) ----------
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: number | undefined;
  const to = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new Error("timeout")), ms) as unknown as number; });
  p.catch(() => {});
  return Promise.race([p, to]).finally(() => clearTimeout(t)) as Promise<T>;
}
async function sendMail(to: string, subject: string, text: string, html: string) {
  const user = Deno.env.get("MAIL_USER"); const pass = Deno.env.get("MAIL_PASSWORD");
  if (!user || !pass) return { ok: false, err: "mail_not_configured" };
  const host = Deno.env.get("MAIL_SMTP_HOST") || "smtp.hostinger.com";
  const port = Number(Deno.env.get("MAIL_SMTP_PORT") || "465");
  const from = Deno.env.get("MAIL_FROM") || user;
  let SMTPClient: any;
  try { ({ SMTPClient } = await import("https://deno.land/x/denomailer@1.6.0/mod.ts")); }
  catch (e) { return { ok: false, err: "smtp_module:" + String((e as any)?.message || e) }; }
  const client = new SMTPClient({ connection: { hostname: host, port, tls: true, auth: { username: user, password: pass } } });
  try { await withTimeout(client.send({ from: `${PRODUCT} <${from}>`, to, subject, content: text, html }), 20000); return { ok: true }; }
  catch (e) { return { ok: false, err: String((e as any)?.message || e) }; }
  finally { try { await withTimeout(client.close(), 5000); } catch (_e) { /* */ } }
}
function mailShell(title: string, inner: string) {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f2830;max-width:560px"><h2 style="color:#0e6f6b;margin:0 0 12px">${esc(title)}</h2>${inner}<p style="font-size:12px;color:#5c7883;margin-top:26px">${esc(PRODUCT)} · ${esc(SITE)}</p></div>`;
}
function button(href: string, label: string) {
  return `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">${esc(label)}</a></p><p style="font-size:13px;color:#5c7883;word-break:break-all">${esc(href)}</p>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_json" }, 400);
  const action = String(body?.action ?? "").trim();

  try {
    // -------- Registrierung: Einrichtung + Admin-Nutzer + erster Standort --------
    if (action === "register") {
      if (str(body.hp, 10)) return json({ ok: true }); // Honeypot
      const company = str(body.company, 200);
      const name = str(body.name, 120);
      const email = str(body.email, 200).toLowerCase();
      const password = String(body.password ?? "");
      if (company.length < 2) return json({ error: "bad_company" }, 400);
      if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);
      if (password.length < 8 || password.length > 200) return json({ error: "bad_password" }, 400);
      // Rate-Limits: je IP (Anlage-Spam) und je E-Mail (Passwort-Raten über bestehende Konten); global nur als Notbremse.
      if (await rateHit("register_ip", clientIp(req), 10, "1 hour")) return json({ error: "rate_limited" }, 429);
      const recent = await sql`select count(*)::int as n from mpbuch.tenants where created_at > now() - interval '1 hour'`;
      if (recent[0].n >= 200) return json({ error: "rate_limited" }, 429);

      let uid: string;
      const au = await sql`select id from auth.users where lower(email) = ${email} limit 1`;
      if (au.length) {
        // Nutzer existiert bereits (anderes Vaydena-Produkt oder frühere Registrierung): Passwort muss stimmen
        const member = await sql`select tenant_id from mpbuch.members where id = ${au[0].id} limit 1`;
        if (member.length) return json({ error: "already_registered" }, 400);
        if (await rateHit("register_pw", email, 5, "1 hour", false)) return json({ error: "rate_limited" }, 429);
        if (!(await passwordOk(email, password))) {
          await sql`insert into mpbuch.rate_events (kind, key) values ('register_pw', ${email})`;
          return json({ error: "email_exists" }, 400);
        }
        uid = String(au[0].id);
      } else {
        const cr = await gotrue("admin/users", "POST", { email, password, email_confirm: true, user_metadata: { name, company } });
        if (!cr.ok || !cr.data?.id) return json({ error: "auth_create_failed", detail: cr.data?.msg || cr.data?.error_description || cr.status }, 400);
        uid = String(cr.data.id);
      }
      const locId = crypto.randomUUID();
      const billing = { recipient: company, street: "", zip: "", city: "", email };
      const tenantId = await sql.begin(async (tx: any) => {
        const t = await tx`insert into mpbuch.tenants (name, contact_email, billing, trial_ends_at)
          values (${company}, ${email}, ${billing}::jsonb, current_date + ${TRIAL_DAYS}::int) returning id`;
        await tx`insert into mpbuch.members (id, tenant_id, role, name, email) values (${uid}, ${t[0].id}, 'admin', ${name || null}, ${email})`;
        await tx`insert into mpbuch.locations (id, tenant_id, name) values (${locId}, ${t[0].id}, 'Hauptstandort')`;
        return String(t[0].id);
      });
      const appLink = `${SITE}/app.html`;
      await sendMail(email, `Willkommen bei ${PRODUCT}`,
        `Guten Tag${name ? " " + name : ""},\n\nIhr Zugang für ${company} ist eingerichtet. ${TRIAL_DAYS} Tage kostenlos testen, ohne Zahlungsdaten.\n\nApp starten: ${appLink}\n\nTipp: Öffnen Sie die App auf dem Smartphone und wählen Sie „Zum Startbildschirm hinzufügen“ – dann funktioniert sie auch ohne Internet.\n\nViele Grüße\n${PRODUCT}`,
        mailShell(`Willkommen bei ${PRODUCT}`, `<p>Guten Tag${name ? " " + esc(name) : ""},</p><p>Ihr Zugang für <b>${esc(company)}</b> ist eingerichtet. ${TRIAL_DAYS} Tage kostenlos testen, ohne Zahlungsdaten.</p>${button(appLink, "App starten")}<p style="font-size:13px;color:#5c7883">Tipp: App auf dem Smartphone öffnen und „Zum Startbildschirm hinzufügen“ wählen – dann funktioniert sie auch ohne Internet.</p>`));
      await sendMail(ISSUER.email, `Neue Registrierung — ${PRODUCT}`,
        `Firma: ${company}\nName: ${name}\nE-Mail: ${email}\nMandant: ${tenantId}`,
        mailShell("Neue Registrierung", `<p><b>${esc(company)}</b><br>${esc(name)}<br>${esc(email)}<br><small>${esc(tenantId)}</small></p>`));
      return json({ ok: true });
    }

    // -------- Passwort vergessen --------
    if (action === "request_reset") {
      const email = str(body.email, 200).toLowerCase();
      if (!EMAIL_RE.test(email)) return json({ ok: true });
      let au = await sql`select u.id from auth.users u join mpbuch.members m on m.id = u.id where lower(u.email) = ${email} limit 1`;
      // Verwaistes Mitglied (Auth-Konto gelöscht und neu angelegt): Reset-Link an das aktuelle Konto, Verknüpfung beim Einlösen
      if (!au.length && (await orphanMember(email))) au = await sql`select id from auth.users where lower(email) = ${email} limit 1`;
      if (!au.length) { console.log("request_reset: kein Konto in diesem Produkt"); return json({ ok: true }); }
      const cnt = await sql`select count(*)::int as n from mpbuch.auth_tokens where email = ${email} and purpose = 'reset' and created_at > now() - interval '1 hour'`;
      if (cnt[0].n >= 3) return json({ ok: true });
      const token = randomToken(32);
      await sql`insert into mpbuch.auth_tokens (token_hash, user_id, email, purpose, expires_at) values (${await sha256hex(token)}, ${au[0].id}, ${email}, 'reset', now() + interval '2 hours')`;
      const link = `${SITE}/anmelden.html?reset=${token}`;
      const sent = await sendMail(email, `Passwort zurücksetzen — ${PRODUCT}`,
        `Guten Tag,\n\nüber diesen Link legen Sie ein neues Passwort fest (2 Stunden gültig):\n${link}\n\nFalls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.\n\n${PRODUCT}`,
        mailShell("Passwort zurücksetzen", `<p>Über diesen Link legen Sie ein neues Passwort fest (2 Stunden gültig):</p>${button(link, "Neues Passwort festlegen")}<p style="font-size:13px;color:#5c7883">Falls Sie das nicht angefordert haben, ignorieren Sie diese E-Mail.</p>`));
      if (!sent.ok) console.error("request_reset: Mailversand fehlgeschlagen:", sent.err);
      return json({ ok: true });
    }

    // -------- Passwort setzen (Reset-Link oder Einladung) --------
    if (action === "set_password" || action === "reset_password") {
      const token = str(body.token, 200);
      const password = String(body.password ?? "");
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "invalid_token" }, 400);
      if (password.length < 8 || password.length > 200) return json({ error: "bad_password" }, 400);
      // Token atomar einlösen: zwei parallele Aufrufe können ihn nicht beide verwenden
      const hash = await sha256hex(token);
      const rows = await sql`update mpbuch.auth_tokens set used_at = now() where token_hash = ${hash} and used_at is null and expires_at > now()
        returning user_id, email, purpose`;
      if (!rows.length) return json({ error: "invalid_token" }, 400);
      const tok = rows[0];
      let u = await sql`select u.email, u.last_sign_in_at, m.auth_created from auth.users u join mpbuch.members m on m.id = u.id where u.id = ${tok.user_id} limit 1`;
      let relink = false;
      if (!u.length && tok.purpose === "reset" && (await orphanMember(String(tok.email).toLowerCase()))) {
        u = await sql`select email, last_sign_in_at, false as auth_created from auth.users where id = ${tok.user_id} limit 1`;
        relink = true;
      }
      // Nur Mitglieder dieses Produkts mit unveränderter E-Mail. Einladungs-Links setzen nur bei neu angelegten, noch nie
      // benutzten Konten ein Passwort – ein geteiltes Vaydena-Konto kann darüber nicht übernommen werden.
      if (!u.length || String(u[0].email || "").toLowerCase() !== String(tok.email).toLowerCase()) return json({ error: "invalid_token" }, 400);
      if (tok.purpose === "invite" && (u[0].auth_created !== true || u[0].last_sign_in_at)) return json({ error: "invite_used" }, 400);
      const r = await gotrue(`admin/users/${tok.user_id}`, "PUT", { password, email_confirm: true });
      if (!r.ok) {
        await sql`update mpbuch.auth_tokens set used_at = null where token_hash = ${hash}`;
        return json({ error: "update_failed" }, 400);
      }
      // Wer den Reset-Link aus dem Postfach eingelöst hat, besitzt die Adresse: verwaistes Mitglied übernehmen
      if (relink) await relinkOrphan(String(tok.user_id), String(tok.email).toLowerCase());
      // übrige offene Links dieses Kontos entwerten
      await sql`update mpbuch.auth_tokens set used_at = now() where user_id = ${tok.user_id} and used_at is null`;
      return json({ ok: true, email: tok.email, purpose: tok.purpose });
    }

    if (action === "check_token") {
      const token = str(body.token, 200);
      if (!/^[0-9a-f]{64}$/.test(token)) return json({ ok: false });
      const rows = await sql`select email, purpose from mpbuch.auth_tokens where token_hash = ${await sha256hex(token)} and used_at is null and expires_at > now() limit 1`;
      return json({ ok: rows.length > 0, email: rows[0]?.email || null, purpose: rows[0]?.purpose || null });
    }

    // -------- Zahlseite: Rechnung mit Bankverbindung + GiroCode --------
    if (action === "invoice") {
      const token = str(body.access_token, 80);
      if (!/^[0-9a-f]{36}$/.test(token)) return json({ error: "not_found" }, 404);
      const rows = await sql`select v.*, t.name as tenant_name from mpbuch.invoices v join mpbuch.tenants t on t.id = v.tenant_id where v.access_token = ${token} limit 1`;
      if (!rows.length) return json({ error: "not_found" }, 404);
      const inv = rows[0];
      const amount = Number(inv.amount_cents) / 100;
      const reference = String(inv.reference || inv.number);
      const giro = inv.status === "open" ? buildGiro({ holder: BANK.holder, iban: BANK.iban, bic: BANK.bic, amount, reference }) : null;
      const perLabel = inv.period === "jahr" ? "12 Monate" : "1 Monat";
      return json({ ok: true, invoice: {
        number: inv.number, status: inv.status, plan: inv.plan, plan_label: PLAN_LABEL[inv.plan] || inv.plan, period: inv.period,
        period_label: perLabel, amount_cents: inv.amount_cents, amount_eur: amount.toFixed(2).replace(".", ","),
        reference, issued_dmy: dmy(inv.issued_at), due_dmy: dmy(inv.due_date), paid_dmy: dmy(inv.paid_at),
        billing: inv.billing || { recipient: inv.tenant_name }, tenant_name: inv.tenant_name,
        description: `${PRODUCT} – Tarif ${PLAN_LABEL[inv.plan] || inv.plan}, Laufzeit ${perLabel}`,
        bank: { holder: BANK.holder, iban: formatIban(BANK.iban), iban_raw: BANK.iban, bic: BANK.bic },
        giro, issuer: ISSUER, tax_note: TAX_NOTE,
      } });
    }

    // -------- Kontaktanfrage --------
    if (action === "lead") {
      if (str(body.hp, 10)) return json({ ok: true });
      const firma = str(body.firma, 200), name = str(body.name, 120), email = str(body.email, 200).toLowerCase(), nachricht = str(body.nachricht, 3000);
      if (!EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);
      if (nachricht.length < 5) return json({ error: "bad_message" }, 400);
      const recent = await sql`select count(*)::int as n from mpbuch.leads where email = ${email} and created_at > now() - interval '1 hour'`;
      if (recent[0].n >= 5) return json({ ok: true });
      await sql`insert into mpbuch.leads (firma, name, email, nachricht) values (${firma || null}, ${name || null}, ${email}, ${nachricht})`;
      await sendMail(ISSUER.email, `Anfrage — ${PRODUCT}`,
        `Firma: ${firma}\nName: ${name}\nE-Mail: ${email}\n\n${nachricht}`,
        mailShell("Neue Anfrage", `<p><b>${esc(firma)}</b><br>${esc(name)}<br>${esc(email)}</p><p style="white-space:pre-wrap">${esc(nachricht)}</p>`));
      return json({ ok: true });
    }

    // -------- Tägliche Fristenübersicht STK/MTK (pg_cron) --------
    // Ohne Geheimnis aufrufbar, aber harmlos: je Firma mit Opt-in höchstens eine Mail pro Kalendertag.
    // Reine Kalenderrechnung aus den eingetragenen Daten – die Fristen selbst legt der Betreiber fest.
    if (action === "cron_due_mail") {
      if (await rateHit("cron_due_mail", "all", 6, "1 hour")) return json({ error: "rate_limited" }, 429);
      const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
      const tenants = await sql`select id, name, plan, settings from mpbuch.tenants
        where status = 'aktiv' and coalesce((settings->>'due_mail')::boolean, false) = true
          and (due_mailed_on is null or due_mailed_on < ${today}::date)
          and ((plan = 'trial' and trial_ends_at >= ${today}::date) or (plan <> 'trial' and paid_until + 7 >= ${today}::date))
        limit 200`;
      let sent = 0;
      for (const t of tenants) {
        const claim = await sql`update mpbuch.tenants set due_mailed_on = ${today}::date
          where id = ${t.id} and (due_mailed_on is null or due_mailed_on < ${today}::date) returning id`;
        if (!claim.length) continue;
        const days = Math.max(1, Math.min(180, Number((t.settings || {}).due_days) || 30));
        // Letzte gültige Prüfung je Gerät und Art: berichtigte Einträge zählen nicht.
        const rows = await sql`
          with last as (
            select distinct on (e.device_id, e.type) e.device_id, e.type, e.date, e.next_due
              from mpbuch.entries e
             where e.tenant_id = ${t.id} and e.type in ('stk', 'mtk')
               and not exists (select 1 from mpbuch.entries c where c.corrects = e.id)
             order by e.device_id, e.type, e.date desc, e.created_at desc)
          select d.inv_no, d.name, l.name as loc, k.type,
                 case when k.type = 'stk' then
                   coalesce(s.next_due, (date_trunc('month', coalesce(s.date, d.commissioned) + make_interval(months => coalesce(d.stk_interval_months, 24))) + interval '1 month - 1 day')::date)
                 else
                   coalesce(s.next_due, case when d.mtk_interval_years is null then null
                     else make_date(extract(year from coalesce(s.date, d.commissioned))::int + d.mtk_interval_years, 12, 31) end)
                 end::text as due
            from mpbuch.devices d
            cross join (values ('stk'), ('mtk')) as k(type)
            left join last s on s.device_id = d.id and s.type = k.type
            left join mpbuch.locations l on l.id = d.location_id
           where d.tenant_id = ${t.id} and d.deleted = false and d.decommissioned_at is null
             and ((k.type = 'stk' and d.anlage1) or (k.type = 'mtk' and d.anlage2))
           order by 5, d.inv_no limit 2000`;
        const limit = new Date(Date.parse(today + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
        const due = rows.filter((r: any) => r.due && r.due <= limit).slice(0, 300);
        if (!due.length) continue;
        let to: string[] = [];
        const custom = String((t.settings || {}).due_mail_to || "");
        if (EMAIL_RE.test(custom)) to = [custom];
        else to = (await sql`select email from mpbuch.members where tenant_id = ${t.id} and role = 'admin' and active = true and email is not null`).map((r: any) => String(r.email)).filter((e: string) => EMAIL_RE.test(e));
        if (!to.length) continue;
        const lbl = (r: any) => r.type === "stk" ? "STK" : "MTK";
        const over = due.filter((r: any) => r.due < today).length;
        const txt = due.map((r: any) => `- ${lbl(r)} ${r.inv_no} ${r.name}${r.loc ? " (" + r.loc + ")" : ""}: fällig bis ${dmy(r.due)}${r.due < today ? " – ÜBERFÄLLIG" : ""}`).join("\n");
        const td = "padding:4px 8px;border-bottom:1px solid #e3ecee;font-size:14px";
        const html = `<table style="border-collapse:collapse;width:100%"><tr><th align="left" style="${td}">Gerät</th><th align="left" style="${td}">Prüfung</th><th align="right" style="${td}">fällig bis</th></tr>${due.map((r: any) => `<tr><td style="${td}">${esc(r.name)}<br><small style="color:#5c7883">${esc(r.inv_no)}${r.loc ? " · " + esc(r.loc) : ""}</small></td><td style="${td}">${lbl(r)}</td><td align="right" style="${td}${r.due < today ? ";color:#b3261e;font-weight:700" : ""}">${dmy(r.due)}</td></tr>`).join("")}</table>`;
        const appLink = `${SITE}/app.html`;
        const head = `${due.length} Prüffrist${due.length === 1 ? "" : "en"} in den nächsten ${days} Tagen${over ? `, davon ${over} überfällig` : ""}`;
        for (const addr of to) {
          const r = await sendMail(addr, `Prüffristen ${dmy(today)} — ${t.name}`,
            `Guten Tag,\n\n${t.name}: ${head}.\n\n${txt}\n\nApp: ${appLink}\n\nDie Übersicht wird aus den in der App eingetragenen Daten berechnet. Diese Mail lässt sich in der App unter Einstellungen abschalten.\n\n${PRODUCT}`,
            mailShell(`Prüffristen ${dmy(today)}`, `<p><b>${esc(t.name)}</b>: ${head}.</p>${html}${button(appLink, "App öffnen")}<p style="font-size:12px;color:#5c7883">Die Übersicht wird aus den in der App eingetragenen Daten berechnet. Diese Mail lässt sich in der App unter Einstellungen abschalten.</p>`));
          if (r.ok) sent++;
        }
      }
      return json({ ok: true, tenants: tenants.length, sent });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    try { console.error("mpb-public", action, String((e as any)?.message || e)); } catch (_e) { /* */ }
    return json({ error: "server_error" }, 500);
  }
});
