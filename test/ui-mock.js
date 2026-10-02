// UI-Test ohne echtes Backend: puppeteer-core + installiertes Chrome (headless) gegen einen lokalen
// Static-Server. Supabase-Aufrufe werden abgefangen und von einer Attrappe beantwortet (leerer Mandant,
// jeder Push wird bestätigt). Prüft: alle Seiten laden ohne Skriptfehler, Gerät anlegen, Eintrag anlegen,
// alle App-Ansichten, QR-Deep-Link. Aufruf: node test/ui-mock.js   (Screenshots in test/out/shots/)
// puppeteer-core: PUPPETEER=<Pfad> setzen oder in test/out installieren (npm i --prefix test/out puppeteer-core).
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const puppeteer = require(process.env.PUPPETEER || "./out/node_modules/puppeteer-core");

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "out", "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const STORAGE_KEY = "sb-xeuexovdipdiiuzjpzkj-auth-token";
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8"
};
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p === "/") p = "/index.html";
      const file = path.normalize(path.join(ROOT, p));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("404"); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 86400;
const USER = { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "test@example.org", app_metadata: {}, user_metadata: {} };
const SESSION = { access_token: b64({ alg: "HS256", typ: "JWT" }) + "." + b64({ sub: USER.id, exp, role: "authenticated", email: USER.email }) + ".sig",
  token_type: "bearer", expires_in: 86400, expires_at: exp, refresh_token: "mock-refresh", user: USER };
const trialEnd = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
const TENANT = { id: "00000000-0000-4000-8000-0000000000aa", name: "Testpraxis", plan: "trial", plan_label: "Test", status: "aktiv",
  trial_ends_at: trialEnd, trial_ends_dmy: trialEnd.split("-").reverse().join("."), paid_until: null, paid_until_dmy: null,
  billing: {}, inv_prefix: "MP", settings: {}, contact_email: USER.email, limits: { users: null, devices: 1000 },
  sub: { active: true, reason: null, days_left: 14, until: trialEnd } };
const ME = { id: "00000000-0000-4000-8000-0000000000bb", role: "admin", name: "Test Admin", email: USER.email };
const pushed = { locations: 0, persons: 0, devices: 0, entries: 0 };
const unknown = new Set();

function mockApi(body) {
  const now = new Date().toISOString();
  const a = body.action;
  if (a === "pull") return { ok: true, server_time: now, full: !body.since, more: false, tenant: TENANT, member: ME,
    locations: [], persons: [], devices: [], entries: [], members: [Object.assign({ active: true }, ME)] };
  if (a === "push") {
    const res = {};
    for (const k of Object.keys(pushed)) { res[k] = (body[k] || []).map((x) => ({ id: x.id, ok: true })); pushed[k] += res[k].length; }
    return { ok: true, results: res, server_time: now };
  }
  if (a === "list_members") return { ok: true, members: [Object.assign({ active: true, created_dmy: "02.10.2026" }, ME)] };
  if (a === "list_audit") return { ok: true, audit: [], rows: [], more: false };
  if (a === "my_invoices") return { ok: true, invoices: [] };
  unknown.add(a);
  return { ok: true };
}

