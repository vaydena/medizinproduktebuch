// mpb-api — authentifizierte Aktionen (verify_jwt = true)
// Zugriff nur mit gültigem Nutzer-JWT (Supabase Auth). Firmen-Admin & Mitarbeiter.
// Kern: Offline-Sync (pull/push), Team, Abo/Rechnungen, Export, Protokoll.
import postgres from "npm:postgres@3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Direktverbindung zur DB: wenige, kurzlebige Verbindungen je Isolate. Mit dem Standard (10 je Client)
// waren bei parallelen Testlaeufen am 2026-09-03 die Verbindungsslots erschoepft
// ("remaining connection slots are reserved for roles with the SUPERUSER attribute" -> 500).
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 10, max_lifetime: 600, connect_timeout: 10 });
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE = "https://medizinproduktebuch.vaydena.de";
const PRODUCT = "Vaydena Medizinproduktebuch";
const OPERATOR_MAIL = "kontakt@vaydena.de";

type Plan = { label: string; users: number; devices: number; price: { monat: number; jahr: number } };
// users: 0 = kein Nutzerlimit. Alle Tarife haben denselben Funktionsumfang, sie unterscheiden sich nur in der Größe.
// Business ist nicht öffentlich buchbar, nur über den Betreiber-Bereich.
const PLANS: Record<string, Plan> = {
  trial:    { label: "Test",     users: 0, devices: 1000,   price: { monat: 0,    jahr: 0 } },
  starter:  { label: "Starter",  users: 3, devices: 30,     price: { monat: 900,  jahr: 9000 } },
  team:     { label: "Team",     users: 0, devices: 1000,   price: { monat: 1900, jahr: 19000 } },
  business: { label: "Business", users: 0, devices: 100000, price: { monat: 9900, jahr: 99000 } },
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GRACE_DAYS = 7;

// ---------- Helfer ----------
function claims(req: Request): { uid: string; email: string } | null {
  const auth = req.headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length < 2) return null;
  try {
    let s = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    s += "=".repeat((4 - (s.length % 4)) % 4);
    const bin = atob(s);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || typeof p.sub !== "string" || p.role !== "authenticated") return null;
    return { uid: p.sub, email: typeof p.email === "string" ? p.email : "" };
  } catch { return null; }
}
function ymd(v: unknown): string {
  if (!v) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}
function dmy(v: unknown): string {
  const s = ymd(v); const p = s.split("-");
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : s;
}
// Kalendertag in Deutschland (Abo-/Testende gelten bis Mitternacht deutscher Zeit, nicht UTC)
function todayYmd(): string { return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()); }
function addDays(d: string, n: number): string {
  const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}
function subState(t: any) {
  const today = todayYmd();
  if (t.status !== "aktiv") return { active: false, reason: "gesperrt", days_left: 0, until: null };
  if (t.plan === "trial") {
    const end = ymd(t.trial_ends_at);
    const ok = !!end && end >= today;
    return { active: ok, reason: ok ? null : "trial_expired", days_left: ok ? daysBetween(today, end) : 0, until: end || null };
  }
  const pu = ymd(t.paid_until);
  if (!pu) return { active: false, reason: "unpaid", days_left: 0, until: null };
  const grace = addDays(pu, GRACE_DAYS);
  const ok = grace >= today;
  return { active: ok, reason: ok ? (pu >= today ? null : "grace") : "expired", days_left: Math.max(0, daysBetween(today, pu)), until: pu };
}
function tenantOut(t: any) {
  const p = PLANS[t.plan] || PLANS.trial;
  return {
    id: t.id, name: t.name, plan: t.plan, plan_label: p.label, status: t.status,
    trial_ends_at: ymd(t.trial_ends_at) || null, trial_ends_dmy: dmy(t.trial_ends_at),
    paid_until: ymd(t.paid_until) || null, paid_until_dmy: dmy(t.paid_until),
    billing: t.billing || {}, inv_prefix: t.inv_prefix, settings: t.settings || {},
    contact_email: t.contact_email || null,
    limits: { users: p.users, devices: p.devices }, sub: subState(t),
  };
}
function esc(s: unknown) { return String(s == null ? "" : s).replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch] as string)); }
function str(v: unknown, max: number): string { return String(v == null ? "" : v).trim().slice(0, max); }
function strOrNull(v: unknown, max: number): string | null { const s = str(v, max); return s ? s : null; }
function num(v: unknown): number | null { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }
function isoOrNow(v: unknown): string {
  const t = Date.parse(String(v || ""));
  if (!Number.isFinite(t)) return new Date().toISOString();
  const now = Date.now();
  if (t > now + 86400000 || t < now - 366 * 86400000) return new Date().toISOString();
  return new Date(t).toISOString();
}
function pad(n: number, w: number) { return String(n).padStart(w, "0"); }

async function loadMe(uid: string) {
  const rows = await sql`
    select m.id, m.tenant_id, m.role, m.name, m.email, m.active,
           t.name as tenant_name, t.plan, t.status, t.trial_ends_at, t.paid_until, t.billing,
           t.inv_prefix, t.settings, t.contact_email
      from mpbuch.members m join mpbuch.tenants t on t.id = m.tenant_id
     where m.id = ${uid} limit 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, tenant: { id: r.tenant_id, name: r.tenant_name, plan: r.plan, status: r.status, trial_ends_at: r.trial_ends_at, paid_until: r.paid_until, billing: r.billing, inv_prefix: r.inv_prefix, settings: r.settings, contact_email: r.contact_email } };
}

async function gotrue(path: string, method: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const txt = await r.text();
  let data: any = null; try { data = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
  return { ok: r.ok, status: r.status, data };
}
// Auth-Konto darf nur gelöscht werden, wenn das Medizinproduktebuch es selbst angelegt hat (Einladung),
// es nie benutzt wurde und kein anderes Vaydena-Produkt es kennt (auth.users ist geteilt).
async function authDeletable(uid: string): Promise<boolean> {
  const r = await sql`select m.auth_created, u.last_sign_in_at from mpbuch.members m join auth.users u on u.id = m.id where m.id = ${uid} limit 1`;
  if (!r.length || r[0].auth_created !== true || r[0].last_sign_in_at) return false;
  for (const tbl of ["public.profiles", "schulung.members", "punkto.users", "lager.members"]) {
    const reg = await sql`select to_regclass(${tbl}) as r`;
    if (!reg[0].r) continue;
    const x = await sql.unsafe(`select 1 from ${tbl} where id = $1 limit 1`, [uid]);
    if (x.length) return false;
  }
  return true;
}
// Protokoll: wer hat wann was geändert (best-effort, blockiert die Aktion nie)
async function audit(tid: string, me: any, action: string, detail: Record<string, unknown> = {}) {
  try {
    await sql`insert into mpbuch.audit (tenant_id, member_id, actor, action, detail)
      values (${tid}, ${me?.id || null}, ${me?.name || me?.email || null}, ${action}, ${sql.json(detail as any)})`;
  } catch (e) { try { console.error("audit", String((e as any)?.message || e)); } catch (_e) { /* */ } }
}
function ymdOk(v: unknown): string | null {
  const s = String(v || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null;
}
async function sha256hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes); crypto.getRandomValues(a);
  return [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Mail (best-effort, Hostinger-SMTP via denomailer) ----------
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
  try {
    await withTimeout(client.send({ from: `${PRODUCT} <${from}>`, to, subject, content: text, html }), 20000);
    return { ok: true };
  } catch (e) { return { ok: false, err: String((e as any)?.message || e) }; }
  finally { try { await withTimeout(client.close(), 5000); } catch (_e) { /* ignore */ } }
}
function mailShell(title: string, inner: string) {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;color:#0f2830;max-width:560px"><h2 style="color:#0e6f6b;margin:0 0 12px">${esc(title)}</h2>${inner}<p style="font-size:12px;color:#5c7883;margin-top:26px">${esc(PRODUCT)} · ${esc(SITE)}</p></div>`;
}

