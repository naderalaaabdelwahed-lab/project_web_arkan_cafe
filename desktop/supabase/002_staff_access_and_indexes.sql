-- Egsoft Desktop POS: admin-only operational access + safe public menu reads.
-- Apply to Supabase project: elbantrhzbpojhmwodbl
-- This intentionally does NOT grant anonymous access to orders, items, payments or tables.

revoke all privileges on table
  public.categories, public.products, public.restaurant_tables,
  public.orders, public.order_items, public.payments
from anon;

grant select on table public.categories, public.products to anon;

drop policy if exists "Public can read active categories" on public.categories;
create policy "Public can read active categories"
on public.categories for select to anon
using (is_active = true);

drop policy if exists "Public can read available products" on public.products;
create policy "Public can read available products"
on public.products for select to anon
using (is_available = true);

-- Only trusted Egsoft administrators can access operational POS tables.
-- The role must be assigned in auth.users.raw_app_meta_data (app_metadata),
-- never in user-editable user_metadata.
CREATE OR REPLACE FUNCTION public.is_egsoft_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'egsoft_role', '') = 'admin';
$;
REVOKE ALL ON FUNCTION public.is_egsoft_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_egsoft_admin() TO authenticated;
drop policy if exists "Staff full access categories" on public.categories;
create policy "Staff full access categories" on public.categories
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

drop policy if exists "Staff full access products" on public.products;
create policy "Staff full access products" on public.products
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

drop policy if exists "Staff full access restaurant_tables" on public.restaurant_tables;
create policy "Staff full access restaurant_tables" on public.restaurant_tables
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

drop policy if exists "Staff full access orders" on public.orders;
create policy "Staff full access orders" on public.orders
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

drop policy if exists "Staff full access order_items" on public.order_items;
create policy "Staff full access order_items" on public.order_items
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

drop policy if exists "Staff full access payments" on public.payments;
create policy "Staff full access payments" on public.payments
for all to authenticated using ((SELECT public.is_egsoft_admin())) with check ((SELECT public.is_egsoft_admin()));

-- Covering indexes for foreign keys.
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_orders_table_id on public.orders(table_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
