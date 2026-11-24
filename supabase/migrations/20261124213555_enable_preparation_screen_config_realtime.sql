-- Publish configurable preparation screen settings so open displays refresh when routing changes.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'preparation_screens'
  ) then
    alter publication supabase_realtime add table public.preparation_screens;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'preparation_screen_categories'
  ) then
    alter publication supabase_realtime add table public.preparation_screen_categories;
  end if;
end;
$$;