// ---------- Rechnung anlegen (auch in mpb-admin dupliziert) ----------
async function createInvoice(tenantId: string, plan: string, period: "monat" | "jahr") {
  const p = PLANS[plan];
  const amount = p.price[period];
  const t = await sql`select id, name, billing, contact_email from mpbuch.tenants where id = ${tenantId} limit 1`;
  if (!t.length) throw new Error("tenant_not_found");
  const seq = await sql`select nextval('mpbuch.invoice_number_seq') as v`;
  const number = "MP-" + new Date().getFullYear() + "-" + pad(Number(seq[0].v), 5);
  const perLabel = period === "jahr" ? "Jahr" : "Monat";
  let reference = `${number} Vaydena Medizinproduktebuch ${p.label} ${perLabel}`.replace(/[^A-Za-z0-9 .,:/-]/g, "");
  if (reference.length > 140) reference = reference.slice(0, 140);
  const bill = (t[0].billing && typeof t[0].billing === "object") ? t[0].billing : {};
  const billing = { recipient: bill.recipient || t[0].name, street: bill.street || "", zip: bill.zip || "", city: bill.city || "", email: bill.email || t[0].contact_email || "" };
  const rows = await sql`insert into mpbuch.invoices (tenant_id, number, plan, period, amount_cents, status, reference, billing)
    values (${tenantId}, ${number}, ${plan}, ${period}, ${amount}, 'open', ${reference}, ${billing}::jsonb)
    returning id, access_token, number, amount_cents, due_date`;
  const inv = rows[0];
  const link = `${SITE}/zahlung.html?r=${inv.access_token}`;
  let emailed = false;
  const to = billing.email;
  if (to && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    const r = await sendMail(to, `Rechnung ${number} — ${PRODUCT}`,
      `Guten Tag,\n\nIhre Rechnung ${number} über ${(amount / 100).toFixed(2).replace(".", ",")} € (Tarif ${p.label}, pro ${perLabel}) liegt bereit.\nZahlseite mit Bankverbindung und GiroCode: ${link}\nFällig bis: ${dmy(inv.due_date)}\n\nNach Zahlungseingang schalten wir den Tarif frei.\n\nViele Grüße\n${PRODUCT}`,
      mailShell(`Rechnung ${number}`, `<p>Ihre Rechnung über <b>${(amount / 100).toFixed(2).replace(".", ",")} €</b> (Tarif ${esc(p.label)}, pro ${perLabel}) liegt bereit. Fällig bis ${esc(dmy(inv.due_date))}.</p><p style="margin:22px 0"><a href="${esc(link)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Zahlseite öffnen (Überweisung / GiroCode)</a></p><p style="font-size:13px;color:#5c7883">Oder Link kopieren:<br><span style="word-break:break-all">${esc(link)}</span></p>`));
    emailed = !!r.ok;
  }
  return { id: inv.id, access_token: inv.access_token, number: inv.number, amount_cents: inv.amount_cents, due_dmy: dmy(inv.due_date), link, emailed };
}

// ---------- Push-Verarbeitung ----------

type Res = { id: string; ok: boolean; error?: string; dup?: boolean; stale?: boolean; seq?: number };

const ENTRY_TYPES = ["funktionspruefung", "einweisung", "stk", "mtk", "it", "instandhaltung", "stoerung", "vorkommnis"];
const PULL_ENTRY_LIMIT = 5000;

// Fremde ID (anderer Mandant) erkennen: das Upsert würde sie sonst stillschweigend übergehen.
async function ownOrFree(table: "locations" | "devices" | "persons", tid: string, id: string): Promise<"own" | "free" | "foreign"> {
  const r = await sql.unsafe(`select tenant_id from mpbuch.${table} where id = $1 limit 1`, [id]);
  if (!r.length) return "free";
  return String(r[0].tenant_id) === tid ? "own" : "foreign";
}
async function markStale(table: "locations" | "devices" | "persons" | "btm_items", tid: string, id: string, upd: string): Promise<boolean> {
  const r = await sql.unsafe(`update mpbuch.${table} set synced_at = now() where id = $1 and tenant_id = $2 and updated_at > $3::timestamptz returning id`, [id, tid, upd]);
  return r.length > 0;
}

async function upsertLocation(tid: string, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const name = str(rec.name, 120);
  if (!name) return { id, ok: false, error: "name_required" };
  if ((await ownOrFree("locations", tid, id)) === "foreign") return { id, ok: false, error: "bad_id" };
  const upd = isoOrNow(rec.updated_at);
  await sql`insert into mpbuch.locations (id, tenant_id, name, note, deleted, created_at, updated_at)
    values (${id}, ${tid}, ${name}, ${strOrNull(rec.note, 500)}, ${rec.deleted === true}, ${isoOrNow(rec.created_at)}, ${upd})
    on conflict (id) do update set name = excluded.name, note = excluded.note,
      deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where mpbuch.locations.tenant_id = excluded.tenant_id and mpbuch.locations.updated_at <= excluded.updated_at`;
  if (await markStale("locations", tid, id, upd)) return { id, ok: true, stale: true };
  return { id, ok: true };
}

async function upsertPerson(tid: string, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const name = str(rec.name, 160);
  if (!name) return { id, ok: false, error: "name_required" };
  if ((await ownOrFree("persons", tid, id)) === "foreign") return { id, ok: false, error: "bad_id" };
  const upd = isoOrNow(rec.updated_at);
  await sql`insert into mpbuch.persons (id, tenant_id, name, note, active, deleted, created_at, updated_at)
    values (${id}, ${tid}, ${name}, ${strOrNull(rec.note, 500)}, ${rec.active !== false}, ${rec.deleted === true}, ${isoOrNow(rec.created_at)}, ${upd})
    on conflict (id) do update set name = excluded.name, note = excluded.note, active = excluded.active,
      deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where mpbuch.persons.tenant_id = excluded.tenant_id and mpbuch.persons.updated_at <= excluded.updated_at`;
  if (await markStale("persons", tid, id, upd)) return { id, ok: true, stale: true };
  return { id, ok: true };
}

