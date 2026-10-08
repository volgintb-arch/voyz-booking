-- Hosted Postgres such as Supabase publishes the public schema through its own
-- REST API (roles anon / authenticated). Nothing here is meant for that API:
-- guest phones and bookings are served only by our server.
-- Row level security without policies denies every role except the table owner
-- (our server's user), and the API roles lose their grants.

do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;

  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon';
    execute 'revoke all on all sequences in schema public from anon';
    execute 'alter default privileges in schema public revoke all on tables from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on all tables in schema public from authenticated';
    execute 'revoke all on all sequences in schema public from authenticated';
    execute 'alter default privileges in schema public revoke all on tables from authenticated';
  end if;
end $$;