(async () => {
  const srv = await serve();
  const base = "http://127.0.0.1:" + srv.address().port + "/";
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
  const errors = [];
  let fail = 0;
  const check = (ok, what) => { console.log((ok ? "  ok   " : "  FEHL ") + what); if (!ok) fail++; };

  async function newPage(tag, loggedIn) {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on("pageerror", (e) => errors.push(tag + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(tag + " console: " + m.text().slice(0, 300)); });
    page.on("dialog", (d) => d.accept());
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.startsWith(base)) return req.continue();
      const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "*" };
      if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors });
      const send = (o, status) => req.respond({ status: status || 200, headers: cors, contentType: "application/json", body: JSON.stringify(o) });
      if (/\/functions\/v1\/mpb-api/.test(u)) { let b = {}; try { b = JSON.parse(req.postData() || "{}"); } catch (e) {} return send(mockApi(b)); }
      if (/\/functions\/v1\//.test(u)) return send({ error: "not_found" }, 404);
      if (/\/auth\/v1\/user/.test(u)) return send(USER);
      if (/\/auth\/v1\/token/.test(u)) return send(SESSION);
      if (/\/auth\/v1\//.test(u)) return send({});
      return req.abort();   // keine echten Aufrufe nach außen
    });
    if (loggedIn) await page.evaluateOnNewDocument((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, STORAGE_KEY, JSON.stringify(SESSION));
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + ".png") });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- 1) öffentliche Seiten ----------
  console.log("Öffentliche Seiten");
  for (const f of ["index.html", "anmelden.html", "registrieren.html", "zahlung.html", "betreiber.html", "impressum.html", "agb.html", "datenschutz.html"]) {
    const page = await newPage(f, false);
    const before = errors.length;
    const r = await page.goto(base + f, { waitUntil: "load" });
    await wait(600);
    const info = await page.evaluate(() => ({ title: document.title, text: document.body.innerText.length, wide: document.documentElement.scrollWidth > window.innerWidth + 1,
      lager: /Lagerverwaltung|Vaydena Lager|Lagerort|Barcode-Etikett/.test(document.body.innerText) }));
    check(r.status() === 200 && info.text > 100 && errors.length === before, f + " lädt (" + info.title + ")");
    check(!info.wide, f + " ohne horizontales Scrollen bei 390 px");
    check(!info.lager, f + " ohne Lager-Reste im sichtbaren Text");
    await shot(page, "seite-" + f.replace(".html", ""));
    await page.close();
  }

  // ---------- 2) App mit Attrappe ----------
  console.log("App");
  const page = await newPage("app", true);
  await page.goto(base + "app.html", { waitUntil: "load" });
  await page.waitForFunction(() => window.MPApp && document.querySelector("#view") && document.querySelector("#view").innerText.length > 20, { timeout: 20000 }).catch(() => {});
  await wait(1200);
  check(/app\.html/.test(page.url()), "App bleibt angemeldet (keine Umleitung zur Anmeldung): " + page.url().replace(base, ""));
  await page.evaluate(() => { const b = document.querySelector('[data-act="modal-close"]'); if (b) b.click(); });
  await shot(page, "app-uebersicht");

  // Gerät anlegen
  await page.evaluate(() => { location.hash = "#geraete/neu"; });
  await page.waitForSelector('form[data-form="device"]', { timeout: 8000 }).catch(() => {});
  const hasForm = await page.$('form[data-form="device"]');
  check(!!hasForm, "Geräteformular erscheint");
  if (hasForm) {
    await page.type('form[data-form="device"] [name="name"]', "Defibrillator Testgerät");
    await page.$eval('form[data-form="device"] [name="inv_no"]', (el) => { el.value = "MP-0001"; });
    await page.type('form[data-form="device"] [name="manufacturer"]', "Beispiel GmbH");
    await page.$eval('form[data-form="device"] [name="commissioned"]', (el) => { el.value = "2025-01-15"; });
    await page.click('form[data-form="device"] [name="anlage1"]');
    await shot(page, "app-geraet-neu");
    await page.click('form[data-form="device"] button[type="submit"]');
    await wait(1500);
    const txt = await page.evaluate(() => document.querySelector("#view").innerText);
    check(/Defibrillator Testgerät/.test(txt) && /MP-0001/.test(txt), "Gerät gespeichert und Detailseite zeigt es");
    check(/STK/.test(txt), "Detailseite zeigt STK-Frist");
    await shot(page, "app-geraet-detail");

    // Eintrag anlegen (erste angebotene Eintragsart)
    const kinds = await page.$$eval('[data-act="entry-new"]', (els) => els.map((e) => (e.getAttribute("data-kind") || "") + ":" + e.innerText.trim()));
    console.log("  Eintragsarten:", kinds.join(" | ") || "–");
    if (kinds.length) {
      await page.click('[data-act="entry-new"]');
      await page.waitForSelector('form[data-form="entry"]', { timeout: 8000 }).catch(() => {});
      const ef = await page.$('form[data-form="entry"]');
      check(!!ef, "Eintragsformular erscheint");
      if (ef) {
        await page.$$eval('form[data-form="entry"] input, form[data-form="entry"] select, form[data-form="entry"] textarea', (els) => els.forEach((el) => {
          if (el.name === "next_due" || el.type === "hidden" || el.type === "checkbox" || el.type === "radio" || el.value) return;
          if (el.tagName === "SELECT") { const o = Array.from(el.options).find((x) => x.value); if (o) el.value = o.value; }
          else if (el.type === "date") el.value = new Date().toISOString().slice(0, 10);
          else if (el.type === "number") el.value = "1";
          else el.value = "Testeintrag";
        }));
        await shot(page, "app-eintrag-neu");
        await page.click('form[data-form="entry"] button[type="submit"]');
        await wait(1500);
        const t2 = await page.evaluate(() => document.querySelector("#view").innerText);
        check(/Testeintrag/.test(t2) || !(await page.$('form[data-form="entry"]')), "Eintrag gespeichert");
        await shot(page, "app-buch");
      }
    } else check(false, "Schaltfläche für neuen Eintrag vorhanden");
    await wait(2500);
    check(pushed.devices >= 1, "Gerät wurde an die Attrappe übertragen (" + pushed.devices + ")");
    check(pushed.entries >= 1, "Eintrag wurde an die Attrappe übertragen (" + pushed.entries + ")");
  }

  // alle Ansichten
  for (const v of ["uebersicht", "fristen", "geraete", "scan", "personen", "standorte", "etiketten", "team", "protokoll", "firma", "konto"]) {
    const before = errors.length;
    await page.evaluate((h) => { location.hash = "#" + h; }, v);
    await wait(900);
    const st = await page.evaluate(() => ({ len: document.querySelector("#view").innerText.length, wide: document.documentElement.scrollWidth > window.innerWidth + 1 }));
    check(st.len > 20 && errors.length === before, "Ansicht #" + v + " (" + st.len + " Zeichen)");
    check(!st.wide, "Ansicht #" + v + " ohne horizontales Scrollen");
    await shot(page, "app-" + v);
  }

  // QR-Deep-Link
  await page.goto(base + "app.html#g=MP-0001", { waitUntil: "load" });
  await wait(2500);
  const t3 = await page.evaluate(() => (document.querySelector("#view") || document.body).innerText);
  check(/Defibrillator Testgerät/.test(t3), "QR-Deep-Link #g=MP-0001 öffnet das Gerät (" + page.url().replace(base, "") + ")");
  await shot(page, "app-deeplink");

  await browser.close(); srv.close();
  if (unknown.size) console.log("Attrappe: unbekannte Aktionen:", Array.from(unknown).join(", "));
  if (errors.length) { console.log("Skriptfehler:"); errors.forEach((e) => console.log("  " + e)); }
  console.log(fail || errors.length ? "ERGEBNIS: " + fail + " Prüfungen fehlgeschlagen, " + errors.length + " Skriptfehler" : "ERGEBNIS: alles ok");
  process.exit(fail || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