function intIn(v: unknown, lo: number, hi: number): number | null {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n);
  return r >= lo && r <= hi ? r : null;
}

// Bestandsverzeichnis (§ 14 MPBetreibV)
async function upsertDevice(tid: string, rec: any, locOk: (id: string) => boolean, canCreate: () => boolean, onCreated: () => void): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const invNo = str(rec.inv_no, 40); const name = str(rec.name, 200);
  if (!invNo) return { id, ok: false, error: "inv_no_required" };
  if (!name) return { id, ok: false, error: "name_required" };
  const deleted = rec.deleted === true;
  let loc: string | null = rec.location_id ? String(rec.location_id).toLowerCase() : null;
  if (loc && !(UUID_RE.test(loc) && locOk(loc))) loc = null;
  const ex = await sql`select tenant_id, deleted from mpbuch.devices where id = ${id} limit 1`;
  if (ex.length && String(ex[0].tenant_id) !== tid) return { id, ok: false, error: "bad_id" };
  // Zählt neu gegen das Tarif-Limit: neues Gerät oder Wiederherstellung eines gelöschten
  const adds = !deleted && (!ex.length || ex[0].deleted === true);
  if (adds && !canCreate()) return { id, ok: false, error: "limit_devices" };
  const upd = isoOrNow(rec.updated_at);
  try {
    await sql`insert into mpbuch.devices (id, tenant_id, inv_no, name, kind, model, serial, year, manufacturer, manufacturer_address,
        location_id, assignment, anlage1, anlage2, stk_interval_months, mtk_interval_years, commissioned, decommissioned_at, note, deleted, created_at, updated_at)
      values (${id}, ${tid}, ${invNo}, ${name}, ${strOrNull(rec.kind, 120)}, ${strOrNull(rec.model, 120)}, ${strOrNull(rec.serial, 120)},
        ${intIn(rec.year, 1950, 2100)}, ${strOrNull(rec.manufacturer, 200)}, ${strOrNull(rec.manufacturer_address, 400)},
        ${loc}, ${strOrNull(rec.assignment, 200)}, ${rec.anlage1 === true}, ${rec.anlage2 === true},
        ${intIn(rec.stk_interval_months, 1, 120)}, ${intIn(rec.mtk_interval_years, 1, 20)},
        ${ymdOk(rec.commissioned)}, ${ymdOk(rec.decommissioned_at)}, ${strOrNull(rec.note, 2000)}, ${deleted}, ${isoOrNow(rec.created_at)}, ${upd})
      on conflict (id) do update set inv_no = excluded.inv_no, name = excluded.name, kind = excluded.kind, model = excluded.model,
        serial = excluded.serial, year = excluded.year, manufacturer = excluded.manufacturer, manufacturer_address = excluded.manufacturer_address,
        location_id = excluded.location_id, assignment = excluded.assignment, anlage1 = excluded.anlage1, anlage2 = excluded.anlage2,
        stk_interval_months = excluded.stk_interval_months, mtk_interval_years = excluded.mtk_interval_years,
        commissioned = excluded.commissioned, decommissioned_at = excluded.decommissioned_at, note = excluded.note,
        deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
      where mpbuch.devices.tenant_id = excluded.tenant_id and mpbuch.devices.updated_at <= excluded.updated_at`;
    if (await markStale("devices", tid, id, upd)) return { id, ok: true, stale: true };
    if (adds) onCreated();
    return { id, ok: true };
  } catch (e) {
    if ((e as any)?.code === "23505") return { id, ok: false, error: "inv_no_exists" };
    throw e;
  }
}

// Medizinproduktebuch (§ 13 MPBetreibV): nur anfügen. Berichtigt wird über einen neuen Eintrag mit `corrects`.
async function addEntry(tid: string, me: any, clientId: string | null, rec: any, deviceOk: (id: string) => boolean): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const deviceId = String(rec.device_id || "").toLowerCase();
  if (!UUID_RE.test(deviceId) || !deviceOk(deviceId)) return { id, ok: false, error: "device_not_found" };
  const type = String(rec.type || "");
  if (!ENTRY_TYPES.includes(type)) return { id, ok: false, error: "bad_type" };
  const date = ymdOk(rec.date);
  if (!date) return { id, ok: false, error: "bad_date" };
  let corrects: string | null = rec.corrects ? String(rec.corrects).toLowerCase() : null;
  if (corrects) {
    if (!UUID_RE.test(corrects) || corrects === id) return { id, ok: false, error: "bad_corrects" };
    const o = await sql`select device_id from mpbuch.entries where id = ${corrects} and tenant_id = ${tid} limit 1`;
    if (!o.length || String(o[0].device_id) !== deviceId) return { id, ok: false, error: "bad_corrects" };
  } else corrects = null;
  const persons = (Array.isArray(rec.persons) ? rec.persons : []).slice(0, 200)
    .map((p: any) => ({ id: UUID_RE.test(String(p?.id || "")) ? String(p.id).toLowerCase() : null, name: str(p?.name, 160) }))
    .filter((p: any) => p.name);
  try {
    const ins = await sql`insert into mpbuch.entries (id, tenant_id, device_id, type, date, result, performer, instructor, persons, next_due, note,
        corrects, member_id, member_name, client_id, created_at)
      values (${id}, ${tid}, ${deviceId}, ${type}, ${date}, ${strOrNull(rec.result, 500)}, ${strOrNull(rec.performer, 200)}, ${strOrNull(rec.instructor, 200)},
        ${sql.json(persons)}, ${ymdOk(rec.next_due)}, ${strOrNull(rec.note, 4000)}, ${corrects}, ${me.id}, ${str(me.name || me.email, 200)}, ${clientId}, ${isoOrNow(rec.created_at)})
      on conflict (id) do nothing returning id`;
    if (!ins.length) {
      const own = await sql`select 1 from mpbuch.entries where id = ${id} and tenant_id = ${tid} limit 1`;
      return own.length ? { id, ok: true, dup: true } : { id, ok: false, error: "bad_id" };
    }
    return { id, ok: true };
  } catch (e) {
    if ((e as any)?.code === "23505") return { id, ok: false, error: "already_corrected" };
    throw e;
  }
}

