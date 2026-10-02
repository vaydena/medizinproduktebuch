/* Vaydena Medizinproduktebuch — Synchronisation (Outbox -> Server, danach Änderungen abholen).
   Offline-first: alles wird zuerst lokal gespeichert; übertragen wird, sobald eine Verbindung besteht.
   window.MPSync */
(function () {
  "use strict";
  var Store = window.MPStore, S = Store.S;
  var st = { syncing: false, offline: !navigator.onLine, authLost: false, subInactive: false, blocked: null, lastError: null, lastOk: null, phase: "" };
  var again = false, timer = null, intervalId = null, halted = false;

  function emit() { Store.emit("sync", st); }
  function isAdmin() { return !!(S.member && S.member.role === "admin"); }

  // API-Aufruf; bei abgelaufener Sitzung einmal erneuern und wiederholen
  function api(action, payload, timeoutMs) {
    return MP.apiCall(action, payload, timeoutMs || 60000).then(function (res) {
      if (res.status !== 401 || !MP.sb) return res;
      return MP.sb.auth.refreshSession().then(function (r) {
        if (r && r.error) return res;
        return MP.apiCall(action, payload, timeoutMs || 60000);
      }).catch(function () { return res; });
    });
  }

  // Gemeinsame Fehlerbehandlung; true = Antwort ist verwertbar
  function handleCommon(res) {
    var d = res.data || {};
    if (res.status === 0) { st.offline = !navigator.onLine; st.lastError = navigator.onLine ? "network" : null; return false; }
    st.offline = false;
    if (res.status === 401) { st.authLost = true; return false; }
    if (res.status === 402) { st.subInactive = true; if (d.tenant) { S.tenant = d.tenant; Store.save("tenant"); } return false; }
    if (res.status === 403 && (d.error === "member_inactive" || d.error === "not_registered")) { st.blocked = d.error; return false; }
    if (res.status === 429) { st.lastError = "rate_limited"; return false; }
    if (res.status !== 200 || d.ok === false) { st.lastError = d.error || "server_error"; return false; }
    return true;
  }

  // Ergebnis einer Stammdaten-Übertragung in die Outbox übernehmen
  function applyMaster(kind, results, startedAt) {
    (results || []).forEach(function (r) {
      var e = S.outbox.find(function (o) { return o.kind === kind && o.id === r.id; });
      if (!e) return;
      if (r.ok) {
        // inzwischen erneut geändert -> in der Outbox lassen, geht mit der nächsten Runde
        if (!(e.ts > startedAt)) S.outbox = S.outbox.filter(function (o) { return o !== e; });
      } else { e.error = r.error || "server_error"; e.error_at = Store.nowIso(); }
    });
  }

  function entryOut(e) {
    return { id: e.id, device_id: e.device_id, type: e.type, date: e.date, result: e.result || null, performer: e.performer || null,
      instructor: e.instructor || null, persons: e.persons || [], next_due: e.next_due || null, note: e.note || null,
      corrects: e.corrects || null, created_at: e.created_at };
  }

  // ---------- Übertragen ----------
  function push(round) {
    round = round || 0;
    var startedAt = Store.nowIso(), admin = isAdmin();
    // Outbox-Einträge ohne Datensatz sind verwaist
    S.outbox = S.outbox.filter(function (o) { var m = Store.mapOf(o.kind); return m && m.has(o.id); });
    var locs = [], pers = [], devs = [];
    S.outbox.forEach(function (o) {
      if (o.error) return;
      var rec = Store.mapOf(o.kind).get(o.id);
      if (o.kind === "person") { if (pers.length < 1000) pers.push(rec); }
      else if (!admin) { o.error = "forbidden"; o.error_at = startedAt; }   // Standorte und Geräte pflegt die Verwaltung
      else if (o.kind === "location") { if (locs.length < 500) locs.push(rec); }
      else if (devs.length < 1000) devs.push(rec);
    });
    // Einträge zu Geräten, deren Anlage noch aussteht oder fehlgeschlagen ist, bleiben liegen
    var blocked = {}, waiting = {};
    S.outbox.forEach(function (o) { if (o.kind === "device") { if (o.error) blocked[o.id] = true; else waiting[o.id] = true; } });
    var sentDevs = {}; devs.forEach(function (d) { sentDevs[d.id] = true; });
    var ents = S.pending.filter(function (e) { return !blocked[e.device_id] && (!waiting[e.device_id] || sentDevs[e.device_id]); }).slice(0, 2000);
    if (!locs.length && !pers.length && !devs.length && !ents.length) { Store.save("outbox"); return Promise.resolve(true); }

    st.phase = "push"; emit();
    return api("push", { client_id: S.meta.device_id, locations: locs, persons: pers, devices: devs, entries: ents.map(entryOut) }, 90000).then(function (res) {
      if (!handleCommon(res)) return false;
      st.subInactive = false;
      var r = res.data.results || {}, rejected = 0;
      applyMaster("location", r.locations, startedAt);
      applyMaster("person", r.persons, startedAt);
      applyMaster("device", r.devices, startedAt);
      var devFailed = {};
      (r.devices || []).forEach(function (x) { if (!x.ok) devFailed[x.id] = true; });
      (r.entries || []).forEach(function (x) {
        if (x.ok || x.dup) { Store.confirmEntry(x.id, res.data.server_time); return; }
        var e = S.pending.find(function (p) { return p.id === x.id; });
        // Gerät konnte (noch) nicht angelegt werden -> Eintrag aufbewahren statt verwerfen
        if (e && x.error === "device_not_found" && (devFailed[e.device_id] || Store.hasPendingChange("device", e.device_id))) return;
        Store.rejectEntry(x.id, x.error || "server_error"); rejected++;
      });
      Store.invalidate();
      return Store.save(["outbox", "pending", "entries", "failed"], true).then(function () {
        Store.emit("change", { kind: "push", rejected: rejected });
        var more = S.outbox.some(function (o) { return !o.error; }) ||
          S.pending.some(function (e) { return !Store.hasPendingChange("device", e.device_id); });
        var progressed = (r.locations || []).length + (r.persons || []).length + (r.devices || []).length + (r.entries || []).length > 0;
        if (more && progressed && round < 10) return push(round + 1);
        return true;
      });
    });
  }

  // ---------- Abholen ----------
  function applyRecords(kind, list, full) {
    var map = Store.mapOf(kind);
    if (full) {
      // vollständiger Abgleich: nur lokal geänderte, noch nicht übertragene Datensätze behalten
      Array.from(map.keys()).forEach(function (id) { if (!Store.hasPendingChange(kind, id)) map.delete(id); });
    }
    (list || []).forEach(function (r) {
      if (Store.hasPendingChange(kind, r.id)) return;   // lokale Änderung hat Vorrang, bis sie übertragen ist
      if (r.deleted) map.delete(r.id); else map.set(r.id, r);
    });
  }
  function pull() {
    st.phase = "pull"; emit();
    return api("pull", { since: S.meta.since || null }, 90000).then(function (res) {
      if (!handleCommon(res)) return { ok: false };
      var d = res.data;
      if (S.tenant && d.tenant && S.tenant.id !== d.tenant.id) {
        // Konto gehört jetzt zu einer anderen Einrichtung: lokale Daten verwerfen und neu laden
        return Store.clearAll().then(function () { return { ok: true, more: true }; });
      }
      if (d.tenant) S.tenant = d.tenant;
      if (d.member) S.member = d.member;
      if (d.members) S.members = d.members;
      if (d.full) S.entries = new Map();
      applyRecords("location", d.locations, d.full);
      applyRecords("person", d.persons, d.full);
      applyRecords("device", d.devices, d.full);
      var got = {};
      (d.entries || []).forEach(function (e) { S.entries.set(e.id, e); got[e.id] = true; });
      if (S.pending.length) S.pending = S.pending.filter(function (e) { return !got[e.id]; });
      S.meta.since = d.server_time; S.meta.last_sync = Store.nowIso();
      st.blocked = d.member && d.member.active === false ? "member_inactive" : null;
      st.subInactive = !(d.tenant && d.tenant.sub && d.tenant.sub.active);
      st.authLost = false; st.lastError = null; st.lastOk = S.meta.last_sync;
      Store.invalidate();
      return Store.save(["tenant", "member", "members", "locations", "persons", "devices", "entries", "pending", "meta"], true).then(function () {
        Store.emit("change", { kind: "pull", full: !!d.full });
        return { ok: true, more: !!d.more };
      });
    });
  }
  function pullAll(n) {
    n = n || 0;
    return pull().then(function (r) { return r.ok && r.more && n < 40 ? pullAll(n + 1) : r.ok; });
  }

  // ---------- Ablauf ----------
  function sync() {
    if (halted || !S.ready) return Promise.resolve(false);
    if (!navigator.onLine) { st.offline = true; emit(); return Promise.resolve(false); }
    if (st.syncing) { again = true; return Promise.resolve(false); }
    st.syncing = true; st.offline = false; st.lastError = null; emit();
    return push().then(function () {
      // auch bei gesperrtem Tarif abholen: Lesen bleibt möglich, der Status wird aktualisiert
      if (st.authLost || st.blocked || st.offline) return false;
      return pullAll();
    }).catch(function (e) { console.error(e); st.lastError = "client_error"; return false; }).then(function (ok) {
      st.syncing = false; st.phase = ""; emit();
      if (again && !halted) { again = false; schedule(300); }
      return ok;
    });
  }
  function schedule(ms) {
    if (halted) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; sync(); }, ms == null ? 1500 : ms);
  }
  function start() {
    window.addEventListener("online", function () { st.offline = false; emit(); schedule(200); });
    window.addEventListener("offline", function () { st.offline = true; emit(); });
    document.addEventListener("visibilitychange", function () { if (!document.hidden) schedule(500); else Store.flush(); });
    window.addEventListener("pagehide", function () { Store.flush(); });
    if (!intervalId) intervalId = setInterval(function () { if (!document.hidden) sync(); }, 60000);
    return sync();
  }
  function counts() {
    return {
      pending: S.pending.length + S.outbox.filter(function (o) { return !o.error; }).length,
      conflicts: S.outbox.filter(function (o) { return !!o.error; }).length,
      failed: S.failed.length
    };
  }
  function halt() { halted = true; if (timer) clearTimeout(timer); if (intervalId) clearInterval(intervalId); timer = intervalId = null; }

  window.MPSync = { st: st, sync: sync, schedule: schedule, start: start, halt: halt, api: api, counts: counts, handleCommon: handleCommon, isAdmin: isAdmin };
})();
