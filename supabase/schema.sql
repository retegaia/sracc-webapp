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
