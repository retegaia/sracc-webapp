-- SRACC Barigadu Guilcer — schema iniziale (§2.1 specifica tecnica v2)
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase.

create extension if not exists "pgcrypto";

create table territories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text,
  created_at timestamptz default now(),
  config jsonb
);

create table users (
  id uuid primary key,
  territory_id uuid references territories,
  name text not null,
  discipline text,
  role text check (role in ('coordinator','contributor','observer')),
  magic_token text unique
);

create table raci (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories,
  user_id uuid references users,
  sistema text not null,
  pericolo text not null,
  field text not null,
  role text check (role in ('R','A','C','I')),
  unique (territory_id, user_id, sistema, pericolo, field)
);

create table factors (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories, -- NULL = libreria condivisa
  nome_std text not null,
  componente text check (componente in ('Esposizione','Sensibilita','Capacita adattiva')),
  strato text check (strato in ('IN','VR','ST')), -- IN=Invariante nazionale, VR=Variabile regionale, ST=Specificita territoriale
  sistema text not null,
  pericolo text not null,
  field text not null,
  fonte_std text,
  peso_suggerito text check (peso_suggerito in ('Determinante','Rilevante','Marginale') or peso_suggerito is null)
);

create table contributions (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories,
  user_id uuid references users,
  sistema text not null,
  pericolo text not null,
  field text not null,
  factors jsonb not null, -- array di {factor_id, nome, componente, peso, free}
  vulnerability jsonb, -- {sen: Alta|Media|Bassa, cap: ..., rischio: ...}
  note text,
  status text default 'draft', -- draft | submitted | validated
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (territory_id, user_id, sistema, pericolo, field)
);

create table locks (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories,
  user_id uuid references users,
  sistema text not null,
  pericolo text not null,
  field text not null,
  locked_at timestamptz default now(),
  unique (territory_id, sistema, pericolo, field)
);

-- Nota: le RLS policies (lettura libera per territorio, scrittura solo su
-- field assegnati nel RACI con ruolo R/A, bypass per il coordinatore) si
-- configurano in Supabase → Authentication → Policies, non qui (§2.1).

-- Aggiunta per il modulo di export delle catene d'impatto (2026-07-10).
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase, come lo
-- schema iniziale sopra. Libreria di sola lettura, stesso pattern di
-- `factors`: territory_id NULL = libreria condivisa (qui l'intero
-- contenuto, importato da docs/Impatti_Attesi_estratti.xlsx via
-- scripts/seed-impatti.js, è condiviso — nessun territorio scrive righe
-- proprie oggi, ma il campo resta per coerenza con `factors` e per
-- un'eventuale libreria territoriale futura).
create table impatti_attesi (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories, -- NULL = libreria condivisa
  sistema text not null,
  pericolo text not null,
  field text not null,
  impatto text not null,
  ordine integer
);

-- Aggiunta per S10 (§10 specifica tecnica v4, Tab.6/8): pesatura indicatori.
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase, come le
-- altre aggiunte sopra. Due tabelle separate da `factors`/`contributions`:
-- `indicatori` è la libreria di sola lettura (stesso pattern di `factors` e
-- `impatti_attesi`: territory_id NULL = libreria condivisa, qui l'intero
-- contenuto importato da
-- docs/PAC_BarigaduGuilcer_Step_5_Lista_Indicatori_Unificata_v2.xlsx via
-- scripts/seed-indicatori.js), `indicatori_scelti` è l'equivalente di
-- `contributions` per la Fase 2: una riga per referente×field con gli
-- indicatori selezionati e la loro pesatura. A differenza di `factors`,
-- l'unique key di `indicatori` non include territory_id — oggi la libreria è
-- interamente condivisa e non esiste ancora un caso di indicatori
-- territoriali propri.
create table indicatori (
  id                 uuid primary key default gen_random_uuid(),
  territory_id       uuid references territories,  -- NULL = libreria condivisa
  nome               text not null,
  componente         text check (componente in ('Pericolo','Esposizione','Sensibilita','Capacita adattiva')),
  categoria          text,
  tipologia          text check (tipologia in ('quantitativo','qualitativo') or tipologia is null),
  sistema            text not null,
  pericolo           text not null,
  field              text not null,
  descrizione        text,
  unita_misura       text,
  fonte_dato         text,
  link_fonte         text,
  anno               integer,
  clima_osservato    text,
  clima_futuro_rcp45 text,
  referenza          text,
  base_layer_gis     text,
  unique (nome, sistema, pericolo, field, componente)
);

create table indicatori_scelti (
  id            uuid primary key default gen_random_uuid(),
  territory_id  uuid references territories,
  user_id       uuid references users,
  sistema       text not null,
  pericolo      text not null,
  field         text not null,
  indicatori    jsonb not null,  -- array di {indicatore_id, nome, componente, peso}
  status        text default 'draft',  -- draft | submitted
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (territory_id, user_id, sistema, pericolo, field)
);

-- Multi-territorio reale (2026-07-11): fino ad oggi users.territory_id era
-- una colonna scalare, quindi un utente poteva operare su un solo
-- territorio. Con l'avvio di un secondo territorio (stesso team del primo,
-- alcune persone coordinator su un territorio e non sull'altro) serve una
-- tabella ponte user_id×territory_id×role, che diventa la fonte di verità
-- per l'autorizzazione al posto di users.territory_id/users.role.
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase, come le
-- altre aggiunte sopra. users.territory_id/users.role NON vengono toccate
-- o rimosse: restano per compatibilità (bootstrap del primo invito di un
-- utente, v. magic-link.js) ma non sono più lette per decidere permessi.
create table user_territories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users not null,
  territory_id uuid references territories not null,
  role text check (role in ('coordinator','contributor','observer')) not null,
  unique (user_id, territory_id)
);

-- Backfill non distruttivo: una riga user_territories per ogni utente
-- esistente che ha già territory_id/role compilati su users. Idempotente
-- (on conflict do nothing) — sicuro da rieseguire.
insert into user_territories (user_id, territory_id, role)
select id, territory_id, role from users
where territory_id is not null and role in ('coordinator','contributor','observer')
on conflict (user_id, territory_id) do nothing;