// ---------- BtM-Buch (zuschaltbares Modul) ----------
const BTM_UNITS = ["Stück", "ml", "mg", "g", "µg"];
function qty3(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  const r = Math.round(n * 1000) / 1000;
  return r >= 0 && r <= 100000000 ? r : null;
}
// Präparat = eine Karteikarte. `deleted` bedeutet hier „archiviert": die Karte bleibt lesbar.
async function upsertBtmItem(tid: string, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const name = str(rec.name, 200);
  if (!name) return { id, ok: false, error: "name_required" };
  const unit = BTM_UNITS.includes(String(rec.unit)) ? String(rec.unit) : "Stück";
  const ex = await sql`select tenant_id, unit from mpbuch.btm_items where id = ${id} limit 1`;
  if (ex.length && String(ex[0].tenant_id) !== tid) return { id, ok: false, error: "bad_id" };
  const deleted = rec.deleted === true;
  if (ex.length) {
    const b = await sql`select coalesce(sum(case when kind = 'zugang' then qty else -qty end), 0)::float8 as b, count(*)::int as n from mpbuch.btm_entries where tenant_id = ${tid} and item_id = ${id}`;
    // Mit Bestand wird nicht archiviert; die Einheit steht fest, sobald gebucht wurde.
    if (deleted && Math.abs(Number(b[0].b)) > 0.0005) return { id, ok: false, error: "btm_has_stock" };
    if (b[0].n > 0 && unit !== ex[0].unit) return { id, ok: false, error: "btm_unit_fixed" };
  }
  const upd = isoOrNow(rec.updated_at);
  await sql`insert into mpbuch.btm_items (id, tenant_id, name, form, unit, storage, note, deleted, created_at, updated_at)
    values (${id}, ${tid}, ${name}, ${strOrNull(rec.form, 200)}, ${unit}, ${strOrNull(rec.storage, 200)}, ${strOrNull(rec.note, 1000)}, ${deleted}, ${isoOrNow(rec.created_at)}, ${upd})
    on conflict (id) do update set name = excluded.name, form = excluded.form, unit = excluded.unit, storage = excluded.storage, note = excluded.note,
      deleted = excluded.deleted, updated_at = excluded.updated_at, synced_at = now()
    where mpbuch.btm_items.tenant_id = excluded.tenant_id and mpbuch.btm_items.updated_at <= excluded.updated_at`;
  if (await markStale("btm_items", tid, id, upd)) return { id, ok: true, stale: true };
  return { id, ok: true };
}

// Zu-/Abgang: nur anfügen. Je Präparat seriell (Sperre), damit der Bestand nie unter null fällt.
// Storno = Gegenbuchung mit `corrects`; Art und Menge gibt der stornierte Eintrag vor.
async function addBtmEntry(tid: string, me: any, clientId: string | null, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const itemId = String(rec.item_id || "").toLowerCase();
  if (!UUID_RE.test(itemId)) return { id, ok: false, error: "btm_item_not_found" };
  const date = ymdOk(rec.date);
  if (!date || date > todayYmd()) return { id, ok: false, error: "bad_date" };
  let kind = String(rec.kind || "");
  if (kind !== "zugang" && kind !== "abgang") return { id, ok: false, error: "bad_type" };
  let qty = qty3(rec.qty);
  const corrects: string | null = rec.corrects ? String(rec.corrects).toLowerCase() : null;
  if (corrects && (!UUID_RE.test(corrects) || corrects === id)) return { id, ok: false, error: "bad_corrects" };
  if (!corrects && (qty === null || qty <= 0)) return { id, ok: false, error: "btm_bad_qty" };
  try {
    return await sql.begin(async (tx: any): Promise<Res> => {
      await tx`select pg_advisory_xact_lock(hashtextextended(${itemId}::text, 0))`;
      const it = await tx`select deleted from mpbuch.btm_items where id = ${itemId} and tenant_id = ${tid} limit 1`;
      if (!it.length) return { id, ok: false, error: "btm_item_not_found" };
      const dup = await tx`select tenant_id, seq::float8 as seq from mpbuch.btm_entries where id = ${id} limit 1`;
      if (dup.length) return String(dup[0].tenant_id) === tid ? { id, ok: true, dup: true, seq: Number(dup[0].seq) } : { id, ok: false, error: "bad_id" };
      if (corrects) {
        const o = await tx`select item_id, kind, qty::float8 as qty, corrects from mpbuch.btm_entries where id = ${corrects} and tenant_id = ${tid} limit 1`;
        if (!o.length || String(o[0].item_id) !== itemId || o[0].corrects) return { id, ok: false, error: "bad_corrects" };
        const c = await tx`select 1 from mpbuch.btm_entries where corrects = ${corrects} limit 1`;
        if (c.length) return { id, ok: false, error: "already_corrected" };
        kind = o[0].kind === "zugang" ? "abgang" : "zugang"; qty = Number(o[0].qty);
      } else if (it[0].deleted === true) return { id, ok: false, error: "btm_item_archived" };
      const b = await tx`select coalesce(sum(case when kind = 'zugang' then qty else -qty end), 0)::float8 as b from mpbuch.btm_entries where tenant_id = ${tid} and item_id = ${itemId}`;
      if (kind === "abgang" && Number(b[0].b) - (qty as number) < -0.0005) return { id, ok: false, error: "btm_negative" };
      const ins = await tx`insert into mpbuch.btm_entries (id, tenant_id, item_id, date, kind, qty, party, doctor, doc_no, note, corrects, member_id, member_name, client_id, created_at)
        values (${id}, ${tid}, ${itemId}, ${date}, ${kind}, ${qty}, ${strOrNull(rec.party, 400)}, ${strOrNull(rec.doctor, 200)}, ${strOrNull(rec.doc_no, 80)},
          ${strOrNull(rec.note, 1000)}, ${corrects}, ${me.id}, ${str(me.name || me.email, 200)}, ${clientId}, ${isoOrNow(rec.created_at)})
        returning seq::float8 as seq`;
      return { id, ok: true, seq: Number(ins[0].seq) };
    });
  } catch (e) {
    if ((e as any)?.code === "23505") return { id, ok: false, error: "already_corrected" };
    throw e;
  }
}

