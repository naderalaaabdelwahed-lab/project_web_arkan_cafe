-- Applied to Supabase project elbantrhzbpojhmwodbl on 2026-11-26.
-- Row identity allows the desktop's generic CRUD endpoint to edit screen/category assignments.
ALTER TABLE public.preparation_screen_categories
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid();
UPDATE public.preparation_screen_categories SET id=gen_random_uuid() WHERE id IS NULL;
ALTER TABLE public.preparation_screen_categories ALTER COLUMN id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_preparation_screen_categories_id
  ON public.preparation_screen_categories(id);

-- Desktop administration uses a server-held Supabase Auth session.
-- Only users whose trusted app_metadata.egsoft_role is 'admin' can access operational tables.
CREATE OR REPLACE FUNCTION public.is_egsoft_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'egsoft_role', '') = 'admin';
$$;

REVOKE ALL ON FUNCTION public.is_egsoft_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_egsoft_admin() TO authenticated;

DO $$
DECLARE p record;
DECLARE t record;
BEGIN
  FOR p IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND 'authenticated' = ANY(roles)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;

  FOR t IN
    SELECT c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND c.relname <> 'hr_employee_face_profiles'
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING ((SELECT public.is_egsoft_admin())) WITH CHECK ((SELECT public.is_egsoft_admin()))',
      'Egsoft admins only', t.tablename
    );
  END LOOP;
END $$;
