/* Vaydena Medizinproduktebuch — lokaler Datenspeicher (IndexedDB) + abgeleitete Fristen.
   Offline-first: Standorte, Personen, Geräte, die Einträge des Medizinproduktebuchs und die
   Warteschlange (Outbox) liegen auf dem Gerät. window.MPStore */
(function () {
  "use strict";
  var DB_NAME = "vaydena-mpbuch", DB_VER = 1, KV = "kv";
  var db = null, memOnly = false, mem = {};

  // ---------- IndexedDB Key-Value ----------
  function open() {
    return new Promise(function (resolve) {
      if (!("indexedDB" in window)) { memOnly = true; return resolve(null); }
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { memOnly = true; return resolve(null); }
      req.onupgradeneeded = function () { var d = req.result; if (!d.objectStoreNames.contains(KV)) d.createObjectStore(KV); };
      req.onsuccess = function () { db = req.result; db.onversionchange = function () { try { db.close(); } catch (e) {} }; resolve(db); };
      req.onerror = function () { memOnly = true; S.storageError = "open"; resolve(null); };
      // blockiert = ein anderer Tab hält eine ältere Version offen; kurz warten statt sofort nur im Speicher zu arbeiten
      req.onblocked = function () { setTimeout(function () { if (!db) { memOnly = true; S.storageError = "blocked"; resolve(null); } }, 3000); };
    });
  }
  function kvGet(key) {
    if (memOnly || !db) return Promise.resolve(mem[key]);
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readonly"), r = tx.objectStore(KV).get(key);
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve(undefined); };
      } catch (e) { resolve(undefined); }
    });
  }
  var frozen = false;   // Tab hat an einen anderen Tab abgegeben: nichts mehr schreiben
  function kvSet(key, val) {
    if (frozen) return Promise.resolve();
    if (memOnly || !db) { mem[key] = val; return Promise.resolve(); }
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readwrite");
        tx.objectStore(KV).put(val, key);
        tx.oncomplete = function () { if (S.storageError === "write") { S.storageError = null; emit("storage", null); } resolve(); };
        tx.onerror = function () { writeFailed(); resolve(); };
        tx.onabort = function () { writeFailed(); resolve(); };
      } catch (e) { writeFailed(); resolve(); }
    });
  }
  // Schreibfehler (z. B. Speicher voll) nicht still schlucken: die App zeigt einen Hinweis
  function writeFailed() { if (S.storageError !== "write") { S.storageError = "write"; emit("storage", "write"); } }
  function kvClear() {
    if (frozen) return Promise.resolve();
    mem = {};
    if (memOnly || !db) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(KV, "readwrite");
        tx.objectStore(KV).clear();
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  // ---------- Zustand ----------
  var S = {
    ready: false, persistent: true, persisted: null, storageError: null,
    tenant: null, member: null, members: [],
    locations: new Map(), persons: new Map(), devices: new Map(),
    entries: new Map(),     // id -> bestätigter Eintrag des Medizinproduktebuchs
    pending: [],            // wartende Einträge (in Reihenfolge)
    outbox: [],             // {kind:'location'|'person'|'device', id, ts, error?}
    failed: [],             // abgelehnte Einträge (zur Anzeige)
    // Modul BtM-Buch (nur wenn in den Einstellungen zugeschaltet)
    btmItems: new Map(),    // Präparate (Karteikarten); deleted = archiviert, bleibt lesbar
    btmEntries: new Map(),  // bestätigte Zu- und Abgänge
    btmPending: [],         // wartende Zu- und Abgänge (in Reihenfolge)
    btmChecks: new Map(),   // bestätigte Monatsprüfungen
    btmChecksPending: [],
    btmFailed: [],          // abgelehnte BtM-Einträge und -Prüfungen (zur Anzeige)
    meta: { user_id: null, since: null, device_id: null, last_sync: null }
  };
  var idx = null;           // abgeleiteter Index (Einträge je Gerät, berichtigte Einträge)
  var listeners = {};
  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach(function (f) { try { f(data); } catch (e) { console.error(e); } }); }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256 | 0; });
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    var h = Array.prototype.map.call(b, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
  }
  function nowIso() { return new Date().toISOString(); }
  // Kalendertag in Ortszeit (nicht UTC, sonst springt das Datum kurz nach Mitternacht zurück)
  function today() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }

  // ---------- Persistenz (gebündelt) ----------
  var dirty = {}, saveTimer = null;
  function toArr(m) { return Array.from(m.values()); }
  function snapshot(key) {
    switch (key) {
      case "locations": return toArr(S.locations);
      case "persons": return toArr(S.persons);
      case "devices": return toArr(S.devices);
      case "entries": return toArr(S.entries);
      case "pending": return S.pending.slice();
      case "outbox": return S.outbox.slice();
      case "failed": return S.failed.slice();
      case "btmItems": return toArr(S.btmItems);
      case "btmEntries": return toArr(S.btmEntries);
      case "btmPending": return S.btmPending.slice();
      case "btmChecks": return toArr(S.btmChecks);
      case "btmChecksPending": return S.btmChecksPending.slice();
      case "btmFailed": return S.btmFailed.slice();
      case "members": return S.members.slice();
      case "tenant": return S.tenant;
      case "member": return S.member;
      case "meta": return S.meta;
    }
    return null;
  }
  function flush() {
    var keys = Object.keys(dirty); dirty = {};
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return Promise.all(keys.map(function (k) { return kvSet(k, snapshot(k)); }));
  }
  function save(keys, immediate) {
    (Array.isArray(keys) ? keys : [keys]).forEach(function (k) { dirty[k] = true; });
    if (immediate) return flush();
    if (!saveTimer) saveTimer = setTimeout(flush, 400);
    return Promise.resolve();
  }
  function markDirty(keys) { keys.forEach(function (k) { dirty[k] = true; }); }

  // ---------- Laden / Initialisieren ----------
  function fromArr(arr) { var m = new Map(); (arr || []).forEach(function (r) { m.set(r.id, r); }); return m; }
  function init(userId) {
    return open().then(function () {
      S.persistent = !memOnly;
      // Browser um dauerhaften Speicher bitten (sonst darf er Offline-Daten bei Platzmangel löschen)
      try {
        if (!memOnly && navigator.storage && navigator.storage.persisted) {
          navigator.storage.persisted().then(function (p) { return p || !navigator.storage.persist ? p : navigator.storage.persist(); })
            .then(function (p) { S.persisted = !!p; }).catch(function () {});
        }
      } catch (e) {}
      return kvGet("meta");
    }).then(function (meta) {
      if (meta && meta.user_id && userId && meta.user_id !== userId) {
        // anderer Nutzer auf diesem Gerät -> lokale Daten gehören ihm nicht.
        // Nicht übertragene Einträge/Änderungen des Vorgängers aber zurücklegen (gemeinsam genutzte Tablets),
        // sie kommen bei seiner nächsten Anmeldung wieder in die Warteschlange.
        var old = meta.user_id;
        return Promise.all([kvGet("pending"), kvGet("outbox"), kvGet("failed"), kvGet("parked"), kvGet("locations"), kvGet("persons"), kvGet("devices"), kvGet("btmItems"), kvGet("btmPending"), kvGet("btmChecksPending")]).then(function (r) {
          var parked = r[3] || {}, p = parked[old] || { pending: [], outbox: [], failed: [], records: [] };
          p.btmPending = (p.btmPending || []).concat(r[8] || []); p.btmChecksPending = (p.btmChecksPending || []).concat(r[9] || []);
          var ob = r[1] || [];
          p.pending = p.pending.concat(r[0] || []); p.outbox = p.outbox.concat(ob); p.failed = p.failed.concat(r[2] || []);
          // die zur Outbox gehörenden Stammdatensätze mit zurücklegen, sonst gingen offline angelegte Geräte verloren
          var src = { location: fromArr(r[4]), person: fromArr(r[5]), device: fromArr(r[6]), btm_item: fromArr(r[7]) };
          p.records = (p.records || []).concat(ob.map(function (o) { var rec = src[o.kind] && src[o.kind].get(o.id); return rec ? { kind: o.kind, rec: rec } : null; }).filter(Boolean));
          if (p.pending.length || p.outbox.length || p.failed.length || p.btmPending.length || p.btmChecksPending.length) parked[old] = p;
          return kvClear().then(function () { return kvSet("parked", parked); }).then(function () { return null; });
        });
      }
      return meta || null;
    }).then(function (meta) {
      if (meta) S.meta = Object.assign(S.meta, meta);
      S.meta.user_id = userId || S.meta.user_id;
      if (!S.meta.device_id) S.meta.device_id = "dev-" + uuid().slice(0, 8);
      return Promise.all([kvGet("tenant"), kvGet("member"), kvGet("members"), kvGet("locations"), kvGet("persons"), kvGet("devices"), kvGet("entries"), kvGet("pending"), kvGet("outbox"), kvGet("failed"),
        kvGet("btmItems"), kvGet("btmEntries"), kvGet("btmPending"), kvGet("btmChecks"), kvGet("btmChecksPending"), kvGet("btmFailed")]);
    }).then(function (r) {
      S.tenant = r[0] || null; S.member = r[1] || null; S.members = r[2] || [];
      S.locations = fromArr(r[3]); S.persons = fromArr(r[4]); S.devices = fromArr(r[5]); S.entries = fromArr(r[6]);
      S.pending = r[7] || []; S.outbox = r[8] || []; S.failed = r[9] || [];
      S.btmItems = fromArr(r[10]); S.btmEntries = fromArr(r[11]); S.btmPending = r[12] || [];
      S.btmChecks = fromArr(r[13]); S.btmChecksPending = r[14] || []; S.btmFailed = r[15] || [];
      return kvGet("parked");
    }).then(function (parked) {
      var mine = parked && S.meta.user_id && parked[S.meta.user_id];
      var restore = Promise.resolve();
      if (mine) {
        // zurückgelegte Daten dieses Nutzers wieder einreihen (Einträge sind per ID idempotent)
        var ids = {}; S.pending.forEach(function (m) { ids[m.id] = true; });
        S.pending = S.pending.concat(mine.pending.filter(function (m) { return !ids[m.id]; }));
        S.failed = S.failed.concat(mine.failed);
        var bids = {}; S.btmPending.concat(S.btmChecksPending).forEach(function (m) { bids[m.id] = true; });
        S.btmPending = S.btmPending.concat((mine.btmPending || []).filter(function (m) { return !bids[m.id]; }));
        S.btmChecksPending = S.btmChecksPending.concat((mine.btmChecksPending || []).filter(function (m) { return !bids[m.id]; }));
        (mine.records || []).forEach(function (x) {
          var map = mapOf(x.kind);
          if (map && !map.has(x.rec.id)) map.set(x.rec.id, x.rec);
        });
        mine.outbox.forEach(function (o) { if (!hasPendingChange(o.kind, o.id)) S.outbox.push(o); });
        delete parked[S.meta.user_id];
        restore = kvSet("parked", parked).then(function () { return save(["pending", "outbox", "failed", "locations", "persons", "devices", "btmItems", "btmPending", "btmChecksPending"], true); });
      }
      S.ready = true; idx = null;
      return restore.then(function () { return save("meta", true); });
    });
  }
  function clearAll() {
    var dev = S.meta.device_id;
    S.tenant = null; S.member = null; S.members = [];
    S.locations = new Map(); S.persons = new Map(); S.devices = new Map(); S.entries = new Map();
    S.pending = []; S.outbox = []; S.failed = [];
    S.btmItems = new Map(); S.btmEntries = new Map(); S.btmPending = []; S.btmChecks = new Map(); S.btmChecksPending = []; S.btmFailed = [];
    S.meta = { user_id: S.meta.user_id, since: null, device_id: dev, last_sync: null };
    dirty = {}; idx = null;
    // zurückgelegte Einträge anderer Nutzer dieses Geräts nicht mitlöschen
    return kvGet("parked").then(function (parked) {
      return kvClear().then(function () { return parked && Object.keys(parked).length ? kvSet("parked", parked) : null; });
    }).then(function () { return save("meta", true); });
  }

  // ---------- Stammdaten (lokale Änderungen -> Outbox) ----------
  var KEYS = { location: "locations", person: "persons", device: "devices", btm_item: "btmItems" };
  function mapOf(kind) { return kind === "location" ? S.locations : kind === "person" ? S.persons : kind === "device" ? S.devices : kind === "btm_item" ? S.btmItems : null; }
  function queue(kind, id) {
    var e = S.outbox.find(function (o) { return o.kind === kind && o.id === id; });
    if (e) { e.ts = nowIso(); delete e.error; delete e.error_at; }
    else S.outbox.push({ kind: kind, id: id, ts: nowIso() });
  }
  function hasPendingChange(kind, id) { return S.outbox.some(function (o) { return o.kind === kind && o.id === id; }); }
  function upsert(kind, rec) {
    rec.updated_at = nowIso(); if (!rec.created_at) rec.created_at = rec.updated_at;
    rec.deleted = !!rec.deleted;
    if (kind === "person" && rec.active == null) rec.active = true;
    mapOf(kind).set(rec.id, rec); queue(kind, rec.id); idx = null;
    return save([KEYS[kind], "outbox"], true).then(function () { emit("change", { kind: kind, id: rec.id }); return rec; });
  }
  function remove(kind, id) {
    var rec = mapOf(kind).get(id); if (!rec) return Promise.resolve();
    rec.deleted = true; rec.updated_at = nowIso(); queue(kind, id); idx = null;
    return save([KEYS[kind], "outbox"], true).then(function () { emit("change", { kind: kind, id: id }); });
  }
  function dropOutbox(entry, discardRecord) {
    S.outbox = S.outbox.filter(function (o) { return !(o.kind === entry.kind && o.id === entry.id); });
    if (discardRecord) { var m = mapOf(entry.kind); if (m) m.delete(entry.id); idx = null; }
    return save(["outbox", "locations", "persons", "devices", "btmItems"], true).then(function () { emit("change", { kind: "outbox" }); });
  }

  // ---------- Einträge des Medizinproduktebuchs ----------
  // Einträge werden nie geändert oder gelöscht; eine Korrektur ist ein neuer Eintrag, der auf den alten verweist.
  function addPending(e) {
    e.pending = true; S.pending.push(e); idx = null;
    return save("pending", true).then(function () { emit("change", { kind: "entry", id: e.id }); return e; });
  }
  function confirmEntry(id, receivedAt) {
    var i = S.pending.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    var e = S.pending.splice(i, 1)[0]; delete e.pending;
    e.received_at = receivedAt || nowIso();
    S.entries.set(e.id, e); idx = null;
    markDirty(["pending", "entries"]);
  }
  function rejectEntry(id, error) {
    var i = S.pending.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    var e = S.pending.splice(i, 1)[0]; e.error = error; e.failed_at = nowIso(); delete e.pending;
    S.failed.unshift(e); if (S.failed.length > 50) S.failed.length = 50;
    idx = null; markDirty(["pending", "failed"]);
  }
  function clearFailed() { S.failed = []; S.btmFailed = []; return save(["failed", "btmFailed"], true); }

  // ---------- BtM-Buch: Zu- und Abgänge, Monatsprüfungen (nur anfügen) ----------
  function btmList(what) { return what === "check" ? S.btmChecksPending : S.btmPending; }
  function btmKeys(what) { return what === "check" ? ["btmChecksPending", "btmChecks"] : ["btmPending", "btmEntries"]; }
  function addBtmPending(what, e) {
    e.pending = true; btmList(what).push(e); idx = null;
    return save(btmKeys(what)[0], true).then(function () { emit("change", { kind: "btm_" + what, id: e.id }); return e; });
  }
  function confirmBtm(what, id, receivedAt, seq) {
    var l = btmList(what), i = l.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    var e = l.splice(i, 1)[0]; delete e.pending;
    e.received_at = receivedAt || nowIso(); if (seq != null) e.seq = seq;
    (what === "check" ? S.btmChecks : S.btmEntries).set(e.id, e); idx = null;
    markDirty(btmKeys(what));
  }
  function rejectBtm(what, id, error) {
    var l = btmList(what), i = l.findIndex(function (m) { return m.id === id; });
    if (i < 0) return;
    var e = l.splice(i, 1)[0]; e.error = error; e.failed_at = nowIso(); e.what = what; delete e.pending;
    S.btmFailed.unshift(e); if (S.btmFailed.length > 50) S.btmFailed.length = 50;
    idx = null; markDirty([btmKeys(what)[0], "btmFailed"]);
  }
  function round3(n) { return Math.round(n * 1000) / 1000; }
  // Karteikarte: Einträge in der Reihenfolge der Eintragung (seq), wartende hinten; Bestand fortlaufend errechnet
  function btmCard(itemId) { return index().btmByItem.get(itemId) || []; }
  function btmStock(itemId) { var l = btmCard(itemId); return l.length ? l[l.length - 1].bal : 0; }
  function btmCorrectionOf(entryId) { return index().btmCorrected.get(entryId) || null; }
  function getBtmEntry(id) { return S.btmEntries.get(id) || S.btmPending.find(function (e) { return e.id === id; }) || null; }
  function btmChecksOf(itemId) {
    var out = [];
    S.btmChecks.forEach(function (c) { if (c.item_id === itemId) out.push(c); });
    S.btmChecksPending.forEach(function (c) { if (c.item_id === itemId) out.push(c); });
    return out.sort(function (a, b) { return (b.month || "").localeCompare(a.month || "") || (b.created_at || "").localeCompare(a.created_at || ""); });
  }
  function btmItemsList(archived) {
    return toArr(S.btmItems).filter(function (i) { return !!i.deleted === !!archived; }).sort(byName);
  }

  function cmpEntry(a, b) {   // neueste zuerst: Datum, dann Erfassungszeit
    return (b.date || "").localeCompare(a.date || "") || (b.created_at || "").localeCompare(a.created_at || "");
  }
  function index() {
    if (idx) return idx;
    var byDevice = new Map(), corrected = new Map();
    function add(e) {
      var l = byDevice.get(e.device_id); if (!l) byDevice.set(e.device_id, l = []);
      l.push(e);
      if (e.corrects) corrected.set(e.corrects, e);
    }
    S.entries.forEach(add); S.pending.forEach(add);
    byDevice.forEach(function (l) { l.sort(cmpEntry); });
    var btmByItem = new Map(), btmCorrected = new Map(), conf = toArr(S.btmEntries).sort(function (a, b) { return Number(a.seq) - Number(b.seq); });
    conf.concat(S.btmPending).forEach(function (e) {
      var l = btmByItem.get(e.item_id); if (!l) btmByItem.set(e.item_id, l = []);
      var prev = l.length ? l[l.length - 1].bal : 0, q = Number(e.qty) || 0;
      l.push({ e: e, bal: round3(prev + (e.kind === "zugang" ? q : -q)) });
      if (e.corrects) btmCorrected.set(e.corrects, e);
    });
    idx = { byDevice: byDevice, corrected: corrected, btmByItem: btmByItem, btmCorrected: btmCorrected };
    return idx;
  }
  function entriesOf(deviceId) { return index().byDevice.get(deviceId) || []; }
  function getEntry(id) { return S.entries.get(id) || S.pending.find(function (e) { return e.id === id; }) || null; }
  // Der Eintrag, der diesen berichtigt (bestätigt oder wartend) – oder null
  function correctionOf(entryId) { return index().corrected.get(entryId) || null; }
  // Letzter gültiger Eintrag einer Art: berichtigte Einträge zählen nicht
  function lastOf(deviceId, type) {
    var l = entriesOf(deviceId), c = index().corrected;
    for (var i = 0; i < l.length; i++) if (l[i].type === type && !c.has(l[i].id)) return l[i];
    return null;
  }

  // ---------- Fristen (reine Kalenderrechnung, gleiche Regel wie die tägliche Fristen-Mail) ----------
  function pad(n) { return ("0" + n).slice(-2); }
  function isDate(s) { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s); }
  // STK: mit Ablauf des Monats, in dem die Frist endet
  function stkDue(base, months) {
    if (!isDate(base)) return null;
    var n = Number(base.slice(0, 4)) * 12 + Number(base.slice(5, 7)) - 1 + (Number(months) || 24);
    var y = Math.floor(n / 12), m = n % 12;
    return y + "-" + pad(m + 1) + "-" + pad(new Date(Date.UTC(y, m + 1, 0)).getUTCDate());
  }
  // MTK: mit Ablauf des Jahres, in dem die Frist endet
  function mtkDue(base, years) {
    if (!isDate(base) || !Number(years)) return null;
    return (Number(base.slice(0, 4)) + Number(years)) + "-12-31";
  }
  function inService(d) { return !!d && !d.deleted && !d.decommissioned_at; }
  // -> { stk: null | {due, last, open}, mtk: ... }; null = für dieses Gerät nicht vorgesehen
  function dueOf(d) {
    var out = { stk: null, mtk: null };
    if (!d) return out;
    ["stk", "mtk"].forEach(function (t) {
      if (t === "stk" ? !d.anlage1 : !d.anlage2) return;
      var last = lastOf(d.id, t), base = (last && last.date) || d.commissioned || null, due = null;
      if (last && isDate(last.next_due)) due = last.next_due;                 // vom Prüfer eingetragene Frist hat Vorrang
      else due = t === "stk" ? stkDue(base, d.stk_interval_months) : mtkDue(base, d.mtk_interval_years);
      out[t] = { due: due, last: last, open: !due };
    });
    return out;
  }
  function daysUntil(due) { return Math.round((Date.parse(due + "T00:00:00Z") - Date.parse(today() + "T00:00:00Z")) / 86400000); }
  // Zustand einer Frist: over (überfällig) | soon (innerhalb der Vorwarnzeit) | ok | open (Frist nicht festgelegt)
  function dueState(x, warnDays) {
    if (!x) return null;
    if (!x.due) return "open";
    var n = daysUntil(x.due);
    return n < 0 ? "over" : n <= (warnDays == null ? warnDaysDefault() : warnDays) ? "soon" : "ok";
  }
  function warnDaysDefault() { var n = Number(S.tenant && S.tenant.settings && S.tenant.settings.due_days); return n >= 1 && n <= 180 ? n : 30; }
  // Alle Fristen der Geräte in Betrieb, dringendste zuerst (offene Fristen ans Ende)
  function dueList() {
    var out = [];
    S.devices.forEach(function (d) {
      if (!inService(d)) return;
      var x = dueOf(d);
      ["stk", "mtk"].forEach(function (t) { if (x[t]) out.push({ device: d, type: t, due: x[t].due, last: x[t].last, state: dueState(x[t]) }); });
    });
    out.sort(function (a, b) {
      if (!a.due !== !b.due) return a.due ? -1 : 1;
      return (a.due || "").localeCompare(b.due || "") || String(a.device.inv_no).localeCompare(String(b.device.inv_no), "de", { numeric: true });
    });
    return out;
  }
  // Schlechtester Zustand eines Geräts (für Listen): over > soon > open > ok > null
  function deviceState(d) {
    if (!inService(d)) return null;
    var x = dueOf(d), rank = { over: 4, soon: 3, open: 2, ok: 1 }, best = null;
    ["stk", "mtk"].forEach(function (t) { var s = dueState(x[t]); if (s && (!best || rank[s] > rank[best])) best = s; });
    return best;
  }

  // ---------- Listen / Suche ----------
  function byName(a, b) { return String(a.name || "").localeCompare(String(b.name || ""), "de"); }
  function activeLocations() { return toArr(S.locations).filter(function (l) { return !l.deleted; }).sort(byName); }
  function activePersons(includeInactive) { return toArr(S.persons).filter(function (p) { return !p.deleted && (includeInactive || p.active !== false); }).sort(byName); }
  function activeDevices() { return toArr(S.devices).filter(function (d) { return !d.deleted; }); }
  function deviceCount() { return activeDevices().length; }
  function locName(id) { var l = id && S.locations.get(id); return l && !l.deleted ? l.name : ""; }
  function norm(s) { return String(s == null ? "" : s).trim().toLowerCase(); }
  // QR-Etiketten enthalten die App-Adresse mit "#g=<Inventarnummer>"; gescannt werden kann auch die reine Nummer
  function codeFromScan(text) {
    var t = String(text == null ? "" : text).trim(), i = t.indexOf("#g=");
    if (i >= 0) { try { t = decodeURIComponent(t.slice(i + 3)); } catch (e) { t = t.slice(i + 3); } }
    return t.trim();
  }
  function resolveCode(text) {
    var t = norm(codeFromScan(text)); if (!t) return null;
    var hit = null, by = null;
    S.devices.forEach(function (d) { if (!hit && !d.deleted && norm(d.inv_no) === t) { hit = d; by = "inv_no"; } });
    if (!hit) S.devices.forEach(function (d) { if (!hit && !d.deleted && d.serial && norm(d.serial) === t) { hit = d; by = "serial"; } });
    return hit ? { rec: hit, by: by } : null;
  }
  function invNoInUse(invNo, exceptId) {
    var t = norm(invNo), hit = null;
    S.devices.forEach(function (d) { if (!hit && !d.deleted && d.id !== exceptId && norm(d.inv_no) === t) hit = d; });
    return hit;
  }
  function findDevices(query) {
    var q = norm(query), all = activeDevices();
    if (q) all = all.filter(function (d) {
      return [d.name, d.inv_no, d.serial, d.kind, d.model, d.manufacturer, d.assignment, locName(d.location_id)].some(function (v) { return v && norm(v).indexOf(q) >= 0; });
    });
    return all.sort(function (a, b) { return byName(a, b) || String(a.inv_no).localeCompare(String(b.inv_no), "de", { numeric: true }); });
  }
  // Vorschlag für die nächste Inventarnummer: höchste vorhandene Nummer mit dem Präfix + 1
  function nextInvNo() {
    var prefix = (S.tenant && S.tenant.inv_prefix) || "MP", max = 0, re = new RegExp("^" + prefix.replace(/[^A-Za-z0-9]/g, "") + "-(\\d+)$", "i");
    S.devices.forEach(function (d) { var m = re.exec(String(d.inv_no || "").trim()); if (m) max = Math.max(max, Number(m[1])); });
    return prefix + "-" + ("000" + (max + 1)).slice(-Math.max(4, String(max + 1).length));
  }
  function memberName(id) {
    var m = S.members.find(function (x) { return x.id === id; });
    if (m) return m.name || m.email;
    if (S.member && S.member.id === id) return S.member.name || S.member.email;
    return "";
  }

  window.MPStore = {
    S: S, init: init, save: save, flush: flush, freeze: function () { frozen = true; }, clearAll: clearAll, uuid: uuid, nowIso: nowIso, today: today,
    on: on, emit: emit, invalidate: function () { idx = null; },
    upsertLocation: function (r) { return upsert("location", r); }, deleteLocation: function (id) { return remove("location", id); },
    upsertPerson: function (r) { return upsert("person", r); }, deletePerson: function (id) { return remove("person", id); },
    upsertDevice: function (r) { return upsert("device", r); }, deleteDevice: function (id) { return remove("device", id); },
    dropOutbox: dropOutbox, hasPendingChange: hasPendingChange, queue: queue, mapOf: mapOf,
    addPending: addPending, confirmEntry: confirmEntry, rejectEntry: rejectEntry, clearFailed: clearFailed,
    entriesOf: entriesOf, getEntry: getEntry, correctionOf: correctionOf, lastOf: lastOf,
    upsertBtmItem: function (r) { return upsert("btm_item", r); },
    addBtmPending: addBtmPending, confirmBtm: confirmBtm, rejectBtm: rejectBtm,
    btmCard: btmCard, btmStock: btmStock, btmCorrectionOf: btmCorrectionOf, getBtmEntry: getBtmEntry, btmChecksOf: btmChecksOf, btmItemsList: btmItemsList, round3: round3,
    stkDue: stkDue, mtkDue: mtkDue, dueOf: dueOf, dueState: dueState, dueList: dueList, deviceState: deviceState, daysUntil: daysUntil, inService: inService, warnDays: warnDaysDefault,
    activeLocations: activeLocations, activePersons: activePersons, activeDevices: activeDevices, deviceCount: deviceCount, locName: locName,
    codeFromScan: codeFromScan, resolveCode: resolveCode, invNoInUse: invNoInUse, findDevices: findDevices, nextInvNo: nextInvNo, memberName: memberName
  };
})();
