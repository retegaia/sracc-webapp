-- SRACC Barigadu Guilcer — Row-Level Security (§2.1, §5 specifica tecnica v2)
-- Da eseguire una sola volta nel SQL Editor del progetto Supabase, dopo schema.sql.
--
-- Verificato empiricamente (S3, query dirette via REST con la publishable key):
-- RLS è già abilitata su tutte le tabelle (default della piattaforma per i
-- progetti Supabase recenti con le nuove API key sb_publishable_/sb_secret_),
-- pur non essendoci mai stato un ALTER TABLE ... ENABLE ROW LEVEL SECURITY
-- esplicito in schema.sql. Senza policy, quindi, anon e authenticated non
-- vedono/scrivono nulla — le ALTER TABLE qui sotto sono perciò dei no-op
-- difensivi (idempotenti), non il fix principale.
--
-- Il fix che serve davvero è la policy self-read su users qui sotto: la
-- Dashboard (S3, Tab.3) deve conoscere il proprio ruolo per il redirect
-- (/form vs /coordinator) e lo legge via supabase-js con la sessione utente,
-- non tramite una Function — senza questa policy la query restituisce
-- sempre zero righe e la Dashboard resta bloccata su "nessun profilo
-- associato" anche per un utente valido.
--
-- Tutte le Function (factors.js, contributions.js, magic-link.js) e gli
-- script di seed usano SUPABASE_SERVICE_KEY, che bypassa sempre le RLS in
-- Postgres — quindi questo file non cambia il loro comportamento.
--
-- Se in una sessione futura (S5+) si aggiunge un altro accesso diretto lato
-- client (es. la tabella locks per il polling §5.2, quando implementato),
-- andranno aggiunte qui le policy permissive specifiche per quel caso.

alter table territories enable row level security;
alter table users enable row level security;
alter table raci enable row level security;
alter table factors enable row level security;
alter table contributions enable row level security;
alter table locks enable row level security;

-- S10 (§10 v4): stesso no-op difensivo delle righe sopra — indicatori.js e
-- indicatori-scelti.js usano SUPABASE_SERVICE_KEY come tutte le altre
-- Function, quindi anche qui l'unica autorizzazione reale è quella
-- applicata lato Function (RACI + stato validated del contributo), non RLS.
alter table indicatori enable row level security;
alter table indicatori_scelti enable row level security;

-- Unica eccezione: Dashboard (S3, Tab.3) deve sapere il proprio ruolo per
-- decidere il redirect (/form vs /coordinator) e lo legge direttamente via
-- supabase-js con l'anon key + sessione utente, non tramite una Function.
-- Serve quindi una policy che permetta a ciascun utente autenticato di
-- leggere solo la propria riga.
create policy "users can read own row" on users
  for select
  using (id = auth.uid());

-- Nessun'altra policy permissiva aggiunta: con RLS abilitata e zero policy
-- per un ruolo/tabella, quel ruolo non vede né scrive nulla. authenticated
-- e anon restano quindi a zero accesso diretto altrove; service_role
-- continua a bypassare tutto.
