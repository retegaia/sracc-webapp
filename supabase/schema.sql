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

-- Modulo commenti (2026-07-15): spazio di discussione append-only su
-- indicatori e fattori, aperto a coordinator/contributor senza filtro RACI
-- (chi non ha ruolo R su una combinazione partecipa comunque via commenti,
-- invece di un secondo referente scrivente — v. regola C1, S8) e chiuso a
-- observer (unica eccezione alla regola generale "l'osservatore vede tutto
-- il territorio", applicata lato Function, non qui — v.
-- netlify/functions/indicatori-commenti.js e fattori-commenti.js). Nessun
-- UPDATE/DELETE previsto: come una discussione, i commenti restano.
--
-- indicatori_commenti: un indicatore di libreria ha un id stabile
-- (indicatori.id), quindi il commento si aggancia direttamente a quello.
-- territory_id non è ridondante nonostante indicatore_id sia già univoco:
-- un indicatore di libreria condivisa (indicatori.territory_id NULL) è
-- usato da più territori contemporaneamente, e i commenti sono una
-- discussione interna al team di UN territorio, non un forum
-- cross-territorio — stesso principio di isolamento già applicato a
-- contributions/indicatori_scelti (che infatti restano territory-scoped
-- pur potendo referenziare indicatori/fattori di libreria condivisa).
-- Ogni GET/POST filtra per territory_id = territorio attivo del
-- chiamante (v. netlify/functions/indicatori-commenti.js), quindi lo
-- stesso indicatore condiviso può avere thread di commenti diversi e
-- isolati in territori diversi.
create table indicatori_commenti (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories not null,
  indicatore_id uuid references indicatori not null,
  user_id uuid references users not null,
  testo text not null,
  created_at timestamptz default now()
);

-- fattori_commenti: a differenza degli indicatori, un fattore citato in una
-- contribution può essere di libreria (factor_id stabile in factors) o
-- "free" (free: true dentro contributions.factors, nessun id proprio —
-- inserito a testo libero dal referente, v. FactorChips.jsx). Un id
-- condiviso tra utenti diversi non esiste per i fattori free, quindi il
-- commento si aggancia alla combinazione territorio+sistema+pericolo+
-- field+nome (stessa granularità con cui GET /api/fattori-in-contesto
-- espone i fattori usati in una combinazione) invece che a un factor_id —
-- funziona identicamente per i fattori di libreria, il cui nome_std è
-- comunque stabile all'interno di una stessa combinazione.
create table fattori_commenti (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid references territories not null,
  sistema text not null,
  pericolo text not null,
  field text not null,
  fattore_nome text not null,
  user_id uuid references users not null,
  testo text not null,
  created_at timestamptz default now()
);

-- Audit sicurezza 2026-07-16 (F3): lookup a tempo costante per l'endpoint
-- pubblico POST /api/request-magic-link. Prima quell'endpoint (non
-- autenticato) scandiva l'INTERA tabella auth.users a pagine di 200 per ogni
-- richiesta (findAuthUserByEmail in _lib/authUsers.js): il tempo di risposta
-- variava con la profondità di paginazione → oracolo temporale per dedurre
-- se un'email è registrata, oltre a una scansione O(tutti-gli-utenti) come
-- vettore di amplificazione. Questa funzione risolve in un solo indice, a
-- tempo costante, restituendo solo un booleano (esiste un auth.users con
-- quell'email E una riga applicativa in public.users, cioè creato dal
-- coordinatore via /admin, non un residuo). security definer perché auth.users
-- non è leggibile da anon/authenticated; execute revocato a tutti tranne
-- service_role (le Function usano la service-role key). request-magic-link.js
-- ha comunque un fallback alla vecchia paginazione se questa funzione non
-- esiste ancora, così l'ordine deploy-vs-migrazione non rompe il login.
create or replace function public.can_request_magic_link(p_email text)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users au
    join public.users u on u.id = au.id
    where lower(au.email) = lower(p_email)
  );
$$;

revoke all on function public.can_request_magic_link(text) from public;
revoke all on function public.can_request_magic_link(text) from anon;
revoke all on function public.can_request_magic_link(text) from authenticated;

-- combinazioni_attive (2026-07-16): quali sistema×pericolo×field sono
-- attivi/significativi per un territorio. factors/impatti_attesi restano
-- libreria condivisa globale (territory_id NULL), invariata — questa
-- tabella è un filtro esplicito e additivo sopra quella libreria, non un
-- ri-tag delle sue righe esistenti (v. verifica di sola lettura del
-- 2026-07-16: oggi le 39 combinazioni di Barigadu Guilcer sono visibili
-- identiche anche al territorio Comune di Sinnai perché mancava questo
-- concetto). territory_id è NOT NULL per design: a differenza di
-- factors/impatti_attesi, qui non esiste un caso "condivisa tra
-- territori" — ogni territorio attiva esplicitamente le proprie
-- combinazioni. Sorgente per GET /api/combinazioni-attive, usato da
-- useActiveTaxonomy() (StepSelector.jsx, RaciEditor.jsx) — non da
-- useFactorTaxonomy()/GET /api/factors, che resta la tassonomia COMPLETA
-- non filtrata usata da HeatMap.jsx e ResetScheda.jsx per restare
-- raggiungibili anche su combinazioni/dati storici non più attivi.
create table combinazioni_attive (
  id           uuid primary key default gen_random_uuid(),
  territory_id uuid references territories not null,
  sistema      text not null,
  pericolo     text not null,
  field        text not null,
  unique (territory_id, sistema, pericolo, field)
);
