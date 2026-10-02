-- Vaydena Medizinproduktebuch – Schema `mpbuch`
--
-- Dokumentationssoftware für Betreiber nach MPBetreibV (Bestandsverzeichnis § 14,
-- Medizinproduktebuch § 13). Kein Medizinprodukt: es werden keine Messwerte
-- ausgewertet, keine Geräte gesteuert und keine Patientendaten gespeichert.
--
-- Zugriff ausschließlich über Edge Functions (mpb-api, mpb-public, mpb-admin),
-- die sich direkt mit der Datenbank verbinden. RLS ist auf allen Tabellen aktiv
-- und hat keine Policies; das Schema wird nicht über PostgREST exponiert.

create schema if not exists mpbuch;

-- ───────────────────────── Verwaltung ─────────────────────────

create table if not exists mpbuch.tenants (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  plan            text not null default 'trial'
                  check (plan in ('trial','starter','team','business')),
  status          text not null default 'aktiv' check (status in ('aktiv','gesperrt')),
  trial_ends_at   date not null default (current_date + 14),
  paid_until      date,
  contact_email   text,
  billing         jsonb not null default '{}',   -- {recipient, street, zip, city, email}
  inv_prefix      text not null default 'MP',    -- Präfix der betrieblichen Identifikationsnummer
  next_inv_no     integer not null default 1,
  settings        jsonb not null default '{}',
  due_mailed_on   date,                          -- Fristen-Mail: höchstens eine pro Tag
  notiz           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists mpbuch.members (
  id            uuid primary key,                -- = auth.users.id
  tenant_id     uuid not null references mpbuch.tenants(id) on delete cascade,
  role          text not null default 'mitarbeiter' check (role in ('admin','mitarbeiter')),
  name          text,
  email         text,
  active        boolean not null default true,
  -- auth.users ist zwischen den Vaydena-Produkten geteilt: nur Konten, die diese
  -- App selbst angelegt hat, dürfen beim Entfernen auch aus auth.users gelöscht werden.
  auth_created  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists members_tenant_idx on mpbuch.members (tenant_id);

-- ───────────────────────── Fachdaten ─────────────────────────
-- Die ids kommen vom Client (offline erzeugt). Stammdaten: last-write-wins über
-- updated_at; synced_at ist der Server-Zeitpunkt für den inkrementellen Abruf.

create table if not exists mpbuch.locations (
  id          uuid primary key,
  tenant_id   uuid not null references mpbuch.tenants(id) on delete cascade,
  name        text not null,
  note        text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now()
);
create index if not exists locations_sync_idx on mpbuch.locations (tenant_id, synced_at);

-- Bestandsverzeichnis (§ 14 MPBetreibV)
create table if not exists mpbuch.devices (
  id                   uuid primary key,
  tenant_id            uuid not null references mpbuch.tenants(id) on delete cascade,
  inv_no               text not null,            -- betriebliche Identifikationsnummer
  name                 text not null,            -- Bezeichnung
  kind                 text,                     -- Art
  model                text,                     -- Typ
  serial               text,                     -- Seriennummer / Loscode
  year                 integer check (year between 1950 and 2100),  -- Anschaffungsjahr
  manufacturer         text,                     -- Hersteller / Bevollmächtigter / Importeur
  manufacturer_address text,
  location_id          uuid references mpbuch.locations(id) on delete set null,
  assignment           text,                     -- betriebliche Zuordnung
  anlage1              boolean not null default false,
  anlage2              boolean not null default false,
  stk_interval_months  integer check (stk_interval_months between 1 and 120),
  mtk_interval_years   integer check (mtk_interval_years between 1 and 20),
  commissioned         date,                     -- Inbetriebnahme
  decommissioned_at    date,                     -- Außerbetriebnahme
  note                 text,
  deleted              boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  synced_at            timestamptz not null default now()
);
create unique index if not exists devices_inv_no_uq
  on mpbuch.devices (tenant_id, lower(inv_no)) where deleted = false;
create index if not exists devices_sync_idx on mpbuch.devices (tenant_id, synced_at);
create index if not exists devices_location_idx on mpbuch.devices (location_id);

-- Personen für Einweisungen (keine Patientendaten)
create table if not exists mpbuch.persons (
  id          uuid primary key,
  tenant_id   uuid not null references mpbuch.tenants(id) on delete cascade,
  name        text not null,
  note        text,
  active      boolean not null default true,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now()
);
create index if not exists persons_sync_idx on mpbuch.persons (tenant_id, synced_at);

-- Medizinproduktebuch (§ 13 MPBetreibV): nur anfügen, nie ändern oder löschen.
-- Ein Fehler wird durch einen neuen Eintrag mit `corrects` berichtigt.
create table if not exists mpbuch.entries (
  id           uuid primary key,
  tenant_id    uuid not null references mpbuch.tenants(id) on delete cascade,
  device_id    uuid not null references mpbuch.devices(id) on delete cascade,
  type         text not null check (type in
               ('funktionspruefung','einweisung','stk','mtk','it',
                'instandhaltung','stoerung','vorkommnis')),
  date         date not null,                    -- Datum der Maßnahme / des Ereignisses
  result       text,                             -- Ergebnis, wie vom Prüfer festgestellt
  performer    text,                             -- durchführende Person oder Firma
  instructor   text,                             -- einweisende / beauftragte Person
  persons      jsonb not null default '[]',      -- [{id, name}] eingewiesene Personen
  next_due     date,                             -- vom Prüfer festgelegte nächste Frist
  note         text,
  corrects     uuid references mpbuch.entries(id),
  member_id    uuid,
  member_name  text,
  client_id    text,                             -- Gerät/Browser, das den Eintrag erzeugt hat
  created_at   timestamptz not null,             -- Zeitpunkt am Client
  received_at  timestamptz not null default now()
);
create index if not exists entries_sync_idx on mpbuch.entries (tenant_id, received_at);
create index if not exists entries_device_idx on mpbuch.entries (tenant_id, device_id, date desc);
create unique index if not exists entries_corrects_uq
  on mpbuch.entries (corrects) where corrects is not null;

-- ───────────────────────── Abrechnung ─────────────────────────

create sequence if not exists mpbuch.invoice_number_seq;

create table if not exists mpbuch.invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references mpbuch.tenants(id) on delete cascade,
  number        text not null unique,
  access_token  text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  plan          text not null,
  period        text not null default 'monat' check (period in ('monat','jahr')),
  amount_cents  integer not null,
  status        text not null default 'open' check (status in ('open','paid','void')),
  reference     text,
  billing       jsonb not null default '{}',
  issued_at     date not null default current_date,
  due_date      date not null default (current_date + 14),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists invoices_tenant_idx on mpbuch.invoices (tenant_id);

-- ───────────────────────── Betrieb ─────────────────────────

create table if not exists mpbuch.auth_tokens (
  token_hash  text primary key,
  user_id     uuid not null,
  email       text not null,
  purpose     text not null check (purpose in ('reset','invite')),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);

create table if not exists mpbuch.leads (
  id          uuid primary key default gen_random_uuid(),
  firma       text,
  name        text,
  email       text,
  nachricht   text,
  created_at  timestamptz not null default now()
);

create table if not exists mpbuch.admin_auth (
  id             integer primary key,
  secret_sha256  text not null
);

create table if not exists mpbuch.audit (
  id          bigserial primary key,
  tenant_id   uuid not null references mpbuch.tenants(id) on delete cascade,
  member_id   uuid,
  actor       text,
  action      text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists audit_tenant_idx on mpbuch.audit (tenant_id, id desc);

create table if not exists mpbuch.rate_events (
  id          bigserial primary key,
  kind        text not null,
  key         text not null,
  created_at  timestamptz not null default now()
);
create index if not exists rate_events_idx on mpbuch.rate_events (kind, key, created_at);

-- ───────────────────────── Rechte ─────────────────────────

alter table mpbuch.tenants      enable row level security;
alter table mpbuch.members      enable row level security;
alter table mpbuch.locations    enable row level security;
alter table mpbuch.devices      enable row level security;
alter table mpbuch.persons      enable row level security;
alter table mpbuch.entries      enable row level security;
alter table mpbuch.invoices     enable row level security;
alter table mpbuch.auth_tokens  enable row level security;
alter table mpbuch.leads        enable row level security;
alter table mpbuch.admin_auth   enable row level security;
alter table mpbuch.audit        enable row level security;
alter table mpbuch.rate_events  enable row level security;

-- BYPASSRLS ersetzt kein GRANT: ohne diese Rechte sieht auch service_role nichts.
grant usage on schema mpbuch to service_role;
grant all on all tables in schema mpbuch to service_role;
grant all on all sequences in schema mpbuch to service_role;
revoke all on schema mpbuch from anon, authenticated;
