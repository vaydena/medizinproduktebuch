# Vaydena Medizinproduktebuch – Medizinproduktebuch und Bestandsverzeichnis

Live: https://medizinproduktebuch.vaydena.de (seit 2026-10-02)

Statische Web-App ohne Build-Schritt (HTML + CSS + Vanilla JS) mit Supabase-Backend.
Einrichtungen fuehren ihr Bestandsverzeichnis (MPBetreibV § 14) und je Geraet das Medizinproduktebuch (§ 13):
Funktionspruefung, Einweisungen, STK/MTK mit Fristen, Instandhaltung, Stoerungen. Geraete werden ueber ein
QR-Etikett (app.html#g=<Inventarnummer>) aufgerufen; Eintraege gehen auch ohne Internet (Abgleich, sobald Netz da ist).
Abrechnung als Abo je Einrichtung, Zahlung ausschliesslich per Bankueberweisung + GiroCode.

Reine Dokumentationssoftware, kein Medizinprodukt: keine Messwert-Auswertung, keine Geraetesteuerung,
keine Patientendaten (einzige Ausnahme: optionales Modul BtM-Buch, `tenant.settings.btm`, Empfaenger koennen Patienten sein -> AVV vor Nutzung). Die Betreiberpflichten bleiben beim Kunden. Werbetexte nur fuer vorhandene Funktionen.

## Struktur

- index.html – Landingpage; registrieren.html / anmelden.html – Zugang
- app.html – die eigentliche App (PWA, offline-faehig; sw.js + manifest.webmanifest)
- zahlung.html – Zahlseite je Rechnung (Ueberweisung + GiroCode); betreiber.html – Betreiber-Backend
- assets/app.css (Design-Tokens), assets/mpb.css (App-Shell + Druck)
- assets/auth.js (window.MP: Supabase-Client, apiCall), assets/mpb-store.js (IndexedDB, window.MPStore),
  assets/mpb-sync.js (Push/Pull, window.MPSync), assets/mpb-scan.js (Kamera + Handscanner),
  assets/mpb-app.js (alle Ansichten und Aktionen)
- supabase/ – Migrationen (Schema mpbuch) und Edge Functions mpb-api, mpb-public, mpb-admin
- test/ui-mock.js – UI-Test in Headless-Chrome mit Backend-Attrappe (kein echtes Backend noetig): node test/ui-mock.js
- tools/make-icons.js – erzeugt die Icons unter assets/icons/

## Deploy

Push auf main -> GitHub Actions (.github/workflows/deploy.yml) -> curl-FTPS nach Hostinger, Ordner /medizinproduktebuch/.
Benoetigt das Repository-Secret FTP_PASSWORD (reines Passwort des Deploy-FTP-Kontos; Tab "Secrets", nicht "Variables").
Ohne Secret bleibt der Lauf gruen und ueberspringt den Upload.

Sofort-Weg ohne GitHub: deploy-local.ps1 in PowerShell starten. Das Skript fragt das Passwort ab und speichert nichts.

Vor jedem Deploy mit geaenderten App-Dateien: VERSION in sw.js erhoehen und den Marker in deploy-version.txt anpassen.
Sonst behalten bereits installierte Apps die alte Shell im Cache.

## Backend

Supabase-Projekt xeuexovdipdiiuzjpzkj (Frankfurt). Datenbankzugriff nur ueber die Edge Functions (RLS: alles verweigert).
Der Betreiber-Schluessel (x-admin-key fuer mpb-admin) liegt nicht im Repo.
Stand 2026-10-02: Migrationen und Functions liegen nur lokal vor, nichts davon ist angewendet oder deployt.
