-- Vaydena Medizinproduktebuch – Modul „BtM-Buch" (Betäubungsmittel-Nachweis)
--
-- Zuschaltbar je Mandant (tenants.settings.btm). Reine Dokumentation von Zugängen,
-- Abgängen und Beständen; die Angaben und ihre Prüfung liegen bei der Einrichtung.
-- Abgänge können Empfänger (auch Patienten) nennen – das Modul ist deshalb der
-- einzige Bereich der Software, in dem personenbezogene Gesundheitsdaten stehen können.

-- Präparate (je Betäubungsmittel eine Karteikarte). Stammdaten wie Standorte:
-- id vom Client, last-write-wins über updated_at, synced_at für den Abruf.
create table if not exists mpbuch.btm_items (
  id          uuid primary key,
  tenant_id   uuid not null references mpbuch.tenants(id) on delete cascade,
  name        text not null,                    -- Bezeichnung des Betäubungsmittels
  form        text,                             -- Darreichungsform / Stärke
  unit        text not null default 'Stück',    -- Einheit des Bestands
  storage     text,                             -- Aufbewahrungsort
  note        text,
  deleted     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  synced_at   timestamptz not null default now()
);
create index if not exists btm_items_sync_idx on mpbuch.btm_items (tenant_id, synced_at);

-- Zu- und Abgänge: nur anfügen. Der Bestand wird nicht gespeichert, sondern in der
-- Reihenfolge der Eintragung (seq) fortlaufend errechnet. Ein Fehler wird durch eine
-- Gegenbuchung mit `corrects` storniert; das Original bleibt lesbar.
create table if not exists mpbuch.btm_entries (
  id           uuid primary key,
  seq          bigint generated always as identity,
  tenant_id    uuid not null references mpbuch.tenants(id) on delete cascade,
  item_id      uuid not null references mpbuch.btm_items(id) on delete cascade,
  date         date not null,                   -- Datum des Zu- bzw. Abgangs
  kind         text not null check (kind in ('zugang','abgang')),
  qty          numeric(14,3) not null check (qty > 0),
  party        text,                            -- Lieferer bzw. Empfänger / Herkunft, Verbleib
  doctor       text,                            -- verschreibender / anfordernder Arzt
  doc_no       text,                            -- Nr. BtM-Rezept, Anforderungsschein, Lieferschein
  note         text,
  corrects     uuid references mpbuch.btm_entries(id),
  member_id    uuid,
  member_name  text,
  client_id    text,
  created_at   timestamptz not null,
  received_at  timestamptz not null default now()
);
create index if not exists btm_entries_sync_idx on mpbuch.btm_entries (tenant_id, received_at);
create index if not exists btm_entries_item_idx on mpbuch.btm_entries (tenant_id, item_id, seq);
create unique index if not exists btm_entries_corrects_uq
  on mpbuch.btm_entries (corrects) where corrects is not null;

-- Monatliche Prüfung des Bestands (nur anfügen)
create table if not exists mpbuch.btm_checks (
  id           uuid primary key,
  tenant_id    uuid not null references mpbuch.tenants(id) on delete cascade,
  item_id      uuid not null references mpbuch.btm_items(id) on delete cascade,
  month        text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  checker      text not null,                   -- prüfende Person (Name)
  check_date   date not null,
  balance      numeric(14,3) not null,          -- festgestellter Bestand
  note         text,
  member_id    uuid,
  member_name  text,
  created_at   timestamptz not null,
  received_at  timestamptz not null default now()
);
create index if not exists btm_checks_sync_idx on mpbuch.btm_checks (tenant_id, received_at);

alter table mpbuch.btm_items   enable row level security;
alter table mpbuch.btm_entries enable row level security;
alter table mpbuch.btm_checks  enable row level security;

grant all on mpbuch.btm_items, mpbuch.btm_entries, mpbuch.btm_checks to service_role;
grant all on all sequences in schema mpbuch to service_role;