// Monatliche Bestandsprüfung (nur anfügen)
async function addBtmCheck(tid: string, me: any, rec: any): Promise<Res> {
  const id = String(rec?.id || "").toLowerCase();
  if (!UUID_RE.test(id)) return { id, ok: false, error: "bad_id" };
  const itemId = String(rec.item_id || "").toLowerCase();
  if (!UUID_RE.test(itemId)) return { id, ok: false, error: "btm_item_not_found" };
  const month = String(rec.month || "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { id, ok: false, error: "bad_date" };
  const checkDate = ymdOk(rec.check_date);
  if (!checkDate || checkDate > todayYmd()) return { id, ok: false, error: "bad_date" };
  const checker = str(rec.checker, 200);
  if (!checker) return { id, ok: false, error: "name_required" };
  const balance = qty3(rec.balance);
  if (balance === null) return { id, ok: false, error: "btm_bad_qty" };
  const it = await sql`select 1 from mpbuch.btm_items where id = ${itemId} and tenant_id = ${tid} limit 1`;
  if (!it.length) return { id, ok: false, error: "btm_item_not_found" };
  const ins = await sql`insert into mpbuch.btm_checks (id, tenant_id, item_id, month, checker, check_date, balance, note, member_id, member_name, created_at)
    values (${id}, ${tid}, ${itemId}, ${month}, ${checker}, ${checkDate}, ${balance}, ${strOrNull(rec.note, 1000)}, ${me.id}, ${str(me.name || me.email, 200)}, ${isoOrNow(rec.created_at)})
    on conflict (id) do nothing returning id`;
  if (!ins.length) {
    const own = await sql`select 1 from mpbuch.btm_checks where id = ${id} and tenant_id = ${tid} limit 1`;
    return own.length ? { id, ok: true, dup: true } : { id, ok: false, error: "bad_id" };
  }
  return { id, ok: true };
}

async function safeRec(rec: any, fn: () => Promise<Res>): Promise<Res> {
  try { return await fn(); } catch (e) {
    const code = String((e as any)?.code || "");
    if (code.startsWith("22") || code.startsWith("23")) return { id: String(rec?.id || ""), ok: false, error: "bad_value" };
    throw e;
  }
}

const DEVICE_COLS = `id, inv_no, name, kind, model, serial, year, manufacturer, manufacturer_address, location_id, assignment, anlage1, anlage2,
  stk_interval_months, mtk_interval_years, commissioned::text as commissioned, decommissioned_at::text as decommissioned_at, note, deleted, created_at, updated_at`;
const ENTRY_COLS = `id, device_id, type, date::text as date, result, performer, instructor, persons, next_due::text as next_due, note,
  corrects, member_id, member_name, client_id, created_at, received_at`;

const BTM_ITEM_COLS = `id, name, form, unit, storage, note, deleted, created_at, updated_at`;
const BTM_ENTRY_COLS = `id, seq::float8 as seq, item_id, date::text as date, kind, qty::float8 as qty, party, doctor, doc_no, note,
  corrects, member_id, member_name, client_id, created_at, received_at`;
const BTM_CHECK_COLS = `id, item_id, month, checker, check_date::text as check_date, balance::float8 as balance, note, member_id, member_name, created_at, received_at`;

// ---------- Handler ----------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const c = claims(req);
  if (!c) return json({ error: "unauthorized" }, 401);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad_json" }, 400);
  const action = String(body?.action ?? "").trim();

  try {
    const me = await loadMe(c.uid);
    if (!me) return json({ ok: true, registered: false, email: c.email, error: "not_registered" }, action === "me" ? 200 : 403);
    if (!me.active) return json({ error: "member_inactive" }, 403);
    const isAdmin = me.role === "admin";
    const tid = me.tenant_id as string;
    const t = me.tenant;
    const plan = PLANS[t.plan] || PLANS.trial;

    // -------- me --------
    if (action === "me") {
      return json({ ok: true, registered: true,
        member: { id: me.id, role: me.role, name: me.name, email: me.email, active: me.active },
        tenant: tenantOut(t) });
    }

    // -------- pull: Daten (initial oder inkrementell) --------
    if (action === "pull") {
      const since = body.since ? String(body.since) : null;
      if (since && !Number.isFinite(Date.parse(since))) return json({ error: "bad_since" }, 400);
      // Cursor mit 2 Minuten Überlappung: Transaktionen, die vor now() begonnen, aber erst danach
      // committet haben, tragen ältere Zeitstempel und würden sonst übersprungen. Doppelte kommen per ID-Abgleich weg.
      const nowRow = await sql`select now() - interval '2 minutes' as t`;
      let serverTime = (nowRow[0].t as Date).toISOString();
      const locations = since
        ? await sql`select id, name, note, deleted, created_at, updated_at from mpbuch.locations where tenant_id = ${tid} and synced_at > ${since}::timestamptz`
        : await sql`select id, name, note, deleted, created_at, updated_at from mpbuch.locations where tenant_id = ${tid} and deleted = false`;
      const persons = since
        ? await sql`select id, name, note, active, deleted, created_at, updated_at from mpbuch.persons where tenant_id = ${tid} and synced_at > ${since}::timestamptz`
        : await sql`select id, name, note, active, deleted, created_at, updated_at from mpbuch.persons where tenant_id = ${tid} and deleted = false`;
      const devices = since
        ? await sql.unsafe(`select ${DEVICE_COLS} from mpbuch.devices where tenant_id = $1 and synced_at > $2::timestamptz`, [tid, since])
        : await sql.unsafe(`select ${DEVICE_COLS} from mpbuch.devices where tenant_id = $1 and deleted = false`, [tid]);
      // Das Medizinproduktebuch wird vollständig geliefert (kein Zeitfenster), seitenweise nach Eingang.
      const entries = since
        ? await sql.unsafe(`select ${ENTRY_COLS} from mpbuch.entries where tenant_id = $1 and received_at > $2::timestamptz order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid, since])
        : await sql.unsafe(`select ${ENTRY_COLS} from mpbuch.entries where tenant_id = $1 order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid]);
      // BtM-Buch: archivierte Präparate werden mitgeliefert (die Karteikarte bleibt lesbar)
      const btm_items = since
        ? await sql.unsafe(`select ${BTM_ITEM_COLS} from mpbuch.btm_items where tenant_id = $1 and synced_at > $2::timestamptz`, [tid, since])
        : await sql.unsafe(`select ${BTM_ITEM_COLS} from mpbuch.btm_items where tenant_id = $1`, [tid]);
      const btm_entries = since
        ? await sql.unsafe(`select ${BTM_ENTRY_COLS} from mpbuch.btm_entries where tenant_id = $1 and received_at > $2::timestamptz order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid, since])
        : await sql.unsafe(`select ${BTM_ENTRY_COLS} from mpbuch.btm_entries where tenant_id = $1 order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid]);
      const btm_checks = since
        ? await sql.unsafe(`select ${BTM_CHECK_COLS} from mpbuch.btm_checks where tenant_id = $1 and received_at > $2::timestamptz order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid, since])
        : await sql.unsafe(`select ${BTM_CHECK_COLS} from mpbuch.btm_checks where tenant_id = $1 order by received_at asc limit ${PULL_ENTRY_LIMIT}`, [tid]);
      // Seitenweise: der Cursor rückt nur bis zur frühesten vollen Seite vor; der Rest kommt in der nächsten Runde (doppelte fallen per ID weg)
      let more = false;
      for (const page of [entries, btm_entries, btm_checks]) {
        if (page.length < PULL_ENTRY_LIMIT) continue;
        const last = new Date((page[page.length - 1].received_at as Date).getTime() - 1).toISOString();
        if (!more || last < serverTime) serverTime = last;
        more = true;
      }
      const members = await sql`select id, name, email, role, active from mpbuch.members where tenant_id = ${tid}`;
      return json({ ok: true, server_time: serverTime, full: !since, more,
        tenant: tenantOut(t), member: { id: me.id, role: me.role, name: me.name, email: me.email },
        locations, persons, devices, entries, members, btm_items, btm_entries, btm_checks });
    }

    // -------- push: Offline-Änderungen einspielen --------
    if (action === "push") {
      const sub = subState(t);
      if (!sub.active) return json({ error: "subscription_inactive", sub, tenant: tenantOut(t) }, 402);
      const clientId = strOrNull(body.client_id, 64);
      const out: { locations: Res[]; persons: Res[]; devices: Res[]; entries: Res[]; btm_items: Res[]; btm_entries: Res[]; btm_checks: Res[] } =
        { locations: [], persons: [], devices: [], entries: [], btm_items: [], btm_entries: [], btm_checks: [] };
      const bItems = Array.isArray(body.btm_items) ? body.btm_items.slice(0, 500) : [];
      const bEnts = Array.isArray(body.btm_entries) ? body.btm_entries.slice(0, 2000) : [];
      const bChecks = Array.isArray(body.btm_checks) ? body.btm_checks.slice(0, 1000) : [];
      const btmOn = !!(t.settings && t.settings.btm === true);
      const locs = Array.isArray(body.locations) ? body.locations.slice(0, 500) : [];
      const pers = Array.isArray(body.persons) ? body.persons.slice(0, 1000) : [];
      const devs = Array.isArray(body.devices) ? body.devices.slice(0, 1000) : [];
      const ents = Array.isArray(body.entries) ? body.entries.slice(0, 2000) : [];
      const denied = (r: any): Res => ({ id: String(r?.id || ""), ok: false, error: "forbidden" });
      // Stammdaten (Standorte, Geräte) pflegt die Verwaltung; Mitarbeitende tragen ins Buch ein und legen Personen an.
      for (const l of locs) out.locations.push(isAdmin ? await safeRec(l, () => upsertLocation(tid, l)) : denied(l));
      for (const p of pers) out.persons.push(!isAdmin && p?.deleted === true ? denied(p) : await safeRec(p, () => upsertPerson(tid, p)));
      if (devs.length) {
        const okLocs = new Set<string>();
        const locIds = [...new Set(devs.map((d: any) => String(d?.location_id || "").toLowerCase()))].filter((x) => UUID_RE.test(x));
        if (locIds.length) for (const r of await sql`select id from mpbuch.locations where tenant_id = ${tid} and id = any(${locIds}::uuid[])`) okLocs.add(String(r.id));
        const cnt = await sql`select count(*)::int as n from mpbuch.devices where tenant_id = ${tid} and deleted = false`;
        let n = cnt[0].n as number;
        for (const d of devs) out.devices.push(isAdmin ? await safeRec(d, () => upsertDevice(tid, d, (id) => okLocs.has(id), () => n < plan.devices, () => { n++; })) : denied(d));
      }
      if (ents.length) {
        const okDevs = new Set<string>();
        const devIds = [...new Set(ents.map((e: any) => String(e?.device_id || "").toLowerCase()))].filter((x) => UUID_RE.test(x));
        if (devIds.length) for (const r of await sql`select id from mpbuch.devices where tenant_id = ${tid} and id = any(${devIds}::uuid[])`) okDevs.add(String(r.id));
        for (const e of ents) out.entries.push(await safeRec(e, () => addEntry(tid, me, clientId, e, (id) => okDevs.has(id))));
      }
      // BtM-Buch: Präparate legt die Verwaltung an, buchen und prüfen dürfen alle Mitglieder
      const btmOff = (r: any): Res => ({ id: String(r?.id || ""), ok: false, error: "btm_off" });
      for (const i of bItems) out.btm_items.push(!btmOn ? btmOff(i) : isAdmin ? await safeRec(i, () => upsertBtmItem(tid, i)) : denied(i));
      for (const e of bEnts) out.btm_entries.push(!btmOn ? btmOff(e) : await safeRec(e, () => addBtmEntry(tid, me, clientId, e)));
      for (const k of bChecks) out.btm_checks.push(!btmOn ? btmOff(k) : await safeRec(k, () => addBtmCheck(tid, me, k)));
      // Protokoll: Löschungen und Berichtigungen
      const okIds = (arr: Res[]) => new Set(arr.filter((r) => r.ok && !r.dup && !r.stale).map((r) => r.id));
      const okL = okIds(out.locations), okP = okIds(out.persons), okD = okIds(out.devices), okE = okIds(out.entries);
      for (const l of locs) if (l?.deleted === true && okL.has(String(l.id).toLowerCase())) await audit(tid, me, "location_deleted", { name: str(l.name, 120) });
      for (const p of pers) if (p?.deleted === true && okP.has(String(p.id).toLowerCase())) await audit(tid, me, "person_deleted", { name: str(p.name, 160) });
      for (const d of devs) if (d?.deleted === true && okD.has(String(d.id).toLowerCase())) await audit(tid, me, "device_deleted", { inv_no: str(d.inv_no, 40), name: str(d.name, 200) });
      for (const e of ents) if (e?.corrects && okE.has(String(e.id).toLowerCase())) await audit(tid, me, "entry_corrected", { entry: String(e.corrects), device_id: String(e.device_id || ""), type: String(e.type || "") });
      const okBI = okIds(out.btm_items), okBE = okIds(out.btm_entries);
      for (const i of bItems) if (i?.deleted === true && okBI.has(String(i.id).toLowerCase())) await audit(tid, me, "btm_item_archived", { name: str(i.name, 200) });
      for (const e of bEnts) if (e?.corrects && okBE.has(String(e.id).toLowerCase())) await audit(tid, me, "btm_corrected", { entry: String(e.corrects), item_id: String(e.item_id || "") });
      const nowRow = await sql`select now() as t`;
      return json({ ok: true, results: out, server_time: (nowRow[0].t as Date).toISOString() });
    }

    // -------- Team --------
    if (action === "list_members") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const rows = await sql`select id, role, name, email, active, created_at from mpbuch.members where tenant_id = ${tid} order by role, created_at`;
      return json({ ok: true, limit: plan.users, members: rows.map((m: any) => ({ ...m, created_dmy: dmy(m.created_at) })) });
    }
    if (action === "invite") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const name = str(body.name, 120);
      const email = str(body.email, 200).toLowerCase();
      // Ohne Rollen-Funktion (Starter) sind alle Nutzer gleichberechtigt
      const role = body.role === "admin" ? "admin" : "mitarbeiter";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "bad_email" }, 400);
      const cnt = await sql`select count(*)::int as n from mpbuch.members where tenant_id = ${tid} and active = true`;
      if (plan.users > 0 && cnt[0].n >= plan.users) return json({ error: "limit_users", limit: plan.users }, 400);
      const ex = await sql`select id from mpbuch.members where tenant_id = ${tid} and lower(email) = ${email} limit 1`;
      if (ex.length) return json({ error: "already_member" }, 400);
      // Bestehendes Konto (auth.users ist mit anderen Vaydena-Produkten geteilt): KEIN Passwort-Link –
      // sonst könnte ein Firmen-Admin fremde Konten übernehmen. Die Person meldet sich mit ihrem Passwort an.
      const au = await sql`select id from auth.users where lower(email) = ${email} limit 1`;
      if (au.length) {
        const uid = String(au[0].id);
        const other = await sql`select tenant_id from mpbuch.members where id = ${uid} limit 1`;
        if (other.length) return json({ error: "member_elsewhere" }, 400);
        await sql`insert into mpbuch.members (id, tenant_id, role, name, email, active, auth_created) values (${uid}, ${tid}, ${role}, ${name || null}, ${email}, true, false)`;
        const appLink = `${SITE}/app.html`;
        const resetLink = `${SITE}/anmelden.html#passwort`;
        const r = await sendMail(email, `Sie wurden zu ${PRODUCT} hinzugefügt`,
          `Guten Tag${name ? " " + name : ""},\n\n${t.name} hat Sie zu ${PRODUCT} hinzugefügt.\nSie haben bereits ein Vaydena-Konto mit dieser E-Mail-Adresse. Bitte melden Sie sich mit Ihrem bisherigen Passwort an:\n${appLink}\n\nPasswort vergessen? ${resetLink}\n\nFalls Sie das nicht erwartet haben, können Sie diese E-Mail ignorieren – ohne Ihre Anmeldung erhält niemand Zugriff auf Ihr Konto.\n\nViele Grüße\n${PRODUCT}`,
          mailShell(`Willkommen bei ${PRODUCT}`, `<p>Guten Tag${name ? " " + esc(name) : ""},</p><p><b>${esc(t.name)}</b> hat Sie zum Medizinproduktebuch hinzugefügt.</p><p>Sie haben bereits ein Vaydena-Konto mit dieser E-Mail-Adresse. Bitte melden Sie sich mit Ihrem bisherigen Passwort an.</p><p style="margin:22px 0"><a href="${esc(appLink)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Zur App</a></p><p style="font-size:13px;color:#5c7883">Passwort vergessen? <a href="${esc(resetLink)}">Neues Passwort anfordern</a></p>`));
        await audit(tid, me, "member_invited", { email, role, existing_account: true });
        return json({ ok: true, existing_account: true, emailed: !!r.ok });
      }
      const tmp = "Mp-" + randomToken(9) + "!x";
      const cr = await gotrue("admin/users", "POST", { email, password: tmp, email_confirm: true, user_metadata: { name, invited_by: t.name } });
      const uid: string | null = cr?.data?.id || null;
      if (!cr.ok || !uid) return json({ error: "auth_create_failed", detail: cr?.data?.msg || cr?.status }, 400);
      await sql`insert into mpbuch.members (id, tenant_id, role, name, email, active, auth_created) values (${uid}, ${tid}, ${role}, ${name || null}, ${email}, true, true)`;
      const token = randomToken(32);
      await sql`insert into mpbuch.auth_tokens (token_hash, user_id, email, purpose, expires_at) values (${await sha256hex(token)}, ${uid}, ${email}, 'invite', now() + interval '7 days')`;
      const link = `${SITE}/anmelden.html?invite=${token}`;
      const r = await sendMail(email, `Ihr Zugang zu ${PRODUCT}`,
        `Guten Tag${name ? " " + name : ""},\n\n${t.name} hat Sie zu ${PRODUCT} eingeladen.\nBitte legen Sie hier Ihr Passwort fest (Link 7 Tage gültig):\n${link}\n\nDanach starten Sie die App unter ${SITE}/app.html\n\nViele Grüße\n${PRODUCT}`,
        mailShell(`Willkommen bei ${PRODUCT}`, `<p>Guten Tag${name ? " " + esc(name) : ""},</p><p><b>${esc(t.name)}</b> hat Sie zum Medizinproduktebuch eingeladen.</p><p style="margin:22px 0"><a href="${esc(link)}" style="background:#0e6f6b;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">Passwort festlegen &amp; anmelden</a></p><p style="font-size:13px;color:#5c7883">Link (7 Tage gültig):<br><span style="word-break:break-all">${esc(link)}</span></p>`));
      await audit(tid, me, "member_invited", { email, role });
      return json({ ok: true, invite_link: link, emailed: !!r.ok });
    }
    if (action === "set_member") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const mid = String(body.member_id || "").toLowerCase();
      if (!UUID_RE.test(mid)) return json({ error: "bad_member" }, 400);
      if (mid === me.id) return json({ error: "cannot_edit_self" }, 400);
      const row = await sql`select id, email, role, active from mpbuch.members where id = ${mid} and tenant_id = ${tid} limit 1`;
      if (!row.length) return json({ error: "not_found" }, 404);
      const role = body.role === "admin" ? "admin" : (body.role === "mitarbeiter" ? "mitarbeiter" : null);
      const active = typeof body.active === "boolean" ? body.active : null;
      // Bestehende Mitarbeiter-Rollen bleiben nach einem Tarifwechsel erhalten; neu vergeben lässt sich ohne Rollen nur Administrator
      if (role !== null) await sql`update mpbuch.members set role = ${role}, updated_at = now() where id = ${mid}`;
      if (active === true) {
        const cnt = await sql`select count(*)::int as n from mpbuch.members where tenant_id = ${tid} and active = true and id <> ${mid}`;
        if (plan.users > 0 && cnt[0].n >= plan.users) return json({ error: "limit_users", limit: plan.users }, 400);
      }
      if (active !== null) await sql`update mpbuch.members set active = ${active}, updated_at = now() where id = ${mid}`;
      const ch: Record<string, unknown> = { email: row[0].email };
      if (role !== null && role !== row[0].role) ch.role = role;
      if (active !== null && active !== row[0].active) ch.active = active;
      if (Object.keys(ch).length > 1) await audit(tid, me, "member_changed", ch);
      return json({ ok: true });
    }
    if (action === "remove_member") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const mid = String(body.member_id || "").toLowerCase();
      if (!UUID_RE.test(mid)) return json({ error: "bad_member" }, 400);
      if (mid === me.id) return json({ error: "cannot_remove_self" }, 400);
      const row = await sql`select id, email from mpbuch.members where id = ${mid} and tenant_id = ${tid} limit 1`;
      if (!row.length) return json({ error: "not_found" }, 404);
      const deletable = await authDeletable(mid);
      await sql`delete from mpbuch.members where id = ${mid} and tenant_id = ${tid}`;
      await sql`update mpbuch.auth_tokens set used_at = now() where user_id = ${mid} and used_at is null`;
      if (deletable) { try { await gotrue(`admin/users/${mid}`, "DELETE"); } catch (_e) { /* ignore */ } }
      await audit(tid, me, "member_removed", { email: row[0].email });
      return json({ ok: true });
    }

    // -------- Firma / Einstellungen --------
    if (action === "update_company") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const name = body.name !== undefined ? str(body.name, 200) : null;
      if (name !== null && name.length < 2) return json({ error: "bad_name" }, 400);
      const prefix = body.inv_prefix !== undefined ? str(body.inv_prefix, 8).toUpperCase().replace(/[^A-Z0-9]/g, "") : null;
      if (prefix !== null && !prefix) return json({ error: "bad_prefix" }, 400);
      let billing: any = null;
      if (body.billing && typeof body.billing === "object") {
        const b = body.billing;
        billing = { recipient: str(b.recipient, 200), street: str(b.street, 200), zip: str(b.zip, 20), city: str(b.city, 120), email: str(b.email, 200).toLowerCase() };
        if (billing.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(billing.email)) return json({ error: "bad_email" }, 400);
      }
      let settings: any = null;
      if (body.settings && typeof body.settings === "object") {
        const s = body.settings;
        const old = (t.settings && typeof t.settings === "object") ? t.settings : {};
        const has = (k: string) => Object.prototype.hasOwnProperty.call(s, k);
        const mailTo = has("due_mail_to") ? str(s.due_mail_to, 200).toLowerCase() : (old.due_mail_to || "");
        if (mailTo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mailTo)) return json({ error: "bad_email" }, 400);
        const dd = has("due_days") ? Number(s.due_days) : Number(old.due_days ?? 30);
        // Nur übergebene Schlüssel ändern – ältere App-Versionen löschen so keine neuen Einstellungen
        settings = {
          ...old,
          site: has("site") ? str(s.site, 200) : (old.site || ""),
          due_mail: has("due_mail") ? s.due_mail === true : old.due_mail === true,
          due_mail_to: mailTo,
          due_days: Number.isFinite(dd) ? Math.max(1, Math.min(180, Math.round(dd))) : 30,
          btm: has("btm") ? s.btm === true : old.btm === true,
        };
      }
      if (name !== null) await sql`update mpbuch.tenants set name = ${name}, updated_at = now() where id = ${tid}`;
      if (prefix !== null) await sql`update mpbuch.tenants set inv_prefix = ${prefix}, updated_at = now() where id = ${tid}`;
      if (billing !== null) await sql`update mpbuch.tenants set billing = ${sql.json(billing)}, updated_at = now() where id = ${tid}`;
      if (settings !== null) await sql`update mpbuch.tenants set settings = ${sql.json(settings)}, updated_at = now() where id = ${tid}`;
      const changed = [name !== null && name !== t.name ? "name" : "", prefix !== null && prefix !== t.inv_prefix ? "inv_prefix" : "", billing !== null ? "billing" : "", settings !== null ? "settings" : ""].filter(Boolean);
      if (settings !== null && settings.btm !== ((t.settings || {}).btm === true)) await audit(tid, me, settings.btm ? "btm_enabled" : "btm_disabled", {});
      if (changed.length) await audit(tid, me, "company_changed", { fields: changed, ...(changed.includes("name") ? { name } : {}) });
      const fresh = await loadMe(c.uid);
      return json({ ok: true, tenant: tenantOut(fresh!.tenant) });
    }

    // -------- Abo / Rechnungen --------
    if (action === "choose_plan") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const p = String(body.plan || "");
      const period = String(body.period || "monat") === "jahr" ? "jahr" : "monat";
      if (!["starter", "team"].includes(p)) return json({ error: "bad_plan" }, 400);
      const open = await sql`select count(*)::int as n from mpbuch.invoices where tenant_id = ${tid} and status = 'open'`;
      if (open[0].n >= 3) return json({ error: "too_many_open" }, 400);
      const inv = await createInvoice(tid, p, period);
      await audit(tid, me, "plan_chosen", { plan: p, period, invoice: inv.number });
      return json({ ok: true, invoice: inv });
    }
    if (action === "my_invoices") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const rows = await sql`select number, access_token, plan, period, amount_cents, status, issued_at, due_date, paid_at from mpbuch.invoices where tenant_id = ${tid} order by created_at desc`;
      return json({ ok: true, invoices: rows.map((r: any) => ({
        number: r.number, access_token: r.access_token, plan: r.plan, plan_label: (PLANS[r.plan] || {}).label || r.plan, period: r.period,
        amount_cents: r.amount_cents, status: r.status, issued_dmy: dmy(r.issued_at), due_dmy: dmy(r.due_date), paid_dmy: dmy(r.paid_at) })) });
    }

    // -------- Export (alles als JSON, auch Gelöschtes und außer Betrieb Genommenes) --------
    if (action === "export") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const locations = await sql`select id, name, note, deleted, created_at, updated_at from mpbuch.locations where tenant_id = ${tid}`;
      const persons = await sql`select id, name, note, active, deleted, created_at, updated_at from mpbuch.persons where tenant_id = ${tid}`;
      const devices = await sql.unsafe(`select ${DEVICE_COLS} from mpbuch.devices where tenant_id = $1 order by inv_no`, [tid]);
      const entries = await sql.unsafe(`select ${ENTRY_COLS} from mpbuch.entries where tenant_id = $1 order by date, created_at`, [tid]);
      const btm_items = await sql.unsafe(`select ${BTM_ITEM_COLS} from mpbuch.btm_items where tenant_id = $1 order by name`, [tid]);
      const btm_entries = await sql.unsafe(`select ${BTM_ENTRY_COLS} from mpbuch.btm_entries where tenant_id = $1 order by seq`, [tid]);
      const btm_checks = await sql.unsafe(`select ${BTM_CHECK_COLS} from mpbuch.btm_checks where tenant_id = $1 order by month, received_at`, [tid]);
      return json({ ok: true, exported_at: new Date().toISOString(), tenant: { id: tid, name: t.name }, locations, persons, devices, entries, btm_items, btm_entries, btm_checks });
    }

    // -------- Protokoll --------
    if (action === "list_audit") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const before = Number(body.before) > 0 ? Math.floor(Number(body.before)) : null;
      const rows = before
        ? await sql`select id, actor, action, detail, created_at from mpbuch.audit where tenant_id = ${tid} and id < ${before} order by id desc limit 100`
        : await sql`select id, actor, action, detail, created_at from mpbuch.audit where tenant_id = ${tid} order by id desc limit 100`;
      return json({ ok: true, entries: rows.map((r: any) => ({ ...r, id: Number(r.id) })), more: rows.length === 100 });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    try { console.error("mpb-api", action, String((e as any)?.message || e)); } catch (_e) { /* */ }
    return json({ error: "server_error" }, 500);
  }
});
