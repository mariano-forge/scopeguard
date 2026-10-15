-- Supabase publishes the tables of the public schema through its REST API (PostgREST), reachable with
-- the project's publishable key. Kora never uses that API: its server connects to Postgres as the
-- tables' owner. Row level security with no policy closes every table to the API roles (anon,
-- authenticated); the owner is not subject to it, so the app is unaffected. Harmless elsewhere.
-- New tables must enable it too (see src/db/schema.ts).
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '\_\_drizzle%' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
