(function () {
  "use strict";
  var S = MPStore.S, esc = MP.esc;
  function byId(id) { return document.getElementById(id); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  var App = {
    booted: false, view: null, viewName: "", route: { name: "uebersicht", arg: "" }, modal: null, dirtyView: false,
    installPrompt: null, userId: null, userEmail: "",
    cam: { on: false, resume: false }, scan: { queued: null, last: null },
    f: { geraete: { q: "", state: "betrieb" }, fristen: { state: "alle" }, personen: { q: "" }, etiketten: { q: "", sel: {} }, btm: { arch: false } },
    firma: { period: "monat", invoices: null, result: null },
    team: { list: null, limit: null, invite: null },
    audit: { entries: null, more: false, loading: false }
  };
  var VIEWS = {}, ACTIONS = {}, FORMS = {}, INPUTS = {};

  // ---------- Icons ----------
  var ICONS = {
    image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    history: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>',
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    clipboard: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    building: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
    "in": '<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>',
    out: '<circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/>',
    transfer: '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    count: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    more: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    warn: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    offline: '<line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    chev: '<polyline points="9 18 15 12 9 6"/>',
    ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'
  };
  function ic(name) { return '<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.info) + '</svg>'; }

  var ERR = Object.assign({}, MP.ERRORS, {
    bad_plan: "Dieser Tarif steht nicht zur Auswahl.",
    cannot_edit_self: "Die eigene Rolle kann nicht geändert werden.",
    cannot_remove_self: "Der eigene Zugang kann nicht entfernt werden.",
    bad_member: "Dieses Teammitglied wurde nicht gefunden.",
    bad_email: "Bitte eine gültige E-Mail-Adresse angeben.",
    bad_id: "Der Datensatz hat eine ungültige Kennung.",
    forbidden: "Dafür fehlt die Berechtigung. Standorte und Geräte pflegt die Administration.",
    network: "Keine Verbindung zum Server.",
    rate_limited: "Zu viele Anfragen. Bitte kurz warten.",
    client_error: "Beim Abgleich ist ein Fehler aufgetreten.",
    btm_off: "Das Modul „BtM-Buch“ ist für diese Einrichtung nicht aktiviert.",
    btm_negative: "Der Bestand reicht dafür nicht aus – er würde negativ.",
    btm_bad_qty: "Bitte eine Menge größer als 0 angeben (höchstens drei Nachkommastellen).",
    btm_has_stock: "Archivieren ist erst möglich, wenn der Bestand 0 beträgt.",
    btm_unit_fixed: "Die Einheit lässt sich nach der ersten Buchung nicht mehr ändern.",
    btm_item_archived: "Dieses Präparat ist archiviert – neue Einträge sind nicht möglich.",
    btm_item_not_found: "Das Präparat wurde auf dem Server nicht gefunden.",
    bad_corrects: "Eine Storno-Buchung kann nicht selbst storniert werden.",
    already_corrected: "Dieser Eintrag wurde bereits storniert bzw. berichtigt.",
    server_error: "Serverfehler. Bitte später erneut versuchen.",
    error: "Unbekannter Fehler."
  });
  function errMsg(code) { return ERR[code] || (code ? "Fehler: " + code : ERR.error); }
  function apiErr(res) {
    var code = res && res.data && res.data.error;
    if (code && ERR[code]) return ERR[code];
    return MP.errText(res, "Fehler. Bitte erneut versuchen.");
  }

  var nf = new Intl.NumberFormat("de-DE");
  var TYPES = {
    funktionspruefung: "Funktionsprüfung", einweisung: "Einweisung",
    stk: "Sicherheitstechnische Kontrolle (STK)", mtk: "Messtechnische Kontrolle (MTK)",
    it: "IT-Sicherheitsüberprüfung", instandhaltung: "Instandhaltung",
    stoerung: "Funktionsstörung", vorkommnis: "Vorkommnis-Meldung"
  };
  var TYPE_ORDER = ["funktionspruefung", "einweisung", "stk", "mtk", "it", "instandhaltung", "stoerung", "vorkommnis"];
  var TYPE_SHORT = { funktionspruefung: "Funktionsprüfung", einweisung: "Einweisung", stk: "STK", mtk: "MTK", it: "IT-Sicherheit", instandhaltung: "Instandhaltung", stoerung: "Störung", vorkommnis: "Vorkommnis" };
  function typeLabel(t) { return TYPES[t] || t || ""; }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function fmtDate(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d)) return ""; return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function fmtDay(iso) { if (!iso) return ""; var d = new Date(iso); if (isNaN(d)) return ""; return pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear(); }
  function relTime(iso) {
    if (!iso) return ""; var t = new Date(iso).getTime(); if (isNaN(t)) return "";
    var s = Math.round((Date.now() - t) / 1000);
    if (s < 45) return "gerade eben"; if (s < 3600) return "vor " + Math.round(s / 60) + " Min.";
    if (s < 86400) return "vor " + Math.round(s / 3600) + " Std."; if (s < 172800) return "gestern";
    return fmtDay(iso);
  }
  function fmtBB(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? m[3] + "." + m[2] + "." + m[1] : ""; }
  function todayIso() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function settings() { return (S.tenant && S.tenant.settings) || {}; }
  function isAdmin() { return !!(S.member && S.member.role === "admin"); }
  function formVals(f) {
    var o = {};
    $$("input,select,textarea", f).forEach(function (el) {
      if (!el.name) return;
      if (el.type === "checkbox") o[el.name] = el.checked; else o[el.name] = el.value.trim();
    });
    return o;
  }
  function nameOfMember(id) { return MPStore.memberName(id) || "–"; }

  // ---------- Toast / Modal / Dialoge ----------
  function toast(msg, kind, ms) {
    var box = byId("toasts"); if (!box) return;
    var t = document.createElement("div"); t.className = "toast" + (kind ? " " + kind : ""); t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320); }, ms || 2600);
  }
  function modal(o) {
    var host = byId("modal"); if (!host) return;
    var ret = App.modal ? App.modal._ret : document.activeElement;
    closeModal(true);
    App.modal = o; o._ret = ret;
    host.innerHTML = '<div class="modal-bg" data-act="modal-bg"><div class="modal' + (o.wide ? " wide" : "") + '" role="dialog" aria-modal="true" aria-labelledby="modalTitle" tabindex="-1">' +
      '<div class="mhead"><h2 id="modalTitle">' + esc(o.title || "") + '</h2>' + (o.noClose ? "" : '<button class="iconbtn" type="button" data-act="modal-close" aria-label="Schließen">' + ic("x") + '</button>') + '</div>' +
      (o.body || "") + (o.foot ? '<div class="foot">' + o.foot + '</div>' : "") + '</div></div>';
    host.hidden = false; document.body.classList.add("noscroll");
    if (o.onMount) { try { o.onMount(host); } catch (e) { console.error(e); } }
    var first = $("input:not([type=hidden]):not([type=checkbox]),select,textarea", host);
    if (first && window.matchMedia && matchMedia("(pointer:fine)").matches) { try { first.focus(); } catch (e) {} }
    else { var dlg = $(".modal", host); if (dlg) try { dlg.focus({ preventScroll: true }); } catch (e) {} }
  }
  // Tab-Taste im Dialog halten (Fokusfalle)
  function trapFocus(e) {
    var host = byId("modal"); if (!App.modal || !host || host.hidden) return;
    var list = $$('button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])', host).filter(function (el) { return el.offsetParent !== null; });
    if (!list.length) { e.preventDefault(); return; }
    var first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (!host.contains(a)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && (a === first || !list.length || a.classList.contains("modal"))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  // aria-pressed an Umschaltern (.seg) automatisch aus der Klasse "on" ableiten
  function segA11y(root) {
    $$(".seg > button", root || document).forEach(function (b) { var v = b.classList.contains("on") ? "true" : "false"; if (b.getAttribute("aria-pressed") !== v) b.setAttribute("aria-pressed", v); });
    // Beschriftungen ohne for= mit dem ersten Eingabefeld der .field verknüpfen
    $$(".field > label:not([for]):not([data-nofor])", root || document).forEach(function (l) {
      var f = l.parentNode.querySelector("input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea");
      if (!f) { l.setAttribute("data-nofor", "1"); return; }
      if (!f.id) f.id = "fld" + (++a11yN);
      l.setAttribute("for", f.id);
    });
  }
  var a11yN = 0;
  function closeModal(silent) {
    var host = byId("modal"), o = App.modal;
    App.modal = null;
    if (host) { host.innerHTML = ""; host.hidden = true; }
    document.body.classList.remove("noscroll");
    if (o && o._ret && !App.modal && document.contains(o._ret) && o._ret.focus) { try { o._ret.focus({ preventScroll: true }); } catch (e) {} }
    if (o && o.onClose && !silent) { try { o.onClose(); } catch (e) { console.error(e); } }
    if (App.dirtyView && !App.modal) { App.dirtyView = false; renderView(); }
  }
  function confirmDlg(msg, o) {
    o = o || {};
    return new Promise(function (resolve) {
      var done = false;
      function fin(v) { if (done) return; done = true; resolve(v); }
      modal({
        title: o.title || "Bitte bestätigen",
        body: o.html ? o.html : '<p>' + esc(msg) + '</p>',
        foot: '<button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn ' + (o.danger ? "danger" : "primary") + '" type="button" data-act="confirm-ok">' + esc(o.ok || "OK") + '</button>',
        onClose: function () { fin(false); }
      });
      App.modal._confirm = function () { fin(true); closeModal(true); };
    });
  }
  ACTIONS["confirm-ok"] = function () { if (App.modal && App.modal._confirm) App.modal._confirm(); };
  ACTIONS["modal-close"] = function () { closeModal(); };
  ACTIONS["go-plans"] = function () { closeModal(); location.hash = "#firma"; };
  ACTIONS["welcome-new-device"] = function () { closeModal(); nav("geraete/neu"); };
  ACTIONS["modal-bg"] = function (el, e) { if (e && e.target === el) closeModal(); };

  ACTIONS["copy-text"] = function (el) {
    var t = el.getAttribute("data-text") || "";
    var p = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(t) : Promise.reject();
    p.then(function () { toast("Kopiert.", "ok"); }).catch(function () { window.prompt("Zum Kopieren markieren:", t); });
  };

  // ---------- CSV / Download ----------
  function csvCell(v) {
    if (v == null) v = "";
    if (typeof v === "number") v = String(v).replace(".", ",");
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(,\d+)?$/.test(v)) v = "'" + v; // Excel-Formeln entschärfen, Zahlen nicht
    return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function csvText(rows) { return "\ufeff" + rows.map(function (r) { return r.map(csvCell).join(";"); }).join("\r\n") + "\r\n"; }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: (mime || "text/csv") + ";charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); if (a.parentNode) a.parentNode.removeChild(a); }, 1500);
  }
  function parseCsv(text) {
    text = String(text || "").replace(/^\ufeff/, "");
    var first = text.split(/\r?\n/, 1)[0] || "";
    var delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ";" : ",";
    if ((first.match(/\t/g) || []).length > (first.match(new RegExp(delim === ";" ? ";" : ",", "g")) || []).length) delim = "\t";
    var rows = [], row = [], cell = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell.length || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); }).filter(function (r) { return r.some(function (x) { return x !== ""; }); });
  }
  function fileDate() { var d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }

  // ---------- Kamera ----------
  function camPref() { try { return localStorage.getItem("mp_cam") === "1"; } catch (e) { return false; } }
  function setCamPref(v) { try { localStorage.setItem("mp_cam", v ? "1" : "0"); } catch (e) {} }
  function renderScanbox(boxId, readerId, on) {
    var box = byId(boxId); if (!box) return;
    if (on) {
      box.innerHTML = '<div class="reader" id="' + readerId + '"></div><div class="scanctl"><button type="button" class="hide" data-act="cam-torch">Licht</button><button type="button" data-act="cam-off">Kamera aus</button></div>';
    } else if (!MPScan.supported()) {
      var why = MPScan.secure() ? "Dieser Browser unterstützt keinen Kamerazugriff. Handscanner (Tastaturmodus) und die Eingabe unten funktionieren trotzdem." : "Kamera nur über HTTPS möglich.";
      box.innerHTML = '<div class="scanoff">' + ic("camera") + '<p>' + esc(why) + '</p></div>';
    } else {
      box.innerHTML = '<div class="scanoff">' + ic("camera") + '<p>QR-Etikett oder Barcode des Geräts mit der Kamera scannen – oder Handscanner nutzen bzw. Nummer unten eingeben.</p><button class="btn gold" type="button" data-act="cam-on">Kamera starten</button></div>';
    }
  }
  function camErr(e) {
    var m = (e && (e.message || e.name || String(e))) || "";
    if (/insecure/.test(m)) return "Kamera nur über HTTPS möglich.";
    if (/unsupported/.test(m)) return "Kamera wird von diesem Browser nicht unterstützt.";
    if (/NotAllowed|Permission|denied/i.test(m)) return "Kamerazugriff wurde abgelehnt. Bitte in den Browser-Einstellungen erlauben.";
    if (/NotFound|no camera|Requested device not found/i.test(m)) return "Keine Kamera gefunden.";
    return "Kamera konnte nicht gestartet werden.";
  }
  function startCam(boxId, readerId, handler) {
    renderScanbox(boxId, readerId, true);
    return MPScan.start(readerId, handler).then(function () {
      App.cam.on = true; setCamPref(true);
      var tb = $('#' + boxId + ' [data-act="cam-torch"]'); if (tb) tb.classList.toggle("hide", !MPScan.hasTorch());
    }).catch(function (e) {
      App.cam.on = false; setCamPref(false); toast(camErr(e), "err", 4000); renderScanbox(boxId, readerId, false);
    });
  }
  function stopCam(boxId, readerId) {
    App.cam.on = false; setCamPref(false);
    return MPScan.stop().then(function () { renderScanbox(boxId, readerId, false); });
  }
  ACTIONS["cam-on"] = function () { var c = App.view && App.view.cam; if (c) startCam(c.box, c.reader, c.handler); };
  ACTIONS["cam-off"] = function () { var c = App.view && App.view.cam; if (c) stopCam(c.box, c.reader); };
  ACTIONS["cam-torch"] = function (el) { MPScan.torch(!MPScan.isTorchOn()).then(function (ok) { el.textContent = MPScan.isTorchOn() ? "Licht aus" : "Licht"; if (!ok) toast("Kein Licht verfügbar.", "warn"); }); };

  // Overlay: Code in ein Formularfeld scannen
  var overlay = { open: false, resume: false };
  function openOverlay(title, onCode) {
    if (!MPScan.supported()) { toast(MPScan.secure() ? "Kamera nicht verfügbar." : "Kamera nur über HTTPS möglich.", "warn"); return; }
    var host = byId("overlay"); if (!host) { host = document.createElement("div"); host.id = "overlay"; document.body.appendChild(host); }
    overlay.resume = MPScan.isRunning(); overlay.open = true;
    host.innerHTML = '<div class="scanoverlay"><div class="top"><span>' + esc(title || "Scannen") + '</span><div class="spacer"></div><button class="btn ghost on-navy sm" type="button" data-act="overlay-close">Schließen</button></div><div class="reader" id="ovReader"></div></div>';
    MPScan.start("ovReader", function (code) { closeOverlay(); try { onCode(code); } catch (e) { console.error(e); } })
      .catch(function (e) { toast(camErr(e), "err", 4000); closeOverlay(); });
  }
  function closeOverlay() {
    if (!overlay.open) return;
    overlay.open = false;
    var host = byId("overlay");
    MPScan.stop().then(function () {
      if (host) host.innerHTML = "";
      if (overlay.resume && App.view && App.view.cam && camPref()) { var c = App.view.cam; startCam(c.box, c.reader, c.handler); }
      overlay.resume = false;
    });
  }
  ACTIONS["overlay-close"] = function () { closeOverlay(); };

  var NAV = [
    { id: "uebersicht", label: "Übersicht", icon: "clipboard" },
    { id: "geraete", label: "Geräte", icon: "box" },
    { id: "scan", label: "Scannen", icon: "scan" },
    { id: "fristen", label: "Fristen", icon: "history" },
    { id: "personen", label: "Personen", icon: "users" },
    { id: "btm", label: "BtM-Buch", icon: "clipboard", btm: true },
    { id: "standorte", label: "Standorte", icon: "pin", admin: true },
    { id: "etiketten", label: "Etiketten", icon: "tag" },
    { id: "team", label: "Team", icon: "user", admin: true },
    { id: "protokoll", label: "Protokoll", icon: "list", admin: true },
    { id: "firma", label: "Einrichtung & Abo", icon: "building" },
    { id: "konto", label: "Konto", icon: "info" }
  ];
  function navItems() { return NAV.filter(function (n) { return (!n.admin || isAdmin()) && (!n.btm || settings().btm); }); }
  function renderNav() {
    var items = navItems(), side = byId("sidenav"), bottom = byId("bottomnav"), more = byId("moresheet");
    function link(n) { return '<a href="#' + n.id + '" data-nav="' + n.id + '">' + ic(n.icon) + '<span>' + esc(n.label) + '</span></a>'; }
    if (side) side.innerHTML = items.map(link).join("") + '<div class="sep"></div><div class="who"><b>' + esc(S.tenant ? S.tenant.name : "") + '</b>' + esc(S.member ? (S.member.name || S.member.email) : "") + ' · ' + (isAdmin() ? "Admin" : "Mitarbeiter") + '</div>';
    if (bottom) bottom.innerHTML = items.slice(0, 4).map(link).join("") + '<a href="#" data-act="more" data-nav="__more">' + ic("more") + '<span>Mehr</span></a>';
    if (more) more.innerHTML = items.slice(4).map(link).join("");
    markNav();
  }
  function markNav() {
    var name = App.route.name, top = navItems().slice(0, 4).some(function (n) { return n.id === name; });
    $$("[data-nav]").forEach(function (a) { var id = a.getAttribute("data-nav"); a.classList.toggle("on", id === name || (id === "__more" && !top)); });
  }
  function closeMore() { var m = byId("moresheet"); if (m) m.classList.remove("open"); }
  ACTIONS["more"] = function () { var m = byId("moresheet"); if (m) m.classList.toggle("open"); };
  function parseHash() {
    var h = (location.hash || "").replace(/^#\/?/, ""), i = h.indexOf("/");
    var name = i >= 0 ? h.slice(0, i) : h, arg = i >= 0 ? h.slice(i + 1) : "";
    try { arg = decodeURIComponent(arg); } catch (e) {}
    return { name: name || "uebersicht", arg: arg };
  }
  function nav(hash) { if (("#" + hash) === location.hash) route(); else location.hash = hash; }
  function route() {
    if (!App.booted || App.tabBlocked) return;
    var r = parseHash(), def = NAV.filter(function (n) { return n.id === r.name; })[0];
    if (/^#g=/.test(location.hash)) {
      var hit = MPStore.resolveCode(location.hash);
      if (!hit) toast("Kein Gerät mit dieser Inventarnummer gefunden.", "warn");
      location.replace(hit ? "#geraete/" + encodeURIComponent(hit.rec.id) : "#scan"); return;
    }
    if (!VIEWS[r.name] || (def && def.admin && !isAdmin()) || (def && def.btm && !settings().btm)) { location.replace("#uebersicht"); return; }
    if (App.view && App.viewName !== r.name && App.view.unmount) { try { App.view.unmount(); } catch (e) { console.error(e); } }
    closeModal(true); closeMore(); closeOverlay();
    App.viewName = r.name; App.view = VIEWS[r.name]; App.route = r; App.dirtyView = false;
    renderView(); window.scrollTo(0, 0);
  }
  function renderView() {
    var el = byId("view"), v = App.view; if (!el || !v) return;
    App.dirtyView = false;
    el.innerHTML = v.render(App.route.arg);
    if (v.mount) { try { v.mount(el, App.route.arg); } catch (e) { console.error(e); } }
    var t = (typeof v.title === "function" ? v.title(App.route.arg) : v.title) || "Medizinproduktebuch";
    var tt = byId("title"); if (tt) tt.textContent = t;
    document.title = t + " – Vaydena Medizinproduktebuch";
    markNav();
  }
  function softRender() {
    var a = document.activeElement, view = byId("view");
    if (a && view && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) { App.dirtyView = true; return; }
    if (App.modal) { App.dirtyView = true; return; }
    renderView();
  }
  function refresh(evt) { var v = App.view; if (!v) return; if (v.update) { try { v.update(evt); } catch (e) { console.error(e); } } else softRender(); }

  // ---------- Ereignisse ----------
  function bindEvents() {
    if (window.MutationObserver) {
      var segT = 0;
      new MutationObserver(function () { if (!segT) segT = setTimeout(function () { segT = 0; segA11y(); }, 0); })
        .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    }
    document.addEventListener("click", function (e) {
      var el = e.target.closest("[data-act]"); if (!el) return;
      var act = el.getAttribute("data-act"), fn = ACTIONS[act];
      if (!fn) return;
      if (el.tagName === "A" || el.tagName === "BUTTON") e.preventDefault();
      try { fn(el, e); } catch (err) { console.error(err); toast("Fehler: " + (err && err.message), "err"); }
    });
    document.addEventListener("submit", function (e) {
      var f = e.target.closest("form[data-form]"); if (!f) return;
      e.preventDefault();
      var fn = FORMS[f.getAttribute("data-form")]; if (!fn) return;
      try { fn(f, e); } catch (err) { console.error(err); toast("Fehler: " + (err && err.message), "err"); }
    });
    document.addEventListener("input", function (e) {
      var el = e.target.closest("[data-input]"); if (!el) return;
      var fn = INPUTS[el.getAttribute("data-input")]; if (fn) { try { fn(el, e); } catch (err) { console.error(err); } }
    });
    document.addEventListener("change", function (e) {
      var el = e.target.closest("[data-change]"); if (!el) return;
      var fn = INPUTS[el.getAttribute("data-change")]; if (fn) { try { fn(el, e); } catch (err) { console.error(err); } }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { if (overlay.open) closeOverlay(); else if (App.modal && !App.modal.noClose) closeModal(); else closeMore(); return; }
      if (e.key === "Tab" && App.modal) { trapFocus(e); return; }
      if (e.key === "Enter" && e.target && e.target.tagName === "INPUT") {
        if (e.target.hasAttribute("data-noenter")) { e.preventDefault(); return; }
        var act = e.target.getAttribute("data-enter");
        if (act && ACTIONS[act]) { e.preventDefault(); ACTIONS[act](e.target, e); }
      }
    });
    document.addEventListener("focusout", function () {
      setTimeout(function () {
        if (!App.dirtyView || App.modal) return;
        var a = document.activeElement, view = byId("view");
        if (a && view && view.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
        App.dirtyView = false; renderView();
      }, 60);
    }, true);
    window.addEventListener("hashchange", route);
    window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); App.installPrompt = e; if (App.viewName === "konto") softRender(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { if (MPScan.isRunning() && !overlay.open) { App.cam.resume = true; MPScan.stop(); } }
      else if (App.cam.resume) { App.cam.resume = false; var c = App.view && App.view.cam; if (c && camPref()) startCam(c.box, c.reader, c.handler); }
    });
    MPScan.attachWedge(function (code) {
      if (App.modal || overlay.open) return;
      if (App.view && App.view.onWedge) App.view.onWedge(code);
      else { App.scan.queued = code; nav("scan"); }
    });
  }

  // ---------- Hinweisleisten / Sync-Anzeige ----------
  function subText(t) {
    var sub = t && t.sub; if (!sub) return "";
    if (sub.active && sub.reason === "grace") return "Zahlung überfällig – Karenzzeit bis " + fmtDay(sub.until) + ".";
    if (sub.active) return (t.plan === "trial" ? "Testphase" : (t.plan_label || t.plan)) + (sub.days_left != null ? " – noch " + sub.days_left + " Tag" + (sub.days_left === 1 ? "" : "e") : "") + (sub.until ? " (bis " + fmtDay(sub.until) + ")" : "") + ".";
    var why = { gesperrt: "Das Konto ist gesperrt.", trial_expired: "Die Testphase ist abgelaufen.", unpaid: "Die Rechnung ist noch offen.", expired: "Das Abo ist abgelaufen." };
    return why[sub.reason] || "Das Abo ist nicht aktiv.";
  }
  function renderBanners() {
    var host = byId("banners"); if (!host || !S.tenant) return;
    var st = MPSync.st, c = MPSync.counts(), h = "";
    function b(kind, icon, text, href, link) { h += '<div class="banner ' + kind + '">' + ic(icon) + '<span>' + text + '</span>' + (href ? '<a href="' + esc(href) + '">' + esc(link) + '</a>' : "") + '</div>'; }
    if (st.blocked === "member_inactive") b("err", "warn", "Dein Zugang wurde deaktiviert. Bitte an den Administrator wenden.");
    else if (st.blocked === "not_registered") b("err", "warn", "Dieses Konto gehört zu keiner Einrichtung.", "registrieren.html", "Registrieren");
    if (st.authLost) b("err", "warn", "Die Anmeldung ist abgelaufen. Änderungen bleiben auf dem Gerät gespeichert.", "anmelden.html?next=app.html", "Neu anmelden");
    if (st.offline) b("off", "offline", "Offline – Einträge werden auf dem Gerät gespeichert" + (c.pending ? " (" + c.pending + " wartend)" : "") + ".");
    var t = S.tenant, sub = t.sub || {};
    if (!sub.active) {
      var msg = subText(t) + " Einträge bleiben auf dem Gerät gespeichert und werden nach Freischaltung übertragen.";
      if (isAdmin()) b("err", "warn", msg, "#firma", sub.reason === "gesperrt" ? "Kontakt" : "Tarif wählen"); else b("err", "warn", msg + " Bitte den Administrator informieren.");
    } else if (sub.reason === "grace") b("warn", "warn", subText(t), isAdmin() ? "#firma" : null, "Rechnungen");
    else if (t.plan === "trial" && sub.days_left != null && sub.days_left <= 7) b("info", "info", "Testphase endet in " + sub.days_left + " Tag" + (sub.days_left === 1 ? "" : "en") + ".", isAdmin() ? "#firma" : null, "Tarif wählen");
    if (c.conflicts) b("warn", "warn", c.conflicts + " Änderung" + (c.conflicts === 1 ? "" : "en") + " wurde" + (c.conflicts === 1 ? "" : "n") + " vom Server abgelehnt.", "#konto", "Prüfen");
    if (c.failed) b("warn", "warn", c.failed + (c.failed === 1 ? " Eintrag" : " Einträge") + " abgelehnt.", "#konto", "Anzeigen");
    if (S.storageError === "write") b("err", "warn", "Speichern auf dem Gerät schlägt fehl (Speicher voll?). Bitte online bleiben, bis alles übertragen ist, und Speicher freigeben.");
    else if (!S.persistent) b("warn", "warn", "Dieser Browser speichert keine Daten dauerhaft (privater Modus?). Offline-Einträge gehen beim Schließen verloren.");
    host.innerHTML = h;
  }
  function renderSyncdot() {
    var el = byId("syncdot"); if (!el) return;
    var st = MPSync.st, c = MPSync.counts(), cls = "", txt = "Aktuell";
    if (st.syncing) { cls = "busy"; txt = "Abgleich …"; }
    else if (st.offline) { cls = ""; txt = "Offline" + (c.pending ? " · " + c.pending : ""); }
    else if (st.authLost) { cls = "err"; txt = "Anmeldung nötig"; }
    else if (st.blocked) { cls = "err"; txt = "Gesperrt"; }
    else if (st.subInactive) { cls = "err"; txt = "Abo inaktiv"; }
    else if (c.conflicts || c.failed) { cls = "err"; txt = (c.conflicts + c.failed) + " Fehler"; }
    else if (st.lastError) { cls = "err"; txt = "Fehler"; }
    else if (c.pending) { cls = "pend"; txt = c.pending + " wartend"; }
    else { cls = "ok"; }
    el.className = "syncdot " + cls; var s = $("span", el); if (s) s.textContent = txt;
    el.title = st.lastError ? errMsg(st.lastError) : (S.meta.last_sync ? "Letzter Abgleich: " + fmtDate(S.meta.last_sync) : "");
  }
  ACTIONS["go-konto"] = function () { nav("konto"); };
  ACTIONS["sync-now"] = function () {
    if (!navigator.onLine) { toast("Offline – der Abgleich startet automatisch, sobald wieder eine Verbindung besteht.", "warn"); return; }
    MPSync.sync().then(function (ok) {
      if (ok) toast("Abgleich abgeschlossen.", "ok");
      else if (MPSync.st.syncing) toast("Abgleich läuft bereits.");
      else toast(errMsg(MPSync.st.lastError), "err", 4000);
    });
  };

  // ---------- Start ----------
  function splash(kind, extra) {
    var el = byId("view"); if (!el) return;
    var h = '<div class="splash"><div class="box">';
    if (kind === "loading") h += '<div class="spinner"></div><p class="muted">Daten werden geladen …</p>';
    else if (kind === "offline") h += ic("offline") + '<h2>Offline</h2><p class="muted">Für den ersten Start wird einmalig eine Internetverbindung benötigt.</p><button class="btn primary" type="button" data-act="retry-first">Erneut versuchen</button>';
    else if (kind === "not_registered") h += ic("warn") + '<h2>Keine Einrichtung zugeordnet</h2><p class="muted">Dieses Konto gehört zu keiner registrierten Einrichtung. Bitte registrieren oder eine Einladung des Administrators nutzen.</p><div class="btnrow" style="justify-content:center"><a class="btn primary" href="registrieren.html">Registrieren</a><button class="btn ghost" type="button" data-act="logout">Abmelden</button></div>';
    else if (kind === "tab_busy") h += ic("warn") + '<h2>Bereits in einem anderen Tab geöffnet</h2><p class="muted">Vaydena Medizinproduktebuch läuft auf diesem Gerät schon in einem anderen Tab oder Fenster. Damit keine Einträge verloren gehen, ist die App immer nur in einem Tab aktiv.</p><button class="btn primary" type="button" data-act="tab-takeover">Hier verwenden</button>';
    else if (kind === "tab_moved") h += ic("warn") + '<h2>In anderem Tab geöffnet</h2><p class="muted">Die App wurde in einem anderen Tab übernommen. Alle Daten sind gespeichert.</p><button class="btn primary" type="button" data-act="tab-takeover">Wieder hier verwenden</button>';
    else if (kind === "member_inactive") h += ic("warn") + '<h2>Zugang deaktiviert</h2><p class="muted">Dein Zugang wurde deaktiviert. Bitte an den Administrator wenden.</p><button class="btn ghost" type="button" data-act="logout">Abmelden</button>';
    else h += ic("warn") + '<h2>Laden fehlgeschlagen</h2><p class="muted">' + esc(extra || "Bitte erneut versuchen.") + '</p><div class="btnrow" style="justify-content:center"><button class="btn primary" type="button" data-act="retry-first">Erneut versuchen</button><button class="btn ghost" type="button" data-act="logout">Abmelden</button></div>';
    el.innerHTML = h + '</div></div>';
  }
  function afterFirstSync() {
    var st = MPSync.st;
    if (S.tenant && S.member) { firstRender(); return; }
    if (st.blocked === "not_registered") return splash("not_registered");
    if (st.blocked === "member_inactive") return splash("member_inactive");
    if (st.authLost) { MP.signOut().then(function () { location.replace("anmelden.html?next=app.html"); }); return; }
    if (st.offline || !navigator.onLine) return splash("offline");
    splash("error", errMsg(st.lastError));
  }
  ACTIONS["retry-first"] = function () { splash("loading"); MPSync.sync().then(afterFirstSync); };
  ACTIONS["logout"] = function () { MP.signOut().then(function () { location.replace("anmelden.html"); }); };
  function firstRender() {
    if (App.booted) return;
    App.booted = true;
    renderNav(); route(); renderBanners(); renderSyncdot();
    if (MP.qs("welcome") === "1") {
      try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
      if (isAdmin()) welcome();
    }
  }
  function welcome() {
    modal({
      title: "Willkommen bei Vaydena Medizinproduktebuch",
      body: '<p>In vier Schritten ist die Dokumentation eingerichtet:</p><div class="obsteps">' +
        '<div class="obstep"><div class="n">1</div><div><b>Standorte anlegen</b><span>Räume oder Bereiche, in denen Geräte stehen.</span></div></div>' +
        '<div class="obstep"><div class="n">2</div><div><b>Geräte erfassen</b><span>Das Bestandsverzeichnis mit Hersteller, Seriennummer und Prüffristen.</span></div></div>' +
        '<div class="obstep"><div class="n">3</div><div><b>Etiketten drucken</b><span>QR-Etikett aufkleben – ein Scan öffnet das Gerät.</span></div></div>' +
        '<div class="obstep"><div class="n">4</div><div><b>Einträge dokumentieren</b><span>Funktionsprüfung, Einweisungen, STK, MTK, Instandhaltung und Störungen.</span></div></div></div>' +
        '<p class="help">Vaydena Medizinproduktebuch ist eine Dokumentationssoftware und kein Medizinprodukt. Die Betreiberpflichten bleiben bei Ihrer Einrichtung.</p>',
      foot: '<a class="btn ghost" href="#geraete/neu" data-act="welcome-new-device">Erstes Gerät anlegen</a><button class="btn primary" type="button" data-act="modal-close">Los geht’s</button>'
    });
  }
  function bindGlobal() {
    MPStore.on("change", function (evt) {
      if (App.tabBlocked) return;
      if (!App.booted) { if (evt && evt.kind === "pull" && S.tenant && S.member) firstRender(); return; }
      if (evt.rejected) toast(evt.rejected + (evt.rejected === 1 ? " Eintrag" : " Einträge") + " vom Server abgelehnt – siehe Konto.", "err", 4500);
      if (evt && evt.kind === "pull") renderNav();
      renderBanners(); renderSyncdot(); refresh(evt);
    });
    MPStore.on("storage", function (err) { if (!App.booted) return; renderBanners(); if (err === "write") toast("Daten konnten auf dem Gerät nicht gespeichert werden.", "err", 5000); });
    MPStore.on("sync", function () { if (App.tabBlocked) return; renderSyncdot(); if (App.booted) renderBanners(); if (App.booted && App.viewName === "konto" && !MPSync.st.syncing) softRender(); });
  }
  // ---------- Nur ein aktiver Tab: jeder Tab hält den Datenstand im Speicher und schreibt ihn komplett zurück.
  // Zwei gleichzeitig aktive Tabs würden sich gegenseitig offene Einträge überschreiben.
  var tab = { bc: null, state: "probe", seen: false, go: null };
  function tabGuard(go) {
    try { tab.bc = new BroadcastChannel("vaydena-mpbuch"); } catch (e) { tab.bc = null; }
    if (!tab.bc) { tab.state = "active"; go(); return; }
    tab.go = go;
    tab.bc.onmessage = function (ev) {
      var m = ev.data || {};
      if (m.t === "hello" && (tab.state === "active" || tab.state === "claim")) tab.bc.postMessage({ t: "busy" });
      else if (m.t === "busy" && tab.state === "probe") tab.seen = true;
      else if (m.t === "takeover" && tab.state === "active") tabRelease();
      else if (m.t === "released" && tab.state === "claim") tabActivate();
    };
    tab.bc.postMessage({ t: "hello" });
    setTimeout(function () {
      if (tab.state !== "probe") return;
      if (tab.seen) { tab.state = "blocked"; App.tabBlocked = true; splash("tab_busy"); } else tabActivate();
    }, 350);
  }
  function tabActivate() {
    if (tab.state === "active") return;
    var first = !tab.started; tab.state = "active"; tab.started = true; App.tabBlocked = false;
    if (first) tab.go(); else location.reload();
  }
  function tabRelease() {
    tab.state = "blocked"; App.tabBlocked = true;
    try { MPScan.stop(); } catch (e) {}
    MPSync.halt();
    closeModal(true); closeOverlay();
    var done = function () { MPStore.freeze(); tab.bc.postMessage({ t: "released" }); splash("tab_moved"); };
    MPStore.flush().then(done, done);
  }
  ACTIONS["tab-takeover"] = function (el) {
    if (el) el.disabled = true;
    tab.state = "claim"; tab.bc.postMessage({ t: "takeover" });
    setTimeout(function () { if (tab.state === "claim") tabActivate(); }, 2500);   // anderer Tab eingefroren/geschlossen
  };
  function boot() {
    var sess = MP.storedSession();
    if (!sess || !sess.user) { MP.requireSession("app.html" + location.search + location.hash); return; }
    App.userId = sess.user.id; App.userEmail = sess.user.email || "";
    bindEvents();
    tabGuard(bootData);
  }
  function bootData() {
    bindGlobal();
    MPStore.init(App.userId).then(function () {
      MPSync.start();
      if (S.tenant && S.member) { firstRender(); MPSync.sync(); return; }
      if (!navigator.onLine) { splash("offline"); return; }
      splash("loading");
      MPSync.sync().then(afterFirstSync);
    }).catch(function (e) { console.error(e); splash("error", (e && e.message) || ""); });
  }


  // =====================================================================
  // Fristen-Anzeige (gemeinsame Helfer)
  // =====================================================================
  var STATE_TXT = { over: "überfällig", soon: "bald fällig", ok: "in Frist", open: "Frist offen" };
  var STATE_PILL = { over: "red", soon: "gold", ok: "ok", open: "grey" };
  var STATE_IC = { over: "out", soon: "gold", ok: "in", open: "grey" };
  function statePill(st) { return st ? '<span class="pill ' + STATE_PILL[st] + '">' + STATE_TXT[st] + '</span>' : ""; }
  function dueText(due) {
    if (!due) return "Frist nicht festgelegt – Datum der Inbetriebnahme oder der letzten Kontrolle fehlt";
    var n = MPStore.daysUntil(due);
    return "fällig bis " + fmtBB(due) + (n < 0 ? " – seit " + (-n) + " Tag" + (n === -1 ? "" : "en") + " überfällig" : n === 0 ? " – heute" : " – in " + n + " Tag" + (n === 1 ? "" : "en"));
  }
  function devSub(d) {
    return [d.inv_no, [d.kind, d.model].filter(Boolean).join(" "), MPStore.locName(d.location_id)].filter(Boolean).join(" · ");
  }
  function devRow(d) {
    var st = MPStore.deviceState(d), off = !MPStore.inService(d);
    return '<a class="row" href="#geraete/' + encodeURIComponent(d.id) + '"><div class="ic ' + (off ? "grey" : (STATE_IC[st] || "")) + '">' + ic("box") + '</div>' +
      '<div class="txt"><div class="t">' + esc(d.name) + '</div><div class="s">' + esc(devSub(d)) + '</div></div>' +
      (off ? '<span class="pill grey">außer Betrieb</span>' : statePill(st === "ok" ? null : st)) +
      (MPStore.hasPendingChange("device", d.id) ? '<span class="pill gold">wartet</span>' : "") +
      '<div class="chev">' + ic("chev") + '</div></a>';
  }
  function dueRow(x) {
    return '<a class="row" href="#geraete/' + encodeURIComponent(x.device.id) + '"><div class="ic ' + STATE_IC[x.state] + '">' + ic("history") + '</div>' +
      '<div class="txt"><div class="t">' + TYPE_SHORT[x.type] + ' · ' + esc(x.device.name) + '</div><div class="s">' + esc(x.device.inv_no) + ' · ' + esc(dueText(x.due)) + '</div></div>' +
      statePill(x.state) + '<div class="chev">' + ic("chev") + '</div></a>';
  }
  var NOTE_MDR = '<p class="help">Vaydena Medizinproduktebuch ist eine Dokumentationssoftware und kein Medizinprodukt. Fristen werden rein kalendarisch aus Ihren Angaben berechnet; maßgeblich sind die Herstellerangaben und die MPBetreibV. Die Betreiberpflichten bleiben bei Ihrer Einrichtung.</p>';

  // =====================================================================
  // Übersicht
  // =====================================================================
  VIEWS.uebersicht = {
    title: "Übersicht",
    render: function () {
      var list = MPStore.dueList(), n = { over: 0, soon: 0, open: 0 };
      list.forEach(function (x) { if (n[x.state] != null) n[x.state]++; });
      var active = MPStore.activeDevices().filter(MPStore.inService).length;
      var urgent = list.filter(function (x) { return x.state === "over" || x.state === "soon"; }).slice(0, 8);
      var h = '<div class="ph"><h1>Übersicht</h1><div class="sub">' + esc(S.tenant ? S.tenant.name : "") + '</div></div>' +
        '<div class="kpis"><a class="kpi" href="#geraete"><b>' + nf.format(active) + '</b><span>Geräte in Betrieb</span></a>' +
        '<a class="kpi' + (n.over ? " err" : "") + '" href="#fristen"><b>' + nf.format(n.over) + '</b><span>Überfällig</span></a>' +
        '<a class="kpi' + (n.soon ? " warn" : "") + '" href="#fristen"><b>' + nf.format(n.soon) + '</b><span>Bald fällig</span></a>' +
        '<a class="kpi" href="#fristen"><b>' + nf.format(n.open) + '</b><span>Frist offen</span></a></div>';
      h += '<div class="btnrow" style="margin-bottom:14px"><a class="btn primary" href="#scan">' + ic("scan") + ' Gerät scannen</a>' +
        (isAdmin() ? '<a class="btn ghost" href="#geraete/neu">' + ic("plus") + ' Gerät anlegen</a>' : "") +
        '<a class="btn ghost" href="#geraete">' + ic("box") + ' Bestandsverzeichnis</a></div>';
      h += '<div class="sh">Dringende Fristen</div><div class="list">' +
        (urgent.length ? urgent.map(dueRow).join("") + '<a class="more" href="#fristen">Alle Fristen anzeigen</a>'
          : '<div class="empty">' + (active ? "Keine Kontrolle ist überfällig oder bald fällig." : "Noch keine Geräte erfasst.") + '</div>') + '</div>';
      return h + NOTE_MDR;
    }
  };

  // =====================================================================
  // Fristen
  // =====================================================================
  function dueFiltered() {
    var f = App.f.fristen.state;
    return MPStore.dueList().filter(function (x) { return f === "alle" || x.state === f; });
  }
  VIEWS.fristen = {
    title: "Fristen",
    render: function () {
      var f = App.f.fristen.state, list = dueFiltered();
      var seg = [["alle", "Alle"], ["over", "Überfällig"], ["soon", "Bald"], ["open", "Offen"]].map(function (o) {
        return '<button type="button" data-act="due-filter" data-v="' + o[0] + '"' + (f === o[0] ? ' class="on"' : "") + '>' + o[1] + '</button>';
      }).join("");
      return '<div class="ph"><h1>Fristen</h1><div class="spacer"></div><button class="btn ghost sm" type="button" data-act="due-csv">' + ic("download") + ' CSV</button>' +
        '<div class="sub">STK und MTK der Geräte in Betrieb – Vorwarnzeit ' + MPStore.warnDays() + ' Tage.</div></div>' +
        '<div class="seg">' + seg + '</div>' +
        '<div class="list">' + (list.length ? list.map(dueRow).join("") : '<div class="empty">Keine Fristen in dieser Auswahl.</div>') + '</div>' +
        '<p class="help">STK: mit Ablauf des Monats, MTK: mit Ablauf des Jahres, in dem die Frist endet. Eine im Eintrag angegebene nächste Fälligkeit hat Vorrang. Fristen erscheinen nur für Geräte, die als Anlage 1 (STK) bzw. Anlage 2 (MTK) gekennzeichnet sind.</p>';
    }
  };
  ACTIONS["due-filter"] = function (el) { App.f.fristen.state = el.getAttribute("data-v") || "alle"; renderView(); };
  ACTIONS["due-csv"] = function () {
    var rows = [["Inventarnummer", "Bezeichnung", "Standort", "Kontrolle", "Letzte Kontrolle", "Fällig bis", "Status"]];
    MPStore.dueList().forEach(function (x) {
      rows.push([x.device.inv_no, x.device.name, MPStore.locName(x.device.location_id), TYPE_SHORT[x.type], x.last ? fmtBB(x.last.date) : "", x.due ? fmtBB(x.due) : "", STATE_TXT[x.state] || ""]);
    });
    download("fristen-" + fileDate() + ".csv", csvText(rows));
  };

  // =====================================================================
  // Geräte: Bestandsverzeichnis, Editor, Medizinproduktebuch
  // =====================================================================
  function devList() {
    var f = App.f.geraete, all = MPStore.findDevices(f.q);
    return all.filter(function (d) { return f.state === "alle" || (f.state === "betrieb") === MPStore.inService(d); });
  }
  function renderDevList() {
    var box = byId("devList"); if (!box) return;
    var list = devList(), cnt = byId("devCnt");
    if (cnt) cnt.textContent = nf.format(list.length) + " Gerät" + (list.length === 1 ? "" : "e");
    box.innerHTML = list.length ? list.slice(0, 300).map(devRow).join("") + (list.length > 300 ? '<div class="empty">Weitere Treffer – bitte die Suche eingrenzen.</div>' : "")
      : '<div class="empty">' + (MPStore.deviceCount() ? "Kein Gerät passt zur Auswahl." : "Noch keine Geräte erfasst.") + '</div>';
  }
  INPUTS["dev-q"] = function (el) { App.f.geraete.q = el.value; renderDevList(); };
  INPUTS["dev-state"] = function (el) { App.f.geraete.state = el.value; renderDevList(); };

  function devListHtml() {
    var f = App.f.geraete;
    return '<div class="ph"><h1>Geräte</h1><div class="spacer"></div>' +
      '<button class="btn ghost sm" type="button" data-act="devices-csv">' + ic("download") + ' CSV</button>' +
      (isAdmin() ? '<a class="btn primary sm" href="#geraete/neu">' + ic("plus") + ' Gerät</a>' : "") +
      '<div class="sub">Bestandsverzeichnis nach § 14 MPBetreibV</div></div>' +
      '<div class="tools"><div class="search"><input type="search" placeholder="Suchen: Bezeichnung, Nummer, Hersteller, Standort" value="' + esc(f.q) + '" data-input="dev-q" data-noenter></div>' +
      '<select data-change="dev-state" aria-label="Status"><option value="betrieb"' + (f.state === "betrieb" ? " selected" : "") + '>In Betrieb</option><option value="ausser"' + (f.state === "ausser" ? " selected" : "") + '>Außer Betrieb</option><option value="alle"' + (f.state === "alle" ? " selected" : "") + '>Alle</option></select>' +
      '<span class="cnt" id="devCnt"></span></div><div class="list" id="devList"></div>';
  }

  // MTK-Fristen nach Anlage 2 MPBetreibV (Vorschläge; maßgeblich sind die Herstellerangaben)
  var MTK_PRESETS = [
    ["Ton- und Sprachaudiometer", 1], ["Medizinische Elektrothermometer", 2], ["Infrarot-Strahlungsthermometer", 1],
    ["Nichtinvasive Blutdruckmessgeräte", 2], ["Augentonometer", 2], ["Therapiedosimeter", 2], ["Diagnostikdosimeter", 5], ["Tretkurbelergometer", 2]
  ];
  function fld(label, name, val, attrs, hint) {
    return '<div class="field"><label>' + label + '</label><input name="' + name + '" value="' + esc(val == null ? "" : val) + '" ' + (attrs || "") + '>' + (hint ? '<div class="hint">' + hint + '</div>' : "") + '</div>';
  }
  function devEditHtml(d, isNew) {
    var locs = MPStore.activeLocations();
    return '<div class="ph"><a class="iconbtn" href="#geraete' + (isNew ? "" : "/" + encodeURIComponent(d.id)) + '" aria-label="Zurück">' + ic("back") + '</a><h1>' + (isNew ? "Gerät anlegen" : "Gerät bearbeiten") + '</h1></div>' +
      '<form class="card" data-form="device" data-id="' + esc(d.id) + '" data-new="' + (isNew ? "1" : "") + '"><h2>Bestandsverzeichnis</h2>' +
      '<div class="f2">' + fld("Bezeichnung *", "name", d.name, 'maxlength="200" required') + fld("Betriebliche Identifikationsnummer *", "inv_no", d.inv_no, 'maxlength="60" required class="mono"', "Inventarnummer – steht auch auf dem QR-Etikett.") + '</div>' +
      '<div class="f2">' + fld("Art des Produkts", "kind", d.kind, 'maxlength="200" placeholder="z. B. Defibrillator"') + fld("Typ / Modell", "model", d.model, 'maxlength="200"') + '</div>' +
      '<div class="f2">' + fld("Seriennummer / Loscode", "serial", d.serial, 'maxlength="120" class="mono"') + fld("Anschaffungsjahr", "year", d.year, 'type="number" min="1950" max="2100" inputmode="numeric"') + '</div>' +
      '<div class="f2">' + fld("Hersteller", "manufacturer", d.manufacturer, 'maxlength="200"') + fld("Anschrift des Herstellers", "manufacturer_address", d.manufacturer_address, 'maxlength="300"') + '</div>' +
      '<div class="f2"><div class="field"><label>Standort</label><select name="location_id"><option value="">– kein Standort –</option>' +
      locs.map(function (l) { return '<option value="' + esc(l.id) + '"' + (d.location_id === l.id ? " selected" : "") + '>' + esc(l.name) + '</option>'; }).join("") + '</select>' +
      (locs.length ? "" : '<div class="hint">Standorte lassen sich unter „Standorte“ anlegen.</div>') + '</div>' +
      fld("Betriebliche Zuordnung", "assignment", d.assignment, 'maxlength="200" placeholder="z. B. Station 3, Praxis EG"') + '</div>' +
      '<div class="f2">' + fld("Inbetriebnahme", "commissioned", d.commissioned, 'type="date"', "Ausgangspunkt für die erste Frist.") + fld("Außer Betrieb seit", "decommissioned_at", d.decommissioned_at, 'type="date"', "Leer = in Betrieb.") + '</div>' +
      '<h2 style="margin-top:18px">Kontrollen</h2>' +
      '<label class="check"><input type="checkbox" name="anlage1"' + (d.anlage1 ? " checked" : "") + '> Anlage 1 – sicherheitstechnische Kontrollen (STK)</label>' +
      fld("STK-Frist in Monaten", "stk_interval_months", d.stk_interval_months || 24, 'type="number" min="1" max="120" inputmode="numeric"', "Nach Herstellerangabe, spätestens alle 24 Monate (§ 12 MPBetreibV).") +
      '<label class="check"><input type="checkbox" name="anlage2"' + (d.anlage2 ? " checked" : "") + '> Anlage 2 – messtechnische Kontrollen (MTK)</label>' +
      '<div class="f2">' + fld("MTK-Frist in Jahren", "mtk_interval_years", d.mtk_interval_years, 'type="number" min="1" max="20" inputmode="numeric" id="mtkYears"') +
      '<div class="field"><label>Vorschlag nach Anlage 2</label><select data-change="mtk-preset"><option value="">– auswählen –</option>' +
      MTK_PRESETS.map(function (p) { return '<option value="' + p[1] + '">' + esc(p[0]) + ' – ' + p[1] + (p[1] === 1 ? " Jahr" : " Jahre") + '</option>'; }).join("") + '</select>' +
      '<div class="hint">Ob ein Gerät unter Anlage 1 oder 2 fällt und welche Frist gilt, legen Sie anhand der Herstellerangaben und der MPBetreibV fest.</div></div></div>' +
      '<div class="field"><label>Bemerkung</label><textarea name="note" rows="3" maxlength="2000">' + esc(d.note || "") + '</textarea></div>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button><a class="btn ghost" href="#geraete' + (isNew ? "" : "/" + encodeURIComponent(d.id)) + '">Abbrechen</a>' +
      (isNew ? "" : '<div class="spacer"></div><button class="btn ghost danger" type="button" data-act="device-delete" data-id="' + esc(d.id) + '">' + ic("trash") + ' Löschen</button>') + '</div></form>';
  }
  INPUTS["mtk-preset"] = function (el) { var i = byId("mtkYears"); if (i && el.value) i.value = el.value; };
  FORMS["device"] = function (f) {
    var v = formVals(f), isNew = f.getAttribute("data-new") === "1", id = f.getAttribute("data-id");
    var old = isNew ? {} : (S.devices.get(id) || {});
    if (!v.name) { toast("Bitte eine Bezeichnung angeben.", "warn"); return; }
    if (!v.inv_no) { toast("Bitte eine Inventarnummer angeben.", "warn"); return; }
    if (MPStore.invNoInUse(v.inv_no, id)) { toast("Diese Inventarnummer ist bereits vergeben.", "warn"); return; }
    var lim = (S.tenant && S.tenant.limits) || {};
    if (isNew && lim.devices && MPStore.deviceCount() >= lim.devices) { toast(errMsg("limit_devices"), "warn", 4500); return; }
    var year = v.year ? Number(v.year) : null, stk = Number(v.stk_interval_months) || 24, mtk = v.mtk_interval_years ? Number(v.mtk_interval_years) : null;
    if (year != null && !(year >= 1950 && year <= 2100)) { toast("Bitte ein gültiges Anschaffungsjahr angeben.", "warn"); return; }
    if (!(stk >= 1 && stk <= 120)) { toast("Die STK-Frist muss zwischen 1 und 120 Monaten liegen.", "warn"); return; }
    if (mtk != null && !(mtk >= 1 && mtk <= 20)) { toast("Die MTK-Frist muss zwischen 1 und 20 Jahren liegen.", "warn"); return; }
    if (v.anlage2 && !mtk) { toast("Bitte die MTK-Frist in Jahren angeben.", "warn"); return; }
    var rec = Object.assign({}, old, {
      id: id, name: v.name, inv_no: v.inv_no, kind: v.kind || null, model: v.model || null, serial: v.serial || null, year: year,
      manufacturer: v.manufacturer || null, manufacturer_address: v.manufacturer_address || null, location_id: v.location_id || null,
      assignment: v.assignment || null, anlage1: !!v.anlage1, anlage2: !!v.anlage2, stk_interval_months: stk, mtk_interval_years: mtk,
      commissioned: v.commissioned || null, decommissioned_at: v.decommissioned_at || null, note: v.note || null
    });
    MPStore.upsertDevice(rec).then(function () {
      MPSync.schedule(300); toast("Gerät gespeichert.", "ok"); nav("geraete/" + encodeURIComponent(id));
    });
  };
  ACTIONS["device-delete"] = function (el) {
    var id = el.getAttribute("data-id"), d = S.devices.get(id); if (!d) return;
    var n = MPStore.entriesOf(id).length;
    confirmDlg("Gerät „" + d.name + "“ (" + d.inv_no + ") löschen?" + (n ? " Zu diesem Gerät gibt es " + n + " Einträge." : "") +
      " Das Medizinproduktebuch ist nach der Außerbetriebnahme noch fünf Jahre aufzubewahren (§ 13 MPBetreibV). Für ausgemusterte Geräte bitte „Außer Betrieb seit“ eintragen – löschen nur bei irrtümlich angelegten Geräten.",
      { title: "Gerät löschen", ok: "Löschen", danger: true }).then(function (ok) {
      if (!ok) return;
      MPStore.deleteDevice(id).then(function () { MPSync.schedule(300); toast("Gerät gelöscht.", "ok"); nav("geraete"); });
    });
  };

  // ---------- Gerätedetail = Medizinproduktebuch ----------
  function kvRow(k, v) { return v == null || v === "" ? "" : '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>'; }
  function entrySummary(e) {
    var parts = [];
    if (e.type === "einweisung") {
      var p = e.persons || [];
      parts.push(p.length === 1 ? p[0].name : p.length + " Personen");
      if (e.instructor) parts.push("durch " + e.instructor);
    } else if (e.performer) parts.push(e.performer);
    if (e.result) parts.push(e.result);
    return parts.join(" · ");
  }
  function entryRow(e) {
    var corr = MPStore.correctionOf(e.id);
    return '<button class="row' + (e.pending ? " pending" : "") + '" type="button" data-act="entry-show" data-id="' + esc(e.id) + '"><div class="ic ' + (corr ? "grey" : "") + '">' + ic("clipboard") + '</div>' +
      '<div class="txt"><div class="t">' + esc(fmtBB(e.date)) + ' · ' + esc(TYPE_SHORT[e.type] || e.type) + '</div><div class="s">' + esc(entrySummary(e)) + '</div></div>' +
      (corr ? '<span class="pill grey">berichtigt</span>' : "") + (e.corrects ? '<span class="pill teal">Berichtigung</span>' : "") +
      (e.pending ? '<span class="pill gold">wartet</span>' : "") + '<div class="chev">' + ic("chev") + '</div></button>';
  }
  function devDetailHtml(d) {
    var id = esc(d.id), due = MPStore.dueOf(d), on = MPStore.inService(d), ents = MPStore.entriesOf(d.id);
    var h = '<div class="ph"><a class="iconbtn" href="#geraete" aria-label="Zurück">' + ic("back") + '</a><h1>' + esc(d.name) + '</h1><div class="spacer"></div>' +
      (isAdmin() ? '<a class="btn ghost sm" href="#geraete/' + encodeURIComponent(d.id) + '/edit">' + ic("edit") + ' Bearbeiten</a>' : "") +
      '<div class="sub mono">' + esc(d.inv_no) + (on ? "" : ' · außer Betrieb seit ' + esc(fmtBB(d.decommissioned_at))) + '</div></div>';
    if (on) ["stk", "mtk"].forEach(function (t) {
      var x = due[t]; if (!x) return;
      var st = MPStore.dueState(x);
      h += '<div class="card' + (st === "over" ? " err" : st === "soon" ? " warn" : "") + '"><div class="btnrow" style="align-items:center"><div style="flex:1;min-width:180px"><b>' + typeLabel(t) + '</b> ' + statePill(st) +
        '<div class="muted">' + esc(dueText(x.due)) + (x.last ? ' · zuletzt ' + esc(fmtBB(x.last.date)) : "") + '</div></div>' +
        '<button class="btn primary sm" type="button" data-act="entry-new" data-id="' + id + '" data-type="' + t + '">' + TYPE_SHORT[t] + ' dokumentieren</button></div></div>';
    });
    h += '<div class="card"><h2>Stammdaten</h2><dl class="kv">' + kvRow("Art", d.kind) + kvRow("Typ / Modell", d.model) + kvRow("Seriennummer", d.serial) +
      kvRow("Anschaffungsjahr", d.year) + kvRow("Hersteller", d.manufacturer) + kvRow("Anschrift", d.manufacturer_address) +
      kvRow("Standort", MPStore.locName(d.location_id)) + kvRow("Zuordnung", d.assignment) + kvRow("Inbetriebnahme", d.commissioned ? fmtBB(d.commissioned) : "") +
      kvRow("Kontrollen", [d.anlage1 ? "STK alle " + (d.stk_interval_months || 24) + " Monate" : "", d.anlage2 ? "MTK alle " + d.mtk_interval_years + (d.mtk_interval_years === 1 ? " Jahr" : " Jahre") : ""].filter(Boolean).join(", ") || "keine Frist hinterlegt") +
      kvRow("Bemerkung", d.note) + '</dl>' +
      '<div class="btnrow" style="margin-top:12px"><button class="btn ghost sm" type="button" data-act="label-one" data-id="' + id + '">' + ic("tag") + ' Etikett</button>' +
      '<button class="btn ghost sm" type="button" data-act="book-print" data-id="' + id + '">' + ic("print") + ' Drucken</button>' +
      '<button class="btn ghost sm" type="button" data-act="book-csv" data-id="' + id + '">' + ic("download") + ' CSV</button></div></div>';
    h += '<div class="card"><h2>Neuer Eintrag</h2><div class="btnrow">' + TYPE_ORDER.map(function (t) {
      return '<button class="btn ghost sm" type="button" data-act="entry-new" data-id="' + id + '" data-type="' + t + '">' + TYPE_SHORT[t] + '</button>';
    }).join("") + '</div></div>';
    h += '<div class="sh">Medizinproduktebuch (' + ents.length + ')</div><div class="list">' +
      (ents.length ? ents.map(entryRow).join("") : '<div class="empty">Noch keine Einträge zu diesem Gerät.</div>') + '</div>';
    return h;
  }
  function parseDevArg(arg) {
    var p = String(arg || "").split("/");
    if (!p[0]) return { mode: "list" };
    if (p[0] === "neu") return { mode: "new", code: p.slice(1).join("/") };
    return { mode: p[1] === "edit" ? "edit" : "detail", id: p[0] };
  }
  var newDev = { arg: null, rec: null };
  VIEWS.geraete = {
    title: function (arg) { var a = parseDevArg(arg), d = a.id && S.devices.get(a.id); return a.mode === "new" ? "Gerät anlegen" : d ? d.name : "Geräte"; },
    render: function (arg) {
      var a = parseDevArg(arg);
      if (a.mode === "list") return devListHtml();
      if (a.mode === "new") {
        if (!isAdmin()) return '<div class="card warn">Geräte legt die Administration an.</div>';
        if (newDev.arg !== arg || !newDev.rec) newDev = { arg: arg, rec: { id: MPStore.uuid(), inv_no: a.code || MPStore.nextInvNo(), stk_interval_months: 24 } };
        return devEditHtml(newDev.rec, true);
      }
      var d = S.devices.get(a.id);
      if (!d || d.deleted) return '<div class="ph"><a class="iconbtn" href="#geraete" aria-label="Zurück">' + ic("back") + '</a><h1>Gerät</h1></div><div class="card warn">Dieses Gerät ist nicht (mehr) vorhanden.</div>';
      if (a.mode === "edit") return isAdmin() ? devEditHtml(d, false) : '<div class="card warn">Geräte bearbeitet die Administration.</div>';
      return devDetailHtml(d);
    },
    mount: function (el, arg) { if (parseDevArg(arg).mode === "list") renderDevList(); },
    unmount: function () { newDev = { arg: null, rec: null }; },
    update: function () {
      var a = parseDevArg(App.route.arg);
      if (a.mode === "list") renderDevList(); else if (a.mode === "detail") softRender();
    }
  };

  // ---------- CSV ----------
  ACTIONS["devices-csv"] = function () {
    var rows = [["Inventarnummer", "Bezeichnung", "Art", "Typ/Modell", "Seriennummer", "Anschaffungsjahr", "Hersteller", "Anschrift Hersteller", "Standort", "Zuordnung",
      "Anlage 1 (STK)", "STK-Frist Monate", "Anlage 2 (MTK)", "MTK-Frist Jahre", "Inbetriebnahme", "Außer Betrieb seit", "Bemerkung"]];
    MPStore.findDevices("").forEach(function (d) {
      rows.push([d.inv_no, d.name, d.kind, d.model, d.serial, d.year, d.manufacturer, d.manufacturer_address, MPStore.locName(d.location_id), d.assignment,
        d.anlage1 ? "ja" : "nein", d.anlage1 ? (d.stk_interval_months || 24) : "", d.anlage2 ? "ja" : "nein", d.anlage2 ? d.mtk_interval_years : "",
        d.commissioned ? fmtBB(d.commissioned) : "", d.decommissioned_at ? fmtBB(d.decommissioned_at) : "", d.note]);
    });
    download("bestandsverzeichnis-" + fileDate() + ".csv", csvText(rows));
  };
  function entryCsvRow(d, e) {
    var corr = MPStore.correctionOf(e.id);
    return [d.inv_no, d.name, fmtBB(e.date), typeLabel(e.type), e.performer, e.instructor, (e.persons || []).map(function (p) { return p.name; }).join("; "), e.result,
      e.next_due ? fmtBB(e.next_due) : "", e.note, e.member_name || nameOfMember(e.member_id), e.created_at ? fmtDate(e.created_at) : "",
      e.corrects ? "Berichtigung" : "", corr ? "berichtigt am " + fmtBB(corr.date) : "", e.pending ? "noch nicht übertragen" : ""];
  }
  ACTIONS["book-csv"] = function (el) {
    var only = el.getAttribute("data-id");
    var rows = [["Inventarnummer", "Gerät", "Datum", "Art", "Durchgeführt von", "Einweisende Person", "Eingewiesene Personen", "Ergebnis / Beschreibung",
      "Nächste Fälligkeit", "Bemerkung", "Erfasst von", "Erfasst am", "Berichtigung", "Status", "Übertragung"]];
    var devs = only ? [S.devices.get(only)].filter(Boolean) : MPStore.findDevices("");
    devs.forEach(function (d) { MPStore.entriesOf(d.id).slice().reverse().forEach(function (e) { rows.push(entryCsvRow(d, e)); }); });
    download("medizinproduktebuch-" + (only && devs[0] ? String(devs[0].inv_no).replace(/[^\w-]+/g, "_") + "-" : "") + fileDate() + ".csv", csvText(rows));
  };


  // =====================================================================
  // Einträge im Medizinproduktebuch
  // =====================================================================
  var RESULT_LABEL = {
    funktionspruefung: "Ergebnis der Funktionsprüfung", stk: "Ergebnis der Kontrolle", mtk: "Ergebnis der Kontrolle (z. B. Messwerte in Toleranz)",
    it: "Ergebnis der Überprüfung", instandhaltung: "Durchgeführte Maßnahme", stoerung: "Art der Störung und Folgen", vorkommnis: "Gemeldeter Sachverhalt"
  };
  var PERF_LABEL = {
    funktionspruefung: "Durchgeführt von", stk: "Durchgeführt von (Person / Firma)", mtk: "Durchgeführt von (Person / Firma)", it: "Durchgeführt von",
    instandhaltung: "Durchgeführt von (Person / Firma)", stoerung: "Festgestellt von", vorkommnis: "Gemeldet von / an"
  };
  function entryFormHtml(d, type, src) {
    src = src || {};
    var me = S.member ? S.member.name : "", h = "", sel = {};
    (src.persons || []).forEach(function (p) { if (p.id) sel[p.id] = true; });
    h += '<form data-form="entry" data-device="' + esc(d.id) + '" data-type="' + type + '" data-corrects="' + esc(src.id || "") + '">' +
      '<p class="muted" style="margin-top:0">' + esc(d.inv_no) + ' · ' + esc(d.name) + '</p>' +
      (src.id ? '<p class="help">Der ursprüngliche Eintrag bleibt erhalten und wird als berichtigt gekennzeichnet.</p>' : "") +
      fld("Datum *", "date", src.date || todayIso(), 'type="date" required max="' + todayIso() + '"');
    if (type === "einweisung") {
      var pers = MPStore.activePersons();
      h += fld("Einweisende Person *", "instructor", src.instructor != null ? src.instructor : me, 'maxlength="200" required', "Vom Hersteller oder vom Betreiber beauftragte Person.") +
        '<div class="field"><label>Eingewiesene Personen *</label>' +
        (pers.length ? '<div class="sellist">' + pers.map(function (p) {
          return '<label><input type="checkbox" data-person="' + esc(p.id) + '"' + (sel[p.id] ? " checked" : "") + '> ' + esc(p.name) + (p.note ? ' <span class="s">' + esc(p.note) + '</span>' : "") + '</label>';
        }).join("") + '</div>' : '<div class="hint">Noch keine Personen angelegt – unter „Personen“ oder unten als Freitext.</div>') + '</div>' +
        '<div class="field"><label>Weitere Personen</label><textarea name="extra" rows="2" placeholder="Eine Person je Zeile">' +
        esc((src.persons || []).filter(function (p) { return !p.id; }).map(function (p) { return p.name; }).join("\n")) + '</textarea></div>';
    } else {
      h += fld(PERF_LABEL[type] + " *", "performer", src.performer != null ? src.performer : (type === "stk" || type === "mtk" ? "" : me), 'maxlength="200" required') +
        '<div class="field"><label>' + RESULT_LABEL[type] + ' *</label><textarea name="result" rows="2" maxlength="500" required>' + esc(src.result || "") + '</textarea></div>';
      if (type === "stk" || type === "mtk" || type === "it")
        h += fld("Nächste Fälligkeit", "next_due", src.next_due || "", 'type="date"', type === "it" ? "Optional." : "Leer = wird aus der hinterlegten Frist berechnet.");
    }
    h += '<div class="field"><label>Bemerkung</label><textarea name="note" rows="2" maxlength="4000">' + esc(src.note || "") + '</textarea></div>' +
      (type === "vorkommnis" ? '<p class="help">Hier dokumentieren Sie nur, dass und wann gemeldet wurde. Die Meldung selbst geht an die zuständige Behörde bzw. den Hersteller – diese Software übermittelt nichts.</p>' : "") +
      '<div class="btnrow"><button class="btn primary" type="submit">Eintrag speichern</button><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button></div></form>';
    return h;
  }
  function openEntryForm(d, type, src) {
    if (!TYPES[type]) return;
    modal({ title: (src ? "Berichtigung: " : "") + typeLabel(type), body: entryFormHtml(d, type, src) });
  }
  ACTIONS["entry-new"] = function (el) {
    var d = S.devices.get(el.getAttribute("data-id")); if (!d) return;
    if (st().subInactive) { toast(errMsg("subscription_inactive"), "warn", 4500); return; }
    openEntryForm(d, el.getAttribute("data-type"));
  };
  function st() { return MPSync.st; }
  FORMS["entry"] = function (f) {
    var v = formVals(f), type = f.getAttribute("data-type"), devId = f.getAttribute("data-device");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || "")) { toast("Bitte ein Datum angeben.", "warn"); return; }
    if (v.date > todayIso()) { toast("Das Datum darf nicht in der Zukunft liegen.", "warn"); return; }
    var persons = [];
    if (type === "einweisung") {
      $$("input[data-person]", f).forEach(function (c) {
        if (!c.checked) return;
        var p = S.persons.get(c.getAttribute("data-person")); if (p) persons.push({ id: p.id, name: p.name });
      });
      String(v.extra || "").split("\n").forEach(function (n) { n = n.trim().slice(0, 200); if (n) persons.push({ id: null, name: n }); });
      if (!v.instructor) { toast("Bitte die einweisende Person angeben.", "warn"); return; }
      if (!persons.length) { toast("Bitte mindestens eine eingewiesene Person angeben.", "warn"); return; }
    } else {
      if (!v.performer) { toast("Bitte angeben, wer es durchgeführt hat.", "warn"); return; }
      if (!v.result) { toast("Bitte das Ergebnis bzw. die Beschreibung angeben.", "warn"); return; }
      if (v.next_due && v.next_due <= v.date) { toast("Die nächste Fälligkeit muss nach dem Datum liegen.", "warn"); return; }
    }
    MPStore.addPending({
      id: MPStore.uuid(), device_id: devId, type: type, date: v.date, result: v.result || null, performer: v.performer || null,
      instructor: v.instructor || null, persons: persons, next_due: v.next_due || null, note: v.note || null,
      corrects: f.getAttribute("data-corrects") || null, created_at: MPStore.nowIso(),
      member_id: S.member ? S.member.id : null, member_name: S.member ? S.member.name : ""
    });
    MPSync.schedule(300); closeModal(); toast("Eintrag gespeichert.", "ok");
    if (App.viewName === "geraete") softRender();
  };
  function entryDetailHtml(e) {
    var corr = MPStore.correctionOf(e.id), orig = e.corrects ? MPStore.getEntry(e.corrects) : null;
    return '<dl class="kv">' + kvRow("Art", typeLabel(e.type)) + kvRow("Datum", fmtBB(e.date)) +
      kvRow("Einweisende Person", e.instructor) + kvRow("Eingewiesen", (e.persons || []).map(function (p) { return p.name; }).join(", ")) +
      kvRow(PERF_LABEL[e.type] || "Durchgeführt von", e.performer) + kvRow(RESULT_LABEL[e.type] || "Ergebnis", e.result) +
      kvRow("Nächste Fälligkeit", e.next_due ? fmtBB(e.next_due) : "") + kvRow("Bemerkung", e.note) +
      kvRow("Erfasst von", e.member_name || nameOfMember(e.member_id)) + kvRow("Erfasst am", e.created_at ? fmtDate(e.created_at) : "") + '</dl>' +
      (e.pending ? '<p class="help">Noch nicht übertragen – wird beim nächsten Abgleich gesendet.</p>' : "") +
      (orig ? '<p class="help">Berichtigt den Eintrag vom ' + esc(fmtBB(orig.date)) + '.</p>' : "") +
      (corr ? '<p class="help">Dieser Eintrag wurde am ' + esc(fmtDay(corr.created_at || corr.date)) + ' berichtigt und zählt nicht mehr für die Fristen.</p>' : "");
  }
  ACTIONS["entry-show"] = function (el) {
    var e = MPStore.getEntry(el.getAttribute("data-id")); if (!e) return;
    var can = !e.pending && !MPStore.correctionOf(e.id) && !st().subInactive;
    modal({
      title: TYPE_SHORT[e.type] + " vom " + fmtBB(e.date), body: entryDetailHtml(e),
      foot: (can ? '<button class="btn ghost" type="button" data-act="entry-correct" data-id="' + esc(e.id) + '">' + ic("edit") + ' Berichtigen</button>' : "") +
        '<button class="btn primary" type="button" data-act="modal-close">Schließen</button>'
    });
  };
  ACTIONS["entry-correct"] = function (el) {
    var e = MPStore.getEntry(el.getAttribute("data-id")), d = e && S.devices.get(e.device_id); if (!d) return;
    closeModal(true); openEntryForm(d, e.type, e);
  };

  // =====================================================================
  // Druck (Medizinproduktebuch je Gerät, Etiketten)
  // =====================================================================
  function printHtml(html) {
    var pa = byId("printArea"); if (!pa) return;
    pa.innerHTML = html;
    setTimeout(function () { window.print(); }, 60);
  }
  ACTIONS["book-print"] = function (el) {
    var d = S.devices.get(el.getAttribute("data-id")); if (!d) return;
    var ents = MPStore.entriesOf(d.id).slice().reverse();
    var h = '<div class="pr-doc"><h1>Medizinproduktebuch</h1><p class="pr-sub">' + esc(S.tenant ? S.tenant.name : "") + ' · Ausdruck vom ' + esc(fmtBB(todayIso())) + '</p>' +
      '<table class="pr-kv">' + [["Bezeichnung", d.name], ["Betriebliche Identifikationsnummer", d.inv_no], ["Art / Typ", [d.kind, d.model].filter(Boolean).join(" · ")], ["Seriennummer / Loscode", d.serial],
        ["Anschaffungsjahr", d.year], ["Hersteller", [d.manufacturer, d.manufacturer_address].filter(Boolean).join(", ")], ["Standort / Zuordnung", [MPStore.locName(d.location_id), d.assignment].filter(Boolean).join(" · ")],
        ["Inbetriebnahme", d.commissioned ? fmtBB(d.commissioned) : ""], ["Außer Betrieb seit", d.decommissioned_at ? fmtBB(d.decommissioned_at) : ""]]
        .filter(function (r) { return r[1] != null && r[1] !== ""; }).map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join("") + '</table>' +
      '<table class="pr-tbl"><thead><tr><th>Datum</th><th>Art</th><th>Personen</th><th>Ergebnis / Beschreibung</th><th>Erfasst</th></tr></thead><tbody>';
    ents.forEach(function (e) {
      var corr = MPStore.correctionOf(e.id);
      var who = e.type === "einweisung" ? "Eingewiesen: " + (e.persons || []).map(function (p) { return p.name; }).join(", ") + (e.instructor ? " – durch " + e.instructor : "") : (e.performer || "");
      h += '<tr' + (corr ? ' class="pr-void"' : "") + '><td>' + esc(fmtBB(e.date)) + '</td><td>' + esc(typeLabel(e.type)) + (e.corrects ? "<br>(Berichtigung)" : "") + (corr ? "<br>(berichtigt)" : "") + '</td><td>' + esc(who) + '</td><td>' +
        esc([e.result, e.next_due ? "Nächste Fälligkeit: " + fmtBB(e.next_due) : "", e.note].filter(Boolean).join(" · ")) + '</td><td>' +
        esc(e.member_name || nameOfMember(e.member_id)) + (e.created_at ? "<br>" + esc(fmtDate(e.created_at)) : "") + (e.pending ? "<br>(nicht übertragen)" : "") + '</td></tr>';
    });
    if (!ents.length) h += '<tr><td colspan="5">Keine Einträge.</td></tr>';
    printHtml(h + '</tbody></table></div>');
  };
  function labelUrl(d) { return location.origin + location.pathname + "#g=" + encodeURIComponent(d.inv_no); }
  function labelHtml(d) {
    var q = qrcode(0, "M"); q.addData(labelUrl(d)); q.make();
    return '<div class="pr-label"><div class="pr-qr">' + q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }) + '</div><div class="pr-lt"><b>' + esc(d.name) + '</b><span class="mono">' + esc(d.inv_no) + '</span>' +
      (d.serial ? '<span>SN ' + esc(d.serial) + '</span>' : "") + '<span>' + esc(S.tenant ? S.tenant.name : "") + '</span></div></div>';
  }
  function printLabels(devs) {
    if (!devs.length) { toast("Bitte mindestens ein Gerät auswählen.", "warn"); return; }
    if (typeof qrcode !== "function") { toast("Der QR-Code-Baustein konnte nicht geladen werden.", "err"); return; }
    printHtml('<div class="pr-labels">' + devs.map(labelHtml).join("") + '</div>');
  }
  ACTIONS["label-one"] = function (el) { var d = S.devices.get(el.getAttribute("data-id")); if (d) printLabels([d]); };

  // =====================================================================
  // Scannen
  // =====================================================================
  function scanHandle(text) {
    var code = String(text || "").trim(); if (!code) return;
    var hit = MPStore.resolveCode(code);
    if (hit) { MPScan.beep && MPScan.beep(); nav("geraete/" + encodeURIComponent(hit.rec.id)); return; }
    App.scan.last = MPStore.codeFromScan(code) || code;
    var box = byId("scanRes"); if (box) box.innerHTML = scanResHtml();
  }
  function scanResHtml() {
    var c = App.scan.last; if (!c) return "";
    return '<div class="card warn"><b>Kein Gerät mit der Nummer „' + esc(c) + '“ gefunden.</b>' +
      (isAdmin() ? '<div class="btnrow"><a class="btn primary sm" href="#geraete/neu/' + encodeURIComponent(c) + '">' + ic("plus") + ' Gerät mit dieser Nummer anlegen</a></div>'
        : '<div class="muted">Neue Geräte legt die Administration an.</div>') + '</div>';
  }
  VIEWS.scan = {
    title: "Scannen", cam: { box: "scanBox", reader: "scanReader", handler: scanHandle },
    render: function () {
      return '<div class="ph"><h1>Scannen</h1><div class="sub">QR-Etikett scannen – das Gerät öffnet sich mit Fristen und Medizinproduktebuch.</div></div>' +
        '<div id="scanBox"></div>' +
        '<div class="coderow"><input id="scanCode" class="mono" type="text" placeholder="Inventarnummer oder Seriennummer" autocomplete="off" autocapitalize="characters" data-enter="scan-go">' +
        '<button class="btn primary" type="button" data-act="scan-go">Öffnen</button></div><div id="scanRes">' + scanResHtml() + '</div>';
    },
    mount: function () {
      renderScanbox("scanBox", "scanReader", false);
      if (camPref()) startCam("scanBox", "scanReader", scanHandle);
      if (App.scan.queued) { var c = App.scan.queued; App.scan.queued = null; scanHandle(c); }
    },
    unmount: function () { App.scan.last = null; if (MPScan.isRunning && MPScan.isRunning()) MPScan.stop(); },
    onWedge: function (code) { scanHandle(code); },
    update: function () {}
  };
  ACTIONS["scan-go"] = function () { var i = byId("scanCode"); if (i && i.value.trim()) { scanHandle(i.value); i.select(); } };

  // =====================================================================
  // Personen und Standorte
  // =====================================================================
  function masterModal(kind, rec) {
    var isP = kind === "person", r = rec || {};
    modal({
      title: (rec ? "" : "Neu: ") + (isP ? "Person" : "Standort"),
      body: '<form data-form="master" data-kind="' + kind + '" data-id="' + esc(r.id || "") + '">' +
        fld("Name *", "name", r.name, 'maxlength="200" required') +
        fld(isP ? "Funktion / Bereich" : "Bemerkung", "note", r.note, 'maxlength="300"') +
        (isP && rec ? '<label class="check"><input type="checkbox" name="active"' + (r.active === false ? "" : " checked") + '> Aktiv (für Einweisungen auswählbar)</label>' : "") +
        '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button>' +
        (rec ? '<div class="spacer"></div><button class="btn ghost danger" type="button" data-act="master-delete" data-kind="' + kind + '" data-id="' + esc(r.id) + '">' + ic("trash") + ' Löschen</button>' : "") + '</div></form>'
    });
  }
  ACTIONS["master-new"] = function (el) { masterModal(el.getAttribute("data-kind"), null); };
  ACTIONS["master-edit"] = function (el) {
    var kind = el.getAttribute("data-kind"), rec = MPStore.mapOf(kind).get(el.getAttribute("data-id"));
    if (rec) masterModal(kind, rec);
  };
  FORMS["master"] = function (f) {
    var v = formVals(f), kind = f.getAttribute("data-kind"), id = f.getAttribute("data-id");
    if (!v.name) { toast("Bitte einen Namen angeben.", "warn"); return; }
    var rec = Object.assign({}, id ? MPStore.mapOf(kind).get(id) : {}, { id: id || MPStore.uuid(), name: v.name, note: v.note || null });
    if (kind === "person") rec.active = id ? !!v.active : true;
    (kind === "person" ? MPStore.upsertPerson(rec) : MPStore.upsertLocation(rec)).then(function () {
      MPSync.schedule(300); closeModal(); toast("Gespeichert.", "ok"); softRender();
    });
  };
  ACTIONS["master-delete"] = function (el) {
    var kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id"), rec = MPStore.mapOf(kind).get(id); if (!rec) return;
    var used = kind === "location" ? MPStore.activeDevices().filter(function (d) { return d.location_id === id; }).length : 0;
    if (used) { toast("Dem Standort sind noch " + used + " Gerät" + (used === 1 ? "" : "e") + " zugeordnet.", "warn", 4000); return; }
    closeModal(true);
    confirmDlg((kind === "person" ? "Person" : "Standort") + " „" + rec.name + "“ löschen?" + (kind === "person" ? " Bereits dokumentierte Einweisungen bleiben mit dem Namen erhalten." : ""),
      { title: "Löschen", ok: "Löschen", danger: true }).then(function (ok) {
      if (!ok) return;
      (kind === "person" ? MPStore.deletePerson(id) : MPStore.deleteLocation(id)).then(function () { MPSync.schedule(300); toast("Gelöscht.", "ok"); softRender(); });
    });
  };
  function masterRow(kind, r, sub) {
    return '<button class="row" type="button" data-act="master-edit" data-kind="' + kind + '" data-id="' + esc(r.id) + '"><div class="ic ' + (r.active === false ? "grey" : "") + '">' + ic(kind === "person" ? "user" : "pin") + '</div>' +
      '<div class="txt"><div class="t">' + esc(r.name) + '</div><div class="s">' + esc(sub) + '</div></div>' +
      (r.active === false ? '<span class="pill grey">inaktiv</span>' : "") + (MPStore.hasPendingChange(kind, r.id) ? '<span class="pill gold">wartet</span>' : "") +
      '<div class="chev">' + ic("chev") + '</div></button>';
  }
  function persListHtml() {
    var q = App.f.personen.q.trim().toLowerCase();
    var list = MPStore.activePersons(true).filter(function (p) { return !q || (p.name + " " + (p.note || "")).toLowerCase().indexOf(q) >= 0; });
    var cnt = {};
    S.entries.forEach(function (e) { if (e.type === "einweisung") (e.persons || []).forEach(function (p) { if (p.id) cnt[p.id] = (cnt[p.id] || 0) + 1; }); });
    return list.length ? list.map(function (p) {
      var n = cnt[p.id] || 0;
      return masterRow("person", p, [p.note, n + " Einweisung" + (n === 1 ? "" : "en")].filter(Boolean).join(" · "));
    }).join("") : '<div class="empty">' + (q ? "Keine Person passt zur Suche." : "Noch keine Personen angelegt.") + '</div>';
  }
  INPUTS["pers-q"] = function (el) { App.f.personen.q = el.value; var b = byId("persList"); if (b) b.innerHTML = persListHtml(); };
  VIEWS.personen = {
    title: "Personen",
    render: function () {
      return '<div class="ph"><h1>Personen</h1><div class="spacer"></div><button class="btn primary sm" type="button" data-act="master-new" data-kind="person">' + ic("plus") + ' Person</button>' +
        '<div class="sub">Anwenderinnen und Anwender für die Dokumentation von Einweisungen – keine App-Zugänge.</div></div>' +
        '<div class="tools"><div class="search"><input type="search" placeholder="Suchen" value="' + esc(App.f.personen.q) + '" data-input="pers-q" data-noenter></div></div>' +
        '<div class="list" id="persList">' + persListHtml() + '</div>';
    }
  };
  VIEWS.standorte = {
    title: "Standorte",
    render: function () {
      if (!isAdmin()) return '<div class="card warn">Standorte pflegt die Administration.</div>';
      var list = MPStore.activeLocations(), cnt = {};
      MPStore.activeDevices().forEach(function (d) { if (d.location_id) cnt[d.location_id] = (cnt[d.location_id] || 0) + 1; });
      return '<div class="ph"><h1>Standorte</h1><div class="spacer"></div><button class="btn primary sm" type="button" data-act="master-new" data-kind="location">' + ic("plus") + ' Standort</button>' +
        '<div class="sub">Räume oder Bereiche, in denen Geräte stehen.</div></div><div class="list">' +
        (list.length ? list.map(function (l) { var n = cnt[l.id] || 0; return masterRow("location", l, [l.note, n + " Gerät" + (n === 1 ? "" : "e")].filter(Boolean).join(" · ")); }).join("")
          : '<div class="empty">Noch keine Standorte angelegt.</div>') + '</div>';
    }
  };

  // =====================================================================
  // Etiketten
  // =====================================================================
  function labelDevs() { return MPStore.findDevices(App.f.etiketten.q).filter(MPStore.inService); }
  function labelListHtml() {
    var sel = App.f.etiketten.sel, list = labelDevs();
    return list.length ? list.slice(0, 500).map(function (d) {
      return '<label><input type="checkbox" data-change="label-sel" data-id="' + esc(d.id) + '"' + (sel[d.id] ? " checked" : "") + '> ' + esc(d.name) + ' <span class="s">' + esc(devSub(d)) + '</span></label>';
    }).join("") : '<div class="empty">Keine Geräte gefunden.</div>';
  }
  function labelCount() {
    var n = Object.keys(App.f.etiketten.sel).filter(function (id) { var d = S.devices.get(id); return d && MPStore.inService(d); }).length;
    var c = byId("labelCnt"); if (c) c.textContent = n + " ausgewählt";
  }
  INPUTS["label-sel"] = function (el) { var s = App.f.etiketten.sel, id = el.getAttribute("data-id"); if (el.checked) s[id] = true; else delete s[id]; labelCount(); };
  INPUTS["label-q"] = function (el) { App.f.etiketten.q = el.value; var b = byId("labelList"); if (b) b.innerHTML = labelListHtml(); };
  ACTIONS["label-all"] = function (el) {
    var on = el.getAttribute("data-v") === "1", s = App.f.etiketten.sel;
    labelDevs().forEach(function (d) { if (on) s[d.id] = true; else delete s[d.id]; });
    var b = byId("labelList"); if (b) b.innerHTML = labelListHtml(); labelCount();
  };
  ACTIONS["label-print"] = function () {
    printLabels(MPStore.findDevices("").filter(function (d) { return App.f.etiketten.sel[d.id] && MPStore.inService(d); }));
  };
  VIEWS.etiketten = {
    title: "Etiketten",
    render: function () {
      return '<div class="ph"><h1>Etiketten</h1><div class="spacer"></div><button class="btn primary sm" type="button" data-act="label-print">' + ic("print") + ' Drucken</button>' +
        '<div class="sub">QR-Etiketten mit Bezeichnung und Inventarnummer – ein Scan öffnet das Gerät in der App.</div></div>' +
        '<div class="tools"><div class="search"><input type="search" placeholder="Geräte suchen" value="' + esc(App.f.etiketten.q) + '" data-input="label-q" data-noenter></div><span class="cnt" id="labelCnt"></span></div>' +
        '<div class="btnrow top"><button class="btn ghost sm" type="button" data-act="label-all" data-v="1">Alle auswählen</button><button class="btn ghost sm" type="button" data-act="label-all" data-v="0">Auswahl aufheben</button></div>' +
        '<div class="sellist" id="labelList">' + labelListHtml() + '</div>' +
        '<p class="help">Gedruckt wird auf A4, drei Etiketten je Zeile (ca. 63 × 30 mm). Im Druckdialog „Tatsächliche Größe“ wählen.</p>';
    },
    mount: function () { labelCount(); },
    update: function () {}
  };


  var APP_VERSION = "1.1 (2026-10-02)";
  var ROLES = { admin: "Administrator", mitarbeiter: "Mitarbeiter" };
  function roleLabel(r) { return ROLES[r] || r || "–"; }
  function onlineOr(msg) { if (navigator.onLine) return true; toast(msg || "Dafür ist eine Internetverbindung nötig.", "warn"); return false; }
  function okRes(res) { return !!(res && res.status === 200 && res.data && res.data.ok); }
  function teamMembers() { return App.team.list || S.members || []; }

  function renderTeamList() {
    var box = byId("teamList"), cnt = byId("teamCnt"); if (!box) return;
    var list = teamMembers().slice().sort(function (a, b) {
      var aa = a.active === false ? 1 : 0, bb = b.active === false ? 1 : 0;
      return aa - bb || String(a.name || a.email || "").localeCompare(String(b.name || b.email || ""), "de");
    });
    var me = S.member && S.member.id;
    var limit = App.team.limit || (S.tenant && S.tenant.limits && S.tenant.limits.users) || 0;
    var active = list.filter(function (m) { return m.active !== false; }).length;
    if (cnt) cnt.textContent = active + (limit ? " von " + limit : "") + " aktive" + (active === 1 ? "r" : "") + " Nutzer";
    if (!list.length) { box.innerHTML = '<div class="empty">Noch keine Mitglieder geladen.</div>'; return; }
    box.innerHTML = list.map(function (m) {
      var self = m.id === me, off = m.active === false;
      return '<div class="row' + (off ? " pending" : "") + '">' +
        '<div class="ic ' + (m.role === "admin" ? "in" : "grey") + '">' + ic("user") + '</div>' +
        '<div class="txt"><div class="t">' + esc(m.name || m.email || "") + (self ? ' <span class="pill teal">Du</span>' : "") + (off ? ' <span class="pill grey">Deaktiviert</span>' : "") + '</div>' +
        '<div class="s">' + esc(m.email || "") + ' · ' + esc(roleLabel(m.role)) + (m.created_dmy ? ' · seit ' + esc(m.created_dmy) : "") + '</div></div>' +
        (self ? "" : '<div class="acts">' +
          ('<button class="btn ghost xs" type="button" data-act="member-role" data-id="' + esc(m.id) + '" data-role="' + (m.role === "admin" ? "mitarbeiter" : "admin") + '">' + (m.role === "admin" ? "Zum Mitarbeiter" : "Zum Admin") + '</button>') +
          '<button class="btn ghost xs" type="button" data-act="member-toggle" data-id="' + esc(m.id) + '" data-active="' + (off ? "1" : "0") + '">' + (off ? "Aktivieren" : "Deaktivieren") + '</button>' +
          '<button class="btn ghost xs danger" type="button" data-act="member-remove" data-id="' + esc(m.id) + '" aria-label="Entfernen" title="Aus dem Team entfernen">' + ic("trash") + '</button></div>') +
        '</div>';
    }).join("");
  }
  function loadTeam(force) {
    if (!navigator.onLine) { renderTeamList(); return Promise.resolve(false); }
    if (App.team.list && !force) { renderTeamList(); return Promise.resolve(true); }
    var box = byId("teamList"); if (box && !App.team.list) box.innerHTML = '<div class="empty">Lade Mitglieder …</div>';
    return MPSync.api("list_members", {}, 20000).then(function (res) {
      if (okRes(res)) { App.team.list = res.data.members || []; App.team.limit = res.data.limit || null; }
      else if (res.status !== 0) toast(apiErr(res), "err", 4000);
      renderTeamList();
      return okRes(res);
    });
  }
  VIEWS.team = {
    title: "Team",
    render: function () {
      var lim = (S.tenant && S.tenant.limits) || {};
      return '<div class="ph"><h1>Team</h1><div class="spacer"></div>' +
        '<button class="btn ghost sm" type="button" data-act="team-refresh" title="Neu laden">' + ic("refresh") + '</button>' +
        '<button class="btn primary sm" type="button" data-act="member-invite">' + ic("plus") + ' Einladen</button></div>' +
        '<p class="help">Mitarbeiter dokumentieren Einträge und pflegen Personen. Administratoren verwalten außerdem Geräte, Standorte, Team, Einrichtung und Abo. ' + (lim.users ? 'Der Tarif erlaubt ' + lim.users + ' aktive Nutzer.' : 'Die Zahl der Nutzer ist nicht begrenzt.') + '</p>' +
        '<div class="card"><div class="tools"><span class="cnt" id="teamCnt"></span></div><div class="list" id="teamList"></div></div>' +
        (navigator.onLine ? "" : '<p class="note">Offline – angezeigt wird der letzte bekannte Stand. Einladungen und Änderungen sind nur online möglich.</p>');
    },
    mount: function () { loadTeam(false); },
    update: function () { renderTeamList(); }
  };
  // =====================================================================
  // Protokoll (Admin)
  // =====================================================================
  var AUDIT = {
    location_deleted: "Standort gelöscht", person_deleted: "Person gelöscht", device_deleted: "Gerät gelöscht", entry_corrected: "Eintrag berichtigt",
    member_invited: "Teammitglied eingeladen", member_changed: "Teammitglied geändert", member_removed: "Teammitglied entfernt",
    company_changed: "Daten der Einrichtung geändert", plan_chosen: "Tarif bestellt",
    btm_enabled: "BtM-Buch aktiviert", btm_disabled: "BtM-Buch deaktiviert", btm_item_archived: "BtM-Präparat archiviert", btm_corrected: "BtM-Eintrag storniert"
  };
  var AUDIT_FIELDS = { name: "Name", inv_prefix: "Präfix", billing: "Rechnungsadresse", settings: "Einstellungen" };
  function auditDetail(e) {
    var d = e.detail || {};
    switch (e.action) {
        case "location_deleted": case "person_deleted": return d.name || "";
        case "device_deleted": return (d.inv_no || "") + " · " + (d.name || "");
        case "entry_corrected": { var dv = S.devices.get(d.device_id); return (dv ? dv.inv_no + " · " + dv.name : "Gerät") + " · " + typeLabel(d.type); }
      case "member_invited": return (d.email || "") + " · " + roleLabel(d.role) + (d.existing_account ? " · vorhandenes Konto" : "");
      case "member_changed": return (d.email || "") + (d.role ? " · Rolle: " + roleLabel(d.role) : "") + (d.active != null ? " · " + (d.active ? "aktiviert" : "deaktiviert") : "");
      case "member_removed": return d.email || "";
      case "btm_enabled": case "btm_disabled": return "";
      case "btm_item_archived": return d.name || "";
      case "btm_corrected": { var bi = S.btmItems.get(d.item_id); return bi ? bi.name : "Präparat"; }
      case "company_changed": return (Array.isArray(d.fields) ? d.fields.map(function (f) { return AUDIT_FIELDS[f] || f; }).join(", ") : "") + (d.name ? " · " + d.name : "");
      case "plan_chosen": return (PLANS[d.plan] ? PLANS[d.plan].label : (d.plan || "")) + (d.period ? " · " + (d.period === "jahr" ? "jährlich" : "monatlich") : "") + (d.invoice ? " · Rechnung " + d.invoice : "");
    }
    try { return JSON.stringify(d); } catch (x) { return ""; }
  }
  function renderAudit() {
    var box = byId("auditList"), a = App.audit; if (!box) return;
    if (!a.entries) { box.innerHTML = '<div class="empty">' + (a.loading ? "Wird geladen …" : navigator.onLine ? "Noch nicht geladen." : "Das Protokoll ist nur online verfügbar.") + '</div>'; return; }
    if (!a.entries.length) { box.innerHTML = '<div class="empty">Noch keine Einträge.</div>'; return; }
    box.innerHTML = a.entries.map(function (e) {
      return '<div class="row"><div class="ic grey">' + ic("history") + '</div><div class="txt"><div class="t">' + esc(AUDIT[e.action] || e.action) + '</div><div class="s">' + esc(auditDetail(e)) + '</div><div class="s">' + esc(e.actor || "System") + ' · ' + esc(fmtDate(e.created_at)) + '</div></div></div>';
    }).join("") + (a.more ? '<button class="more" type="button" data-act="audit-more"' + (a.loading ? " disabled" : "") + '>Weitere laden</button>' : "");
  }
  function loadAudit(more) {
    var a = App.audit; if (a.loading) return;
    if (!navigator.onLine) { renderAudit(); return; }
    var before = more && a.entries && a.entries.length ? a.entries[a.entries.length - 1].id : null;
    a.loading = true; renderAudit();
    MPSync.api("list_audit", before ? { before: before } : {}, 20000).then(function (res) {
      a.loading = false;
      if (!okRes(res)) { toast(apiErr(res), "err", 4000); renderAudit(); return; }
      a.entries = (more && a.entries ? a.entries : []).concat(res.data.entries || []); a.more = !!res.data.more;
      renderAudit();
    });
  }
  VIEWS.protokoll = {
    title: "Protokoll",
    render: function () {
      return '<div class="ph"><h1>Protokoll</h1><div class="spacer"></div><button class="btn ghost sm" type="button" data-act="audit-refresh" aria-label="Neu laden">' + ic("refresh") + '</button></div>' +
        '<p class="help">Wichtige Änderungen: Löschungen, Berichtigungen, Team, Einrichtungsdaten und Tarif. Die Einträge selbst stehen beim jeweiligen Gerät.</p>' +
        '<div class="card"><div class="list" id="auditList"></div></div>';
    },
    mount: function () { App.audit = { entries: null, more: false, loading: false }; loadAudit(false); },
    update: function () {}
  };
  ACTIONS["audit-more"] = function () { loadAudit(true); };
  ACTIONS["audit-refresh"] = function () { App.audit.entries = null; loadAudit(false); };

  ACTIONS["team-refresh"] = function () { loadTeam(true).then(function (ok) { if (ok) toast("Team aktualisiert.", "ok", 1500); }); };

  ACTIONS["member-invite"] = function () {
    if (!onlineOr("Einladen ist nur online möglich.")) return;
    modal({
      title: "Mitglied einladen",
      body: '<form data-form="invite" id="inviteForm" novalidate>' +
        '<div class="field"><label>Name</label><input name="name" type="text" required maxlength="80" autocomplete="off"></div>' +
        '<div class="field"><label>E-Mail-Adresse</label><input name="email" type="email" required maxlength="120" autocomplete="off" inputmode="email"></div>' +
      '<div class="field"><label>Rolle</label><select name="role"><option value="mitarbeiter">Mitarbeiter – Einträge dokumentieren</option><option value="admin">Administrator – alles verwalten</option></select></div>' +
        '<div class="msg hide" id="inviteMsg"></div>' +
        '<div class="btnrow"><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit" id="inviteBtn">Einladung erstellen</button></div></form>'
    });
  };
  FORMS.invite = function (f) {
    var v = formVals(f), msg = byId("inviteMsg"), btn = byId("inviteBtn");
    function err(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    if (!v.name || v.name.length < 2) return err("Bitte einen Namen eingeben.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) return err("Bitte eine gültige E-Mail-Adresse eingeben.");
    if (!onlineOr("Einladen ist nur online möglich.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Wird erstellt …"; }
    MPSync.api("invite", { name: v.name, email: v.email.toLowerCase(), role: v.role === "admin" ? "admin" : "mitarbeiter" }, 45000).then(function (res) {
      if (btn) { btn.disabled = false; btn.textContent = "Einladung erstellen"; }
      if (!okRes(res)) return err(apiErr(res));
      var link = res.data.invite_link || "";
      App.team.list = null; loadTeam(true); MPSync.schedule(800);
      if (res.data.existing_account) {
        return modal({
          title: "Mitglied hinzugefügt",
          body: '<p><b>' + esc(v.name) + '</b> ist als ' + esc(roleLabel(v.role === "admin" ? "admin" : "mitarbeiter")) + ' angelegt.</p>' +
            '<p>Für <b>' + esc(v.email) + '</b> gibt es bereits ein Vaydena-Konto. Die Person meldet sich mit ihrem bisherigen Passwort an' +
            (res.data.emailed ? ' und wurde per E-Mail benachrichtigt.' : ' – bitte ihr Bescheid geben (E-Mail-Versand war nicht möglich).') + '</p>' +
            '<p class="note">Passwort vergessen? Auf der Anmeldeseite „Passwort vergessen“ wählen.</p>',
          foot: '<button class="btn primary" type="button" data-act="modal-close">Fertig</button>'
        });
      }
      modal({
        title: "Einladung erstellt",
        body: '<p><b>' + esc(v.name) + '</b> ist als ' + esc(roleLabel(v.role === "admin" ? "admin" : "mitarbeiter")) + ' angelegt.' +
          (res.data.emailed ? ' Eine E-Mail mit dem Zugangslink wurde an <b>' + esc(v.email) + '</b> gesendet.' : ' Der E-Mail-Versand war nicht möglich – bitte den Link selbst weitergeben.') + '</p>' +
          '<div class="linkbox"><span class="mono">' + esc(link) + '</span><button class="btn ghost sm" type="button" data-act="copy-text" data-text="' + esc(link) + '">' + ic("copy") + ' Kopieren</button></div>' +
          '<p class="note">Mit dem Link legt die Person ihr Passwort fest. Er ist 7 Tage gültig.</p>',
        foot: '<button class="btn primary" type="button" data-act="modal-close">Fertig</button>'
      });
    });
  };
  function setMember(payload, okText) {
    if (!onlineOr("Änderungen am Team sind nur online möglich.")) return Promise.resolve(false);
    return MPSync.api("set_member", payload, 20000).then(function (res) {
      if (!okRes(res)) { toast(apiErr(res), "err", 4000); return false; }
      if (okText) toast(okText, "ok");
      MPSync.schedule(800);
      return loadTeam(true);
    });
  }
  ACTIONS["member-role"] = function (el) {
    var id = el.getAttribute("data-id"), role = el.getAttribute("data-role") === "admin" ? "admin" : "mitarbeiter";
    var m = teamMembers().find(function (x) { return x.id === id; }); if (!m) return;
    confirmDlg((m.name || m.email) + (role === "admin" ? " zum Administrator machen? Administratoren können alles verwalten – auch Team, Einrichtung und Abo." : " zum Mitarbeiter machen? Die Person kann dann nur noch Einträge dokumentieren und Personen pflegen."), { ok: "Rolle ändern" })
      .then(function (yes) { if (yes) setMember({ member_id: id, role: role }, "Rolle geändert."); });
  };
  ACTIONS["member-toggle"] = function (el) {
    var id = el.getAttribute("data-id"), activate = el.getAttribute("data-active") === "1";
    setMember({ member_id: id, active: activate }, activate ? "Zugang aktiviert." : "Zugang deaktiviert.");
  };
  ACTIONS["member-remove"] = function (el) {
    var id = el.getAttribute("data-id"), m = teamMembers().find(function (x) { return x.id === id; }); if (!m) return;
    confirmDlg((m.name || m.email) + " aus dem Team entfernen? Die Einträge der Person bleiben im Medizinproduktebuch erhalten.", { ok: "Entfernen", danger: true }).then(function (yes) {
      if (!yes || !onlineOr("Änderungen am Team sind nur online möglich.")) return;
      MPSync.api("remove_member", { member_id: id }, 20000).then(function (res) {
        if (!okRes(res)) { toast(apiErr(res), "err", 4000); return; }
        toast("Mitglied entfernt.", "ok"); loadTeam(true); MPSync.schedule(800);
      });
    });
  };

  var PLANS = {
    starter: { label: "Starter", monat: 900, jahr: 9000, feats: ["bis 3 Nutzer", "bis 30 Geräte", "alle Funktionen", "Offline-Betrieb"] },
    team: { label: "Team", monat: 1900, jahr: 19000, hot: true, feats: ["unbegrenzt viele Nutzer", "bis 1.000 Geräte", "alle Funktionen", "Offline-Betrieb"] }
  };
  function invoiceLink(inv) { return "zahlung.html?r=" + encodeURIComponent(inv.access_token || ""); }

  function saveCompany(payload, okText, btn) {
    if (!onlineOr("Firmendaten und Einstellungen lassen sich nur online ändern.")) return Promise.resolve(false);
    if (btn) btn.disabled = true;
    return MPSync.api("update_company", payload, 20000).then(function (res) {
      if (btn) btn.disabled = false;
      if (!okRes(res)) { toast(apiErr(res), "err", 4500); return false; }
      if (res.data.tenant) { S.tenant = res.data.tenant; MPStore.save("tenant", true); }
      renderBanners(); renderNav(); toast(okText || "Gespeichert.", "ok");
      return true;
    });
  }
  FORMS["company"] = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f);
    if (!v.name) { toast("Bitte den Namen der Einrichtung eingeben.", "warn"); return; }
    saveCompany({ name: v.name, inv_prefix: (v.inv_prefix || "MP").toUpperCase() }, "Gespeichert.", btn).then(function (ok) { if (ok) renderView(); });
  };
  FORMS.billing = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f);
    if (v.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email)) { toast("Bitte eine gültige E-Mail-Adresse für Rechnungen eingeben.", "warn"); return; }
    saveCompany({ billing: { recipient: v.recipient, street: v.street, zip: v.zip, city: v.city, email: v.email } }, "Rechnungsadresse gespeichert.", btn);
  };
  FORMS["settings"] = function (f) {
    var v = formVals(f), btn = $("button[type=submit]", f), days = parseInt(v.due_days, 10);
    if (!(days >= 1 && days <= 180)) { toast("Die Vorwarnzeit muss zwischen 1 und 180 Tagen liegen.", "warn"); return; }
    if (v.due_mail_to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.due_mail_to)) { toast(errMsg("bad_email"), "warn"); return; }
    saveCompany({ settings: { site: String(v.site || "").slice(0, 120), due_mail: !!v.due_mail, due_mail_to: v.due_mail_to || "", due_days: days, btm: !!v.btm } }, "Einstellungen gespeichert.", btn);
  };

  function renderPlans() {
    var box = byId("plans"); if (!box) return;
    var t = S.tenant || {}, per = App.firma.period === "jahr" ? "jahr" : "monat";
    box.innerHTML = Object.keys(PLANS).map(function (k) {
      var p = PLANS[k], cur = t.plan === k;
      return '<div class="plan' + (cur ? " cur" : "") + '"><div class="pn">' + esc(p.label) + (cur ? ' <span class="pill teal">Aktuell</span>' : (p.hot ? ' <span class="pill gold">Beliebt</span>' : "")) + '</div>' +
        '<b>' + esc(MP.euro(p[per])) + '</b><small>' + (per === "jahr" ? "pro Jahr – 2 Monate gratis" : "pro Monat") + '</small>' +
        '<ul>' + p.feats.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("") + '</ul>' +
        '<button class="btn ' + (cur || p.hot ? "primary" : "ghost") + ' block" type="button" data-act="choose-plan" data-plan="' + k + '">' + (cur ? "Verlängern" : "Auswählen") + '</button></div>';
    }).join("");
    $$('[data-act="plan-period"]').forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === per); });
  }
  ACTIONS["plan-period"] = function (el) { App.firma.period = el.getAttribute("data-v") === "jahr" ? "jahr" : "monat"; renderPlans(); };
  ACTIONS["choose-plan"] = function (el) {
    var plan = el.getAttribute("data-plan"), p = PLANS[plan]; if (!p) return;
    if (!onlineOr("Die Tarifwahl ist nur online möglich.")) return;
    var per = App.firma.period === "jahr" ? "jahr" : "monat", price = p[per];
    var open = (App.firma.invoices || []).filter(function (i) { return i.status === "open"; }).length;
    var html = '<p>Tarif <b>' + esc(p.label) + '</b> für ' + (per === "jahr" ? "12 Monate" : "1 Monat") + ' zum Preis von <b>' + esc(MP.euro(price)) + '</b> bestellen?</p>' +
      '<p class="note">Du erhältst eine Rechnung mit Bankverbindung und GiroCode. Nach Zahlungseingang wird der Tarif freigeschaltet (in der Regel innerhalb von 1–2 Werktagen). Keine automatische Verlängerung, keine Kündigungsfrist. Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen.</p>' +
      (open ? '<div class="msg info">Es gibt bereits ' + open + ' offene Rechnung' + (open === 1 ? "" : "en") + '. Nur bestellen, wenn wirklich eine weitere Rechnung gewünscht ist.</div>' : "");
    confirmDlg("", { title: "Tarif bestellen", html: html, ok: "Zahlungspflichtig bestellen" }).then(function (yes) {
      if (!yes) return;
      MPSync.api("choose_plan", { plan: plan, period: per }, 45000).then(function (res) {
        if (!okRes(res)) { toast(apiErr(res), "err", 5000); return; }
        App.firma.result = res.data.invoice; App.firma.invoices = null;
        renderView();
        var box = byId("planResult"); if (box && box.scrollIntoView) box.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  };
  function planResultHtml() {
    var r = App.firma.result; if (!r) return "";
    var link = invoiceLink(r);
    return '<div class="card navy" id="planResult"><h2>Rechnung ' + esc(r.number || "") + ' erstellt</h2>' +
      '<p>Betrag <b>' + esc(MP.euro(r.amount_cents)) + '</b>' + (r.due_dmy ? ', zahlbar bis ' + esc(r.due_dmy) : "") + '.' + (r.emailed ? " Die Rechnung wurde zusätzlich per E-Mail an die Rechnungsadresse gesendet." : "") + '</p>' +
      '<div class="btnrow"><a class="btn gold" href="' + esc(link) + '" target="_blank" rel="noopener">' + ic("ext") + ' Zahlseite öffnen – Überweisung / GiroCode</a>' +
      '<button class="btn ghost on-navy" type="button" data-act="copy-text" data-text="' + esc(location.href.replace(/app\.html.*$/, "") + link) + '">' + ic("copy") + ' Link kopieren</button></div></div>';
  }
  function loadInvoices(force) {
    var box = byId("invoiceList"); if (!box) return;
    if (!navigator.onLine) { box.innerHTML = '<div class="empty">Offline – Rechnungen sind nur online abrufbar.</div>'; return; }
    if (App.firma.invoices && !force) { renderInvoices(); return; }
    box.innerHTML = '<div class="empty">Lade Rechnungen …</div>';
    MPSync.api("my_invoices", {}, 20000).then(function (res) {
      if (!okRes(res)) { box.innerHTML = '<div class="empty">' + esc(apiErr(res)) + '</div>'; return; }
      App.firma.invoices = res.data.invoices || [];
      renderInvoices();
    });
  }
  function renderInvoices() {
    var box = byId("invoiceList"); if (!box) return;
    var list = App.firma.invoices || [];
    if (!list.length) { box.innerHTML = '<div class="empty">Noch keine Rechnungen.</div>'; return; }
    var ST = { open: ["gold", "Offen"], paid: ["ok", "Bezahlt"], void: ["grey", "Storniert"] };
    box.innerHTML = '<div class="tblwrap"><table class="tbl"><thead><tr><th>Nummer</th><th>Tarif</th><th class="num">Betrag</th><th>Status</th><th>Datum</th><th class="act"></th></tr></thead><tbody>' +
      list.map(function (i) {
        var s = ST[i.status] || ["grey", i.status];
        return '<tr><td class="mono">' + esc(i.number) + '</td><td>' + esc(i.plan_label || i.plan) + '<div class="s muted">' + (i.period === "jahr" ? "12 Monate" : "1 Monat") + '</div></td>' +
          '<td class="num">' + esc(MP.euro(i.amount_cents)) + '</td>' +
          '<td><span class="pill ' + s[0] + '">' + esc(s[1]) + '</span>' + (i.status === "open" && i.due_dmy ? '<div class="s muted">fällig ' + esc(i.due_dmy) + '</div>' : (i.status === "paid" && i.paid_dmy ? '<div class="s muted">am ' + esc(i.paid_dmy) + '</div>' : "")) + '</td>' +
          '<td>' + esc(i.issued_dmy || "") + '</td>' +
          '<td class="act"><a class="btn ghost xs" href="' + esc(invoiceLink(i)) + '" target="_blank" rel="noopener">' + (i.status === "open" ? "Zahlseite" : "Ansehen") + '</a></td></tr>';
      }).join("") + '</tbody></table></div>';
  }
  VIEWS.firma = {
    title: "Einrichtung & Abo",
    render: function () {
      var t = S.tenant || {}, lim = t.limits || {}, b = t.billing || {}, s = t.settings || {}, n = MPStore.deviceCount();
      var abo = '<dl class="kv"><dt>Einrichtung</dt><dd>' + esc(t.name || "–") + '</dd><dt>Tarif</dt><dd>' + esc(t.plan_label || t.plan || "–") + '</dd><dt>Status</dt><dd>' + esc(subText(t)) + '</dd>' +
        '<dt>Nutzer</dt><dd>' + (lim.users ? "bis " + lim.users : "unbegrenzt") + '</dd><dt>Geräte</dt><dd>' + nf.format(n) + (lim.devices ? " von " + nf.format(lim.devices) : "") + '</dd></dl>';
      var h = '<div class="ph"><h1>Einrichtung &amp; Abo</h1></div>';
      if (!isAdmin()) return h + '<div class="card"><h2>Abo</h2>' + abo + '<p class="help">Tarif und Daten der Einrichtung verwaltet die Administration.</p></div>';
      h += '<div class="card' + (t.sub && !t.sub.active ? " err" : "") + '"><h2>Abo</h2>' + abo + '</div>' + planResultHtml() +
        '<div class="card"><h2>Tarif wählen</h2><div class="seg"><button type="button" data-act="plan-period" data-v="monat"' + (App.firma.period === "monat" ? ' class="on"' : "") + '>Monatlich</button>' +
        '<button type="button" data-act="plan-period" data-v="jahr"' + (App.firma.period === "jahr" ? ' class="on"' : "") + '>Jährlich (2 Monate gespart)</button></div>' +
        '<div class="plans" id="plans"></div><p class="help">Nach der Bestellung erhalten Sie eine Rechnung mit Bankverbindung und GiroCode. Der Tarif wird nach Zahlungseingang freigeschaltet. ' +
        'Preise ohne Umsatzsteuer (§ 19 UStG), keine automatische Verlängerung.</p></div>' +
        '<div class="card"><h2>Rechnungen</h2><div class="list" id="invoiceList"><div class="empty">Wird geladen …</div></div></div>' +
        '<div class="card"><h2>Einrichtung</h2><form data-form="company">' + fld("Name der Einrichtung *", "name", t.name, 'maxlength="200" required') +
        fld("Präfix für Inventarnummern", "inv_prefix", t.inv_prefix || "MP", 'maxlength="6" pattern="[A-Za-z0-9]{1,6}"', "Neue Geräte erhalten z. B. MP-0001.") +
        '<div class="field"><label>Kontakt-E-Mail</label><input type="email" value="' + esc(t.contact_email || "") + '" disabled></div>' +
        '<div class="btnrow"><button class="btn primary sm" type="submit">Speichern</button></div></form></div>' +
        '<div class="card"><h2>Rechnungsanschrift</h2><form data-form="billing">' + fld("Empfänger", "recipient", b.recipient, 'maxlength="200"') + fld("Straße und Hausnummer", "street", b.street, 'maxlength="200"') +
        '<div class="f2">' + fld("PLZ", "zip", b.zip, 'maxlength="10"') + fld("Ort", "city", b.city, 'maxlength="120"') + '</div>' + fld("E-Mail für Rechnungen", "email", b.email, 'type="email" maxlength="200"') +
        '<div class="btnrow"><button class="btn primary sm" type="submit">Speichern</button></div></form></div>' +
        '<div class="card"><h2>Einstellungen</h2><form data-form="settings">' + fld("Standort / Betriebsstätte", "site", s.site, 'maxlength="120"', "Erscheint im Bestandsverzeichnis (§ 14 MPBetreibV).") +
        fld("Vorwarnzeit für Fristen (Tage)", "due_days", s.due_days || 30, 'type="number" min="1" max="180" inputmode="numeric"') +
        '<label class="check"><input type="checkbox" name="due_mail"' + (s.due_mail ? " checked" : "") + '> Fällige Prüffristen wöchentlich per E-Mail melden</label>' +
        fld("Empfänger der Fristen-E-Mail", "due_mail_to", s.due_mail_to, 'type="email" maxlength="200"', "Leer = Kontakt-E-Mail der Einrichtung.") +
        '<label class="check"><input type="checkbox" name="btm"' + (s.btm ? " checked" : "") + '> Modul „BtM-Buch“ (Betäubungsmittel-Nachweis) verwenden</label>' +
        '<div class="hint">Im BtM-Buch können bei Abgängen Namen von Patientinnen und Patienten stehen. Das sind Gesundheitsdaten – bitte schließen Sie vor der Nutzung einen Vertrag zur Auftragsverarbeitung mit uns (kontakt@vaydena.de). Beim Abschalten bleiben vorhandene Einträge gespeichert.</div>' +
        '<div class="btnrow"><button class="btn primary sm" type="submit">Speichern</button></div></form></div>' +
        '<div class="card"><h2>Daten exportieren</h2><p class="help">Ihre Daten gehören Ihnen. Das Medizinproduktebuch ist nach Außerbetriebnahme eines Geräts noch fünf Jahre aufzubewahren (§ 13 MPBetreibV) – sichern Sie es vor einer Kündigung.</p>' +
        '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="devices-csv">' + ic("download") + ' Bestandsverzeichnis (CSV)</button>' +
        '<button class="btn ghost sm" type="button" data-act="book-csv">' + ic("download") + ' Alle Einträge (CSV)</button>' +
        '<button class="btn ghost sm" type="button" data-act="export-json">' + ic("download") + ' Vollständiger Export (JSON)</button></div></div>';
      return h;
    },
    mount: function () { if (!isAdmin()) return; renderPlans(); loadInvoices(false); },
    update: function (evt) { if (evt && evt.kind === "pull") softRender(); }
  };
  ACTIONS["export-json"] = function (el) {
    if (!onlineOr("Der Export ist nur online möglich.")) return;
    el.disabled = true;
    MPSync.api("export", {}, 120000).then(function (res) {
      el.disabled = false;
      if (!okRes(res)) { toast(apiErr(res), "err", 4000); return; }
      download("vaydena-mpbuch-export-" + fileDate() + ".json", JSON.stringify(res.data, null, 1), "application/json");
      toast("Export erstellt.", "ok");
    });
  };

  var KIND_LABEL = { location: "Standort", person: "Person", device: "Gerät", btm_item: "BtM-Präparat" };
  function conflictRow(o) {
    var rec = MPStore.mapOf(o.kind).get(o.id) || {};
    var href = o.kind === "device" ? "#geraete/" + encodeURIComponent(o.id) : o.kind === "person" ? "#personen" : o.kind === "btm_item" ? "#btm/" + encodeURIComponent(o.id) : "#standorte";
    return '<div class="row"><div class="ic grey">' + ic("warn") + '</div><div class="txt"><div class="t">' + esc(KIND_LABEL[o.kind] || o.kind) + ': ' + esc(rec.name || "–") + '</div>' +
      '<div class="s errtxt">' + esc(errMsg(o.error)) + (o.error_at ? ' · ' + esc(relTime(o.error_at)) : "") + '</div></div><div class="acts">' +
      (rec.deleted ? "" : '<a class="btn ghost sm" href="' + href + '">Bearbeiten</a>') +
      '<button class="btn ghost sm" type="button" data-act="conflict-retry" data-kind="' + o.kind + '" data-id="' + esc(o.id) + '">Erneut senden</button>' +
      '<button class="btn ghost sm danger" type="button" data-act="conflict-drop" data-kind="' + o.kind + '" data-id="' + esc(o.id) + '">Verwerfen</button></div></div>';
  }
  function failedHtml() {
    if (!S.failed.length && !S.btmFailed.length) return "";
    return '<h3>Abgelehnte Einträge</h3><p class="help">Diese Einträge hat der Server nicht angenommen. Sie stehen nicht im Medizinproduktebuch – bitte prüfen und bei Bedarf neu erfassen.</p><div class="list">' +
      S.failed.map(function (e) {
        var d = S.devices.get(e.device_id);
        return '<div class="row"><div class="ic grey">' + ic("warn") + '</div><div class="txt"><div class="t">' + esc(TYPE_SHORT[e.type] || e.type) + ' vom ' + esc(fmtBB(e.date)) + ' · ' + esc(d ? d.inv_no + " " + d.name : "Gerät") + '</div>' +
          '<div class="s errtxt">' + esc(errMsg(e.error)) + (e.failed_at ? ' · ' + esc(relTime(e.failed_at)) : "") + '</div></div></div>';
      }).join("") + S.btmFailed.map(function (e) {
        var bi = S.btmItems.get(e.item_id);
        return '<div class="row"><div class="ic grey">' + ic("warn") + '</div><div class="txt"><div class="t">BtM-Buch: ' + (e.what === "check" ? "Monatsprüfung " + esc(e.month || "") : (e.kind === "zugang" ? "Zugang" : "Abgang") + " vom " + esc(fmtBB(e.date))) + ' · ' + esc(bi ? bi.name : "Präparat") + '</div>' +
          '<div class="s errtxt">' + esc(errMsg(e.error)) + (e.failed_at ? ' · ' + esc(relTime(e.failed_at)) : "") + '</div></div></div>';
      }).join("") + '</div><div class="btnrow"><button class="btn ghost sm" type="button" data-act="failed-clear">Liste leeren</button></div>';
  }
  ACTIONS["failed-clear"] = function () {
    confirmDlg("Die Liste der abgelehnten Einträge leeren?", { title: "Liste leeren", ok: "Leeren" }).then(function (ok) {
      if (ok) Promise.resolve(MPStore.clearFailed()).then(function () { softRender(); renderBanners(); });
    });
  };
  ACTIONS["full-reload"] = function () {
    if (!navigator.onLine) { toast("Das geht nur mit Internetverbindung.", "warn"); return; }
    S.meta.since = null;
    MPStore.save("meta", true).then(function () { toast("Vollständiger Abgleich gestartet …"); return MPSync.sync(); }).then(function (ok) {
      if (ok) toast("Alle Daten neu geladen.", "ok");
      else if (!MPSync.st.syncing) toast(errMsg(MPSync.st.lastError), "err", 4000);
    });
  };
  VIEWS.konto = {
    title: "Konto",
    render: function () {
      var t = S.tenant || {}, m = S.member || {}, st = MPSync.st, c = MPSync.counts();
      var conflicts = S.outbox.filter(function (o) { return o.error; });
      var h = '<div class="ph"><h1>Konto</h1></div>';
      h += '<div class="card"><h2>' + esc(m.name || App.userEmail || "Konto") + '</h2><dl class="kv"><dt>E-Mail</dt><dd>' + esc(m.email || App.userEmail || "–") + '</dd><dt>Rolle</dt><dd>' + esc(roleLabel(m.role)) + '</dd><dt>Einrichtung</dt><dd>' + esc(t.name || "–") + '</dd></dl>' +
        '<div class="btnrow"><button class="btn ghost sm" type="button" data-act="pw-change">' + ic("edit") + ' Passwort ändern</button><button class="btn ghost sm" type="button" data-act="logout-soft">Abmelden</button></div></div>';
      var statusTxt = st.syncing ? "Abgleich läuft …" : st.offline ? "Offline" : st.authLost ? "Anmeldung abgelaufen" : st.blocked ? errMsg(st.blocked) : st.subInactive ? "Abo nicht aktiv – Lesen möglich, Übertragen gesperrt" : st.lastError ? errMsg(st.lastError) : "Verbunden";
      var syncCls = st.authLost || st.blocked || conflicts.length || c.failed ? " err" : (st.offline || st.subInactive || c.pending ? " warn" : "");
      h += '<div class="card' + syncCls + '"><h2>Abgleich</h2><dl class="kv">' +
        '<dt>Status</dt><dd>' + esc(statusTxt) + '</dd>' +
        '<dt>Letzter Abgleich</dt><dd>' + (S.meta.last_sync ? esc(fmtDate(S.meta.last_sync)) + ' (' + esc(relTime(S.meta.last_sync)) + ')' : "noch nie") + '</dd>' +
        '<dt>Wartend</dt><dd>' + c.pending + ' Änderung' + (c.pending === 1 ? "" : "en") + '</dd>' +
        (c.failed ? '<dt>Abgelehnt</dt><dd>' + c.failed + (c.failed === 1 ? ' Eintrag' : ' Einträge') + ' – siehe unten</dd>' : "") + '</dl>' +
        '<div class="btnrow"><button class="btn primary sm" type="button" data-act="sync-now"' + (st.syncing ? " disabled" : "") + '>' + ic("refresh") + ' Jetzt abgleichen</button><button class="btn ghost sm" type="button" data-act="full-reload">Alle Daten neu laden</button></div>' +
        (conflicts.length ? '<h3>Vom Server abgelehnte Änderungen</h3><p class="help">Diese Stammdaten-Änderungen wurden abgelehnt (z. B. doppelte Inventarnummer). Bearbeiten und erneut senden – oder verwerfen, dann gilt wieder der Stand vom Server.</p><div class="list">' + conflicts.map(conflictRow).join("") + '</div>' : "") + failedHtml() + '</div>';;
      var installed = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
      var ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
      h += '<div class="card"><h2>App &amp; Gerät</h2>' +
        (installed ? '<p class="note">Die App ist auf diesem Gerät installiert.</p>' :
          App.installPrompt ? '<p>Als App installieren: eigenes Symbol auf dem Startbildschirm, Vollbild, schneller Start – auch offline.</p><div class="btnrow"><button class="btn primary sm" type="button" data-act="install-app">' + ic("download") + ' App installieren</button></div>' :
          ios ? '<p class="note">Auf iPhone und iPad: in Safari das Teilen-Symbol antippen und „Zum Home-Bildschirm“ wählen. Danach startet Vaydena Medizinproduktebuch wie eine installierte App – auch offline.</p>' :
          '<p class="note">Zum Installieren im Browser-Menü „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen.</p>') +
        '<dl class="kv"><dt>Kamera-Scan</dt><dd>' + (MPScan.supported() ? "verfügbar" : (MPScan.secure() ? "auf diesem Gerät nicht verfügbar" : "nur über HTTPS verfügbar")) + '</dd>' +
        '<dt>Dauerhafter Speicher</dt><dd>' + (!S.persistent ? "nein – Offline-Daten können beim Schließen verloren gehen" : S.storageError === "write" ? "Fehler beim Speichern (Speicher voll?)" : S.persisted ? "ja (vom Browser geschützt)" : "ja – der Browser kann Daten bei Speichermangel löschen") + '</dd>' +
        '<dt>Gerät</dt><dd class="mono">' + esc(String(S.meta.device_id || "").slice(0, 8)) + '</dd>' +
        '<dt>Version</dt><dd>' + esc(APP_VERSION) + '</dd></dl>' +
        '<label class="check"><input type="checkbox" data-change="cam-pref"' + (camPref() ? " checked" : "") + '> Kamera beim Öffnen von „Scannen“ automatisch starten</label></div>';
      h += '<div class="card"><h2>Daten auf diesem Gerät</h2><p class="help">Geräte, Personen und Einträge liegen für den Offline-Betrieb auf diesem Gerät. Beim Löschen werden sie entfernt – noch nicht übertragene Einträge gehen dabei verloren. Auf dem Server bleibt alles erhalten.</p>' +
        '<div class="btnrow"><button class="btn danger sm" type="button" data-act="logout-wipe">' + ic("trash") + ' Abmelden und lokale Daten löschen</button></div></div>';
      h += '<p class="note center">Vaydena Medizinproduktebuch ist eine Dokumentationssoftware und kein Medizinprodukt.</p><p class="note center"><a href="datenschutz.html" target="_blank" rel="noopener">Datenschutz</a> · <a href="agb.html" target="_blank" rel="noopener">AGB</a> · <a href="impressum.html" target="_blank" rel="noopener">Impressum</a></p>';
      return h;
    }
  };
  ACTIONS["conflict-retry"] = function (el) {
    var kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id");
    MPStore.queue(kind, id);
    MPStore.save("outbox", true).then(function () {
      renderBanners(); renderSyncdot(); renderView();
      if (navigator.onLine) MPSync.sync(); else toast("Wird beim nächsten Abgleich erneut gesendet.");
    });
  };
  ACTIONS["conflict-drop"] = function (el) {
    var kind = el.getAttribute("data-kind"), id = el.getAttribute("data-id");
    confirmDlg("Die lokale Änderung verwerfen? Danach gilt wieder der Stand vom Server (wird beim nächsten Abgleich geladen).", { ok: "Verwerfen", danger: true }).then(function (yes) {
      if (!yes) return;
      MPStore.dropOutbox({ kind: kind, id: id }, true).then(function () { S.meta.since = null; return MPStore.save("meta", true); })
        .then(function () { renderBanners(); renderSyncdot(); renderView(); if (navigator.onLine) MPSync.sync(); });
    });
  };
  ACTIONS["install-app"] = function () {
    var p = App.installPrompt; if (!p) { toast("Installation über das Browser-Menü möglich."); return; }
    try { p.prompt(); } catch (e) { toast("Installation über das Browser-Menü möglich."); return; }
    (p.userChoice || Promise.resolve({})).then(function (r) { App.installPrompt = null; if (r && r.outcome === "accepted") toast("App wird installiert.", "ok"); softRender(); }).catch(function () { App.installPrompt = null; });
  };
  INPUTS["cam-pref"] = function (el) { setCamPref(el.checked); toast(el.checked ? "Die Kamera startet künftig automatisch." : "Die Kamera startet nur noch auf Tipp."); };
  ACTIONS["pw-change"] = function () {
    if (!onlineOr("Das Passwort lässt sich nur online ändern.")) return;
    if (!MP.sb) { location.href = "anmelden.html#passwort"; return; }
    modal({
      title: "Passwort ändern",
      body: '<form data-form="password" novalidate>' +
        '<div class="field"><label>Neues Passwort</label><input name="pw1" type="password" minlength="8" required autocomplete="new-password"><div class="hint">Mindestens 8 Zeichen.</div></div>' +
        '<div class="field"><label>Neues Passwort wiederholen</label><input name="pw2" type="password" required autocomplete="new-password"></div>' +
        '<div class="msg hide" id="pwMsg"></div>' +
        '<div class="btnrow"><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button><button class="btn primary" type="submit">Passwort speichern</button></div></form>'
    });
  };
  FORMS.password = function (f) {
    var pw1 = f.pw1 ? f.pw1.value : "", pw2 = f.pw2 ? f.pw2.value : "", msg = byId("pwMsg"), btn = $("button[type=submit]", f);
    function err(t) { if (msg) { msg.className = "msg err"; msg.textContent = t; } }
    if (pw1.length < 8) return err("Das Passwort muss mindestens 8 Zeichen haben.");
    if (pw1 !== pw2) return err("Die Passwörter stimmen nicht überein.");
    if (!MP.sb || !MP.sb.auth) return err("Passwortänderung ist in diesem Browser nicht verfügbar.");
    if (btn) btn.disabled = true;
    MP.sb.auth.updateUser({ password: pw1 }).then(function (r) {
      if (btn) btn.disabled = false;
      if (r && r.error) return err(/same password|different from the old/i.test(String(r.error.message || "")) ? "Das neue Passwort darf nicht dem bisherigen entsprechen." : "Das Passwort konnte nicht geändert werden. Bitte neu anmelden und erneut versuchen.");
      closeModal(true); toast("Passwort geändert.", "ok");
    }).catch(function () { if (btn) btn.disabled = false; err("Das Passwort konnte nicht geändert werden."); });
  };
  ACTIONS["logout-soft"] = function () {
    var c = MPSync.counts(), n = c.pending + c.conflicts;
    var p = n ? confirmDlg(n + " Änderung" + (n === 1 ? "" : "en") + " wurde" + (n === 1 ? "" : "n") + " noch nicht übertragen. Sie bleiben auf diesem Gerät gespeichert und werden nach der nächsten Anmeldung mit demselben Konto übertragen. Trotzdem abmelden?", { ok: "Abmelden" }) : Promise.resolve(true);
    p.then(function (yes) { if (!yes) return; MP.signOut().then(function () { location.href = "anmelden.html"; }).catch(function () { location.href = "anmelden.html"; }); });
  };
  ACTIONS["logout-wipe"] = function () {
    var c = MPSync.counts(), n = c.pending + c.conflicts;
    confirmDlg("Alle lokal gespeicherten Daten dieses Betriebs werden von diesem Gerät entfernt" + (n ? " – einschließlich " + n + " noch nicht übertragener Änderung" + (n === 1 ? "" : "en") + ", die damit verloren " + (n === 1 ? "geht" : "gehen") : "") + ". Auf dem Server bleibt alles erhalten.", { ok: "Löschen und abmelden", danger: true, title: "Lokale Daten löschen" }).then(function (yes) {
      if (!yes) return;
      MPStore.clearAll().then(function () { return MP.signOut(); }).then(function () { location.href = "anmelden.html"; }).catch(function () { location.href = "anmelden.html"; });
    });
  };

  // =====================================================================
  // BtM-Buch (Betäubungsmittel-Nachweis) – zuschaltbares Modul
  // =====================================================================
  var BTM_UNITS = ["Stück", "ml", "mg", "g", "µg"];
  var NOTE_BTM = '<p class="help">Das BtM-Buch dokumentiert Ihre Angaben und errechnet daraus den Bestand. Ob diese Form des Nachweises den für Sie geltenden Vorgaben entspricht (BtMVV §§ 13, 14, amtliches Formblatt), klären Sie bitte mit Ihrer zuständigen Behörde. Ein Ausdruck ist jederzeit möglich.</p>';
  function btmOn() { return !!settings().btm; }
  function q3(n) { return String(MPStore.round3(Number(n) || 0)).replace(".", ","); }
  function parseQty(s) {
    s = String(s == null ? "" : s).trim().replace(",", ".");
    if (!/^\d{1,10}(\.\d{1,3})?$/.test(s)) return null;
    var n = Number(s); return n > 0 ? n : null;
  }
  function btmSub(i) { return [i.form, i.storage].filter(Boolean).join(" · "); }
  function btmBlocked() {
    if (st().subInactive) { toast(errMsg("subscription_inactive"), "warn", 4500); return true; }
    return false;
  }
  function btmListHtml() {
    var arch = !!App.f.btm.arch, list = MPStore.btmItemsList(arch), nArch = MPStore.btmItemsList(true).length;
    var h = '<div class="ph"><h1>BtM-Buch</h1><div class="spacer"></div>' +
      (isAdmin() && !arch ? '<button class="btn primary sm" type="button" data-act="btm-item-new">' + ic("plus") + ' Präparat</button>' : "") +
      '<div class="sub">Nachweis über Zugänge, Abgänge und Bestand – je Betäubungsmittel eine Karteikarte.</div></div>';
    if (nArch || arch) h += '<div class="seg"><button type="button" data-act="btm-arch" data-v="0"' + (arch ? "" : ' class="on"') + '>Aktiv</button><button type="button" data-act="btm-arch" data-v="1"' + (arch ? ' class="on"' : "") + '>Archiviert (' + nArch + ')</button></div>';
    h += '<div class="list">' + (list.length ? list.map(function (i) {
      var conflict = S.outbox.some(function (o) { return o.kind === "btm_item" && o.id === i.id && o.error; });
      return '<a class="row" href="#btm/' + encodeURIComponent(i.id) + '"><div class="ic' + (arch ? " grey" : "") + '">' + ic("clipboard") + '</div><div class="txt"><div class="t">' + esc(i.name) + '</div>' +
        '<div class="s">' + esc(btmSub(i) || "–") + (conflict ? ' · <span class="errtxt">vom Server abgelehnt</span>' : "") + '</div></div>' +
        '<span class="pill ' + (arch ? "grey" : "teal") + '">' + esc(q3(MPStore.btmStock(i.id))) + ' ' + esc(i.unit || "") + '</span>' + ic("chev") + '</a>';
    }).join("") : '<div class="empty">' + (arch ? "Keine archivierten Präparate." : isAdmin() ? "Noch kein Präparat angelegt." : "Noch kein Präparat angelegt. Präparate legt die Administration an.") + '</div>') + '</div>';
    return h + NOTE_BTM;
  }
  function btmRowLabel(e) { return e.corrects ? "Storno" : (e.kind === "zugang" ? "Zugang" : "Abgang"); }
  function btmCardHtml(i) {
    var card = MPStore.btmCard(i.id), checks = MPStore.btmChecksOf(i.id), stock = MPStore.btmStock(i.id), admin = isAdmin(), unit = esc(i.unit || "");
    var h = '<div class="ph"><a class="iconbtn" href="#btm" aria-label="Zurück">' + ic("back") + '</a><h1>' + esc(i.name) + '</h1>' +
      '<div class="sub">' + esc([btmSub(i), "Einheit: " + (i.unit || "")].filter(Boolean).join(" · ")) + (i.deleted ? ' · <span class="pill grey">archiviert</span>' : "") + '</div></div>' +
      '<div class="kpis"><div class="kpi"><b>' + esc(q3(stock)) + ' ' + unit + '</b><span>Bestand laut Buch</span></div>' +
      '<div class="kpi"><b>' + (checks.length ? esc(fmtBB(checks[0].check_date)) : "–") + '</b><span>Letzte Monatsprüfung</span></div></div>' +
      '<div class="btnrow top">' +
      (i.deleted ? "" : '<button class="btn primary sm" type="button" data-act="btm-entry-new" data-id="' + esc(i.id) + '" data-kind="zugang">' + ic("plus") + ' Zugang</button>' +
        '<button class="btn primary sm" type="button" data-act="btm-entry-new" data-id="' + esc(i.id) + '" data-kind="abgang">' + ic("out") + ' Abgang</button>' +
        '<button class="btn ghost sm" type="button" data-act="btm-check-new" data-id="' + esc(i.id) + '">' + ic("check") + ' Monatsprüfung</button>') +
      '<button class="btn ghost sm" type="button" data-act="btm-print" data-id="' + esc(i.id) + '">' + ic("print") + ' Drucken</button>' +
      '<button class="btn ghost sm" type="button" data-act="btm-csv" data-id="' + esc(i.id) + '">' + ic("download") + ' CSV</button>' +
      (admin && !i.deleted ? '<button class="btn ghost sm" type="button" data-act="btm-item-edit" data-id="' + esc(i.id) + '">' + ic("edit") + ' Bearbeiten</button>' +
        '<button class="btn ghost sm danger" type="button" data-act="btm-item-archive" data-id="' + esc(i.id) + '">' + ic("trash") + ' Archivieren</button>' : "") + '</div>';
    if (i.note) h += '<p class="note">' + esc(i.note) + '</p>';
    h += '<div class="sh"><h2>Zu- und Abgänge</h2></div>';
    if (!card.length) h += '<div class="empty">Noch keine Einträge.</div>';
    else {
      h += '<div class="tblwrap"><table class="tbl"><thead><tr><th>Datum</th><th class="num">Zugang</th><th class="num">Abgang</th><th class="num">Bestand</th><th>Lieferer / Empfänger</th><th>Arzt</th><th>Beleg-Nr.</th><th>Erfasst</th><th></th></tr></thead><tbody>';
      card.slice().reverse().forEach(function (r) {
        var e = r.e, corr = MPStore.btmCorrectionOf(e.id), q = esc(q3(e.qty));
        h += '<tr' + (e.pending ? ' class="diff"' : "") + '><td>' + esc(fmtBB(e.date)) + (e.corrects ? '<div class="s muted">Storno</div>' : "") + (corr ? '<div class="s muted">storniert</div>' : "") + '</td>' +
          '<td class="num">' + (e.kind === "zugang" ? q : "") + '</td><td class="num">' + (e.kind === "abgang" ? q : "") + '</td><td class="num"><b>' + esc(q3(r.bal)) + '</b></td>' +
          '<td>' + esc(e.party || "") + (e.note ? '<div class="s muted">' + esc(e.note) + '</div>' : "") + '</td><td>' + esc(e.doctor || "") + '</td><td class="mono">' + esc(e.doc_no || "") + '</td>' +
          '<td>' + esc(e.member_name || nameOfMember(e.member_id)) + '<div class="s muted">' + (e.pending ? "noch nicht übertragen" : esc(fmtDate(e.created_at))) + '</div></td>' +
          '<td class="act">' + (!e.corrects && !corr ? '<button class="btn ghost xs" type="button" data-act="btm-storno" data-id="' + esc(e.id) + '">Stornieren</button>' : "") + '</td></tr>';
      });
      h += '</tbody></table></div><p class="help">Einträge werden nicht geändert oder gelöscht. Ein Fehler wird durch eine Storno-Buchung ausgeglichen; der ursprüngliche Eintrag bleibt lesbar.</p>';
    }
    h += '<div class="sh"><h2>Monatsprüfungen</h2></div>';
    h += checks.length ? '<div class="list">' + checks.map(function (c) {
      return '<div class="row' + (c.pending ? " pending" : "") + '"><div class="ic grey">' + ic("check") + '</div><div class="txt"><div class="t">' + esc(monthLabel(c.month)) + ' · Bestand ' + esc(q3(c.balance)) + ' ' + unit + '</div>' +
        '<div class="s">geprüft am ' + esc(fmtBB(c.check_date)) + ' von ' + esc(c.checker || "") + (c.note ? ' · ' + esc(c.note) : "") + (c.pending ? ' · noch nicht übertragen' : "") + '</div></div></div>';
    }).join("") + '</div>' : '<div class="empty">Noch keine Monatsprüfung eingetragen.</div>';
    return h + NOTE_BTM;
  }
  function monthLabel(m) {
    var x = /^(\d{4})-(\d{2})$/.exec(m || ""); if (!x) return m || "";
    return ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][Number(x[2]) - 1] + " " + x[1];
  }
  VIEWS.btm = {
    title: function (arg) { var i = arg && S.btmItems.get(arg); return i ? i.name : "BtM-Buch"; },
    render: function (arg) {
      if (!btmOn()) return '<div class="card warn">Das Modul „BtM-Buch“ ist nicht aktiviert.</div>';
      if (arg) { var i = S.btmItems.get(arg); return i ? btmCardHtml(i) : '<div class="card warn">Dieses Präparat wurde nicht gefunden.</div><p><a class="btn ghost sm" href="#btm">Zur Übersicht</a></p>'; }
      return btmListHtml();
    }
  };
  ACTIONS["btm-arch"] = function (el) { App.f.btm.arch = el.getAttribute("data-v") === "1"; renderView(); };

  // ---- Präparat anlegen / bearbeiten / archivieren (Admin) ----
  function btmItemForm(i) {
    var isNew = !i; i = i || { unit: "Stück" };
    var fixed = !isNew && MPStore.btmCard(i.id).length > 0;
    modal({ title: isNew ? "Präparat anlegen" : "Präparat bearbeiten", body:
      '<form data-form="btm-item" data-id="' + esc(i.id || "") + '">' +
      fld("Bezeichnung des Betäubungsmittels *", "name", i.name, 'maxlength="200" required', "So, wie es im Nachweis stehen soll.") +
      fld("Darreichungsform / Stärke", "form", i.form, 'maxlength="200" placeholder="z. B. Ampullen 10 mg/ml, 1 ml"') +
      '<div class="field"><label>Einheit des Bestands</label><select name="unit"' + (fixed ? " disabled" : "") + '>' +
      BTM_UNITS.map(function (u) { return '<option' + (u === i.unit ? " selected" : "") + '>' + esc(u) + '</option>'; }).join("") + '</select>' +
      '<div class="hint">' + (fixed ? "Nach der ersten Buchung nicht mehr änderbar." : "In dieser Einheit werden Zugänge, Abgänge und Bestand geführt.") + '</div></div>' +
      fld("Aufbewahrungsort", "storage", i.storage, 'maxlength="200" placeholder="z. B. BtM-Schrank Raum 2"') +
      '<div class="field"><label>Bemerkung</label><textarea name="note" rows="2" maxlength="1000">' + esc(i.note || "") + '</textarea></div>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Speichern</button><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button></div></form>' });
  }
  ACTIONS["btm-item-new"] = function () { if (!isAdmin() || btmBlocked()) return; btmItemForm(null); };
  ACTIONS["btm-item-edit"] = function (el) { var i = S.btmItems.get(el.getAttribute("data-id")); if (!i || !isAdmin() || btmBlocked()) return; btmItemForm(i); };
  FORMS["btm-item"] = function (f) {
    var v = formVals(f), id = f.getAttribute("data-id"), old = id ? S.btmItems.get(id) : null;
    if (!v.name) { toast(errMsg("name_required"), "warn"); return; }
    var rec = Object.assign({}, old || { id: MPStore.uuid() }, { name: v.name.slice(0, 200), form: v.form || null, storage: v.storage || null, note: v.note || null });
    if (!old || !MPStore.btmCard(old.id).length) rec.unit = BTM_UNITS.indexOf(v.unit) >= 0 ? v.unit : "Stück";
    MPStore.upsertBtmItem(rec).then(function () {
      MPSync.schedule(300); closeModal(); toast("Präparat gespeichert.", "ok");
      if (!old) nav("btm/" + encodeURIComponent(rec.id)); else renderView();
    });
  };
  ACTIONS["btm-item-archive"] = function (el) {
    var i = S.btmItems.get(el.getAttribute("data-id")); if (!i || !isAdmin() || btmBlocked()) return;
    if (MPStore.btmStock(i.id) !== 0) { toast(errMsg("btm_has_stock"), "warn", 4500); return; }
    confirmDlg("„" + i.name + "“ archivieren? Die Karteikarte bleibt lesbar und druckbar, neue Einträge sind dann nicht mehr möglich.", { title: "Präparat archivieren", ok: "Archivieren", danger: true }).then(function (yes) {
      if (!yes) return;
      MPStore.upsertBtmItem(Object.assign({}, i, { deleted: true })).then(function () { MPSync.schedule(300); toast("Präparat archiviert."); nav("btm"); });
    });
  };

  // ---- Zugang / Abgang ----
  ACTIONS["btm-entry-new"] = function (el) {
    var i = S.btmItems.get(el.getAttribute("data-id")), kind = el.getAttribute("data-kind") === "zugang" ? "zugang" : "abgang";
    if (!i || i.deleted || btmBlocked()) return;
    var zu = kind === "zugang", stock = MPStore.btmStock(i.id);
    modal({ title: zu ? "Zugang eintragen" : "Abgang eintragen", body:
      '<form data-form="btm-entry" data-item="' + esc(i.id) + '" data-kind="' + kind + '">' +
      '<p class="muted" style="margin-top:0">' + esc(i.name) + (btmSub(i) ? ' · ' + esc(btmSub(i)) : "") + ' · Bestand ' + esc(q3(stock)) + ' ' + esc(i.unit || "") + '</p>' +
      '<div class="f2">' + fld("Datum *", "date", todayIso(), 'type="date" required max="' + todayIso() + '"') +
      fld("Menge (" + esc(i.unit || "") + ") *", "qty", "", 'inputmode="decimal" required autocomplete="off" maxlength="15"') + '</div>' +
      fld(zu ? "Lieferer / Herkunft *" : "Empfänger / Verbleib *", "party", "", 'maxlength="400" required',
        zu ? "Name und Anschrift des Lieferers bzw. sonstige Herkunft." : "Name und Anschrift des Empfängers bzw. sonstiger Verbleib (z. B. Patient, Vernichtung).") +
      '<div class="f2">' + fld(zu ? "Arzt (bei Bezug auf Verschreibung)" : "Verschreibender Arzt", "doctor", "", 'maxlength="200"') +
      fld("Beleg-Nr.", "doc_no", "", 'maxlength="80" class="mono"', "BtM-Rezept, Anforderungsschein oder Lieferschein.") + '</div>' +
      '<div class="field"><label>Bemerkung</label><textarea name="note" rows="2" maxlength="1000"></textarea></div>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Eintrag speichern</button><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button></div></form>' });
  };
  function btmEntryRec(itemId, kind, date, qty, more) {
    return Object.assign({ id: MPStore.uuid(), item_id: itemId, kind: kind, date: date, qty: qty, party: null, doctor: null, doc_no: null, note: null, corrects: null,
      created_at: MPStore.nowIso(), member_id: S.member ? S.member.id : null, member_name: S.member ? S.member.name : "" }, more || {});
  }
  FORMS["btm-entry"] = function (f) {
    var v = formVals(f), i = S.btmItems.get(f.getAttribute("data-item")), kind = f.getAttribute("data-kind");
    if (!i || i.deleted) { toast(errMsg("btm_item_archived"), "warn"); return; }
    if (btmBlocked()) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || "")) { toast("Bitte ein Datum angeben.", "warn"); return; }
    if (v.date > todayIso()) { toast(errMsg("bad_date"), "warn"); return; }
    var qty = parseQty(v.qty);
    if (qty == null) { toast(errMsg("btm_bad_qty"), "warn"); return; }
    if (!v.party) { toast(kind === "zugang" ? "Bitte Lieferer bzw. Herkunft angeben." : "Bitte Empfänger bzw. Verbleib angeben.", "warn"); return; }
    if (kind === "abgang" && MPStore.round3(MPStore.btmStock(i.id) - qty) < 0) { toast(errMsg("btm_negative"), "warn", 4500); return; }
    MPStore.addBtmPending("entry", btmEntryRec(i.id, kind, v.date, qty, { party: v.party, doctor: v.doctor || null, doc_no: v.doc_no || null, note: v.note || null })).then(function () {
      MPSync.schedule(300); closeModal(); toast((kind === "zugang" ? "Zugang" : "Abgang") + " gespeichert.", "ok"); renderView();
    });
  };
  ACTIONS["btm-storno"] = function (el) {
    var e = MPStore.getBtmEntry(el.getAttribute("data-id")); if (!e || e.corrects || MPStore.btmCorrectionOf(e.id) || btmBlocked()) return;
    var i = S.btmItems.get(e.item_id), back = e.kind === "zugang" ? "abgang" : "zugang";
    if (back === "abgang" && MPStore.round3(MPStore.btmStock(e.item_id) - Number(e.qty)) < 0) { toast("Stornieren nicht möglich: Der Bestand würde negativ. " + errMsg("btm_negative"), "warn", 5000); return; }
    confirmDlg((e.kind === "zugang" ? "Zugang" : "Abgang") + " vom " + fmtBB(e.date) + " über " + q3(e.qty) + " " + (i ? i.unit : "") + " stornieren? Es wird eine Gegenbuchung eingetragen; der ursprüngliche Eintrag bleibt lesbar.",
      { title: "Eintrag stornieren", ok: "Stornieren", danger: true }).then(function (yes) {
      if (!yes) return;
      MPStore.addBtmPending("entry", btmEntryRec(e.item_id, back, todayIso(), Number(e.qty), { party: "Storno des Eintrags vom " + fmtBB(e.date), corrects: e.id })).then(function () {
        MPSync.schedule(300); toast("Storno eingetragen.", "ok"); renderView();
      });
    });
  };

  // ---- Monatsprüfung ----
  ACTIONS["btm-check-new"] = function (el) {
    var i = S.btmItems.get(el.getAttribute("data-id")); if (!i || i.deleted || btmBlocked()) return;
    var t = todayIso();
    modal({ title: "Monatsprüfung eintragen", body:
      '<form data-form="btm-check" data-item="' + esc(i.id) + '">' +
      '<p class="muted" style="margin-top:0">' + esc(i.name) + ' · Bestand laut Buch ' + esc(q3(MPStore.btmStock(i.id))) + ' ' + esc(i.unit || "") + '</p>' +
      '<div class="f2">' + fld("Geprüfter Monat *", "month", t.slice(0, 7), 'type="month" required max="' + t.slice(0, 7) + '"') +
      fld("Prüfdatum *", "check_date", t, 'type="date" required max="' + t + '"') + '</div>' +
      fld("Geprüft von *", "checker", S.member ? S.member.name : "", 'maxlength="200" required', "Name der verantwortlichen Person, die Eintragungen und Bestand geprüft hat.") +
      fld("Festgestellter Bestand (" + esc(i.unit || "") + ") *", "balance", q3(MPStore.btmStock(i.id)), 'inputmode="decimal" required autocomplete="off" maxlength="15"') +
      '<div class="field"><label>Bemerkung</label><textarea name="note" rows="2" maxlength="1000"></textarea></div>' +
      '<p class="help">Hier halten Sie fest, dass geprüft wurde. Namenszeichen und Prüfdatum auf dem Ausdruck bringt die prüfende Person selbst an.</p>' +
      '<div class="btnrow"><button class="btn primary" type="submit">Prüfung speichern</button><button class="btn ghost" type="button" data-act="modal-close">Abbrechen</button></div></form>' });
  };
  FORMS["btm-check"] = function (f) {
    var v = formVals(f), i = S.btmItems.get(f.getAttribute("data-item")); if (!i || btmBlocked()) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v.month || "") || v.month > todayIso().slice(0, 7)) { toast("Bitte einen gültigen Monat angeben (JJJJ-MM, nicht in der Zukunft).", "warn"); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.check_date || "") || v.check_date > todayIso()) { toast(errMsg("bad_date"), "warn"); return; }
    if (!v.checker) { toast("Bitte angeben, wer geprüft hat.", "warn"); return; }
    var bs = String(v.balance || "").replace(",", ".");
    if (!/^\d{1,10}(\.\d{1,3})?$/.test(bs)) { toast("Bitte den festgestellten Bestand angeben (höchstens drei Nachkommastellen).", "warn"); return; }
    var bal = Number(bs), stock = MPStore.btmStock(i.id);
    var go = bal === stock ? Promise.resolve(true) : confirmDlg("Der festgestellte Bestand (" + q3(bal) + " " + i.unit + ") weicht vom Bestand laut Buch (" + q3(stock) + " " + i.unit + ") ab. Die Prüfung trotzdem so speichern?", { title: "Abweichung", ok: "Speichern" });
    // confirmDlg ersetzt das Formular-Modal – die Werte sind bereits ausgelesen
    go.then(function (yes) {
      if (!yes) return;
      return MPStore.addBtmPending("check", { id: MPStore.uuid(), item_id: i.id, month: v.month, checker: v.checker.slice(0, 200), check_date: v.check_date, balance: bal, note: v.note || null,
        created_at: MPStore.nowIso(), member_id: S.member ? S.member.id : null, member_name: S.member ? S.member.name : "" }).then(function () {
        MPSync.schedule(300); closeModal(); toast("Monatsprüfung gespeichert.", "ok"); renderView();
      });
    });
  };

  // ---- Ausdruck und CSV je Präparat ----
  ACTIONS["btm-print"] = function (el) {
    var i = S.btmItems.get(el.getAttribute("data-id")); if (!i) return;
    var card = MPStore.btmCard(i.id), checks = MPStore.btmChecksOf(i.id).slice().reverse();
    var h = '<div class="pr-doc"><h1>Betäubungsmittel-Nachweis</h1><p class="pr-sub">' + esc(S.tenant ? S.tenant.name : "") + (settings().site ? ' · ' + esc(settings().site) : "") + ' · Ausdruck vom ' + esc(fmtBB(todayIso())) + '</p>' +
      '<table class="pr-kv">' + [["Bezeichnung des Betäubungsmittels", i.name], ["Darreichungsform / Stärke", i.form], ["Einheit", i.unit], ["Aufbewahrungsort", i.storage], ["Status", i.deleted ? "archiviert" : ""]]
        .filter(function (r) { return r[1]; }).map(function (r) { return '<tr><th>' + r[0] + '</th><td>' + esc(r[1]) + '</td></tr>'; }).join("") + '</table>' +
      '<table class="pr-tbl"><thead><tr><th>Lfd. Nr.</th><th>Datum</th><th>Zugang</th><th>Abgang</th><th>Bestand</th><th>Lieferer bzw. Empfänger / Herkunft bzw. Verbleib</th><th>Arzt</th><th>Beleg-Nr.</th><th>Erfasst</th></tr></thead><tbody>';
    card.forEach(function (r, n) {
      var e = r.e, corr = MPStore.btmCorrectionOf(e.id);
      h += '<tr><td>' + (n + 1) + '</td><td>' + esc(fmtBB(e.date)) + '</td><td>' + (e.kind === "zugang" ? esc(q3(e.qty)) : "") + '</td><td>' + (e.kind === "abgang" ? esc(q3(e.qty)) : "") + '</td><td>' + esc(q3(r.bal)) + '</td><td>' +
        esc([e.party, e.note].filter(Boolean).join(" · ")) + (corr ? "<br>(storniert)" : "") + '</td><td>' + esc(e.doctor || "") + '</td><td>' + esc(e.doc_no || "") + '</td><td>' +
        esc(e.member_name || nameOfMember(e.member_id)) + (e.created_at ? "<br>" + esc(fmtDate(e.created_at)) : "") + (e.pending ? "<br>(nicht übertragen)" : "") + '</td></tr>';
    });
    if (!card.length) h += '<tr><td colspan="9">Keine Einträge.</td></tr>';
    h += '</tbody></table><p class="pr-sub" style="margin-top:6mm"><b>Monatsprüfungen</b></p>' +
      '<table class="pr-tbl"><thead><tr><th>Monat</th><th>Prüfdatum</th><th>Festgestellter Bestand</th><th>Geprüft von</th><th>Bemerkung</th><th style="width:38mm">Namenszeichen</th></tr></thead><tbody>';
    checks.forEach(function (c) {
      h += '<tr><td>' + esc(monthLabel(c.month)) + '</td><td>' + esc(fmtBB(c.check_date)) + '</td><td>' + esc(q3(c.balance)) + ' ' + esc(i.unit || "") + '</td><td>' + esc(c.checker || "") + '</td><td>' + esc(c.note || "") + (c.pending ? " (nicht übertragen)" : "") + '</td><td>&nbsp;</td></tr>';
    });
    h += '<tr><td>&nbsp;<br>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr></tbody></table></div>';
    printHtml(h);
  };
  ACTIONS["btm-csv"] = function (el) {
    var i = S.btmItems.get(el.getAttribute("data-id")); if (!i) return;
    var rows = [["Lfd. Nr.", "Datum", "Art", "Zugang", "Abgang", "Bestand", "Einheit", "Lieferer / Empfänger", "Arzt", "Beleg-Nr.", "Bemerkung", "Storniert", "Erfasst von", "Erfasst am"]];
    MPStore.btmCard(i.id).forEach(function (r, n) {
      var e = r.e;
      rows.push([n + 1, fmtBB(e.date), btmRowLabel(e), e.kind === "zugang" ? q3(e.qty) : "", e.kind === "abgang" ? q3(e.qty) : "", q3(r.bal), i.unit || "", e.party || "", e.doctor || "", e.doc_no || "", e.note || "",
        MPStore.btmCorrectionOf(e.id) ? "ja" : "", e.member_name || nameOfMember(e.member_id), e.pending ? "nicht übertragen" : fmtDate(e.created_at)]);
    });
    download("btm-" + String(i.name).replace(/[^\w-]+/g, "_").slice(0, 40) + "-" + fileDate() + ".csv", csvText(rows));
  };

  window.MPApp = { toast: toast, nav: nav, App: App, version: APP_VERSION };
  boot();
})();
