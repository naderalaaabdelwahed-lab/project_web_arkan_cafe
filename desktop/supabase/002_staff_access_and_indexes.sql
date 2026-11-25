-- ARKAN Desktop POS: authenticated staff access + safe public menu reads.
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

-- Any signed-in staff account can operate the POS tables.
-- Restrict staff roles further with app_metadata/role-based policies before
-- introducing managers, cashiers, kitchen-only accounts, or multiple branches.
drop policy if exists "Staff full access categories" on public.categories;
create policy "Staff full access categories" on public.categories
for all to authenticated using (true) with check (true);

drop policy if exists "Staff full access products" on public.products;
create policy "Staff full access products" on public.products
for all to authenticated using (true) with check (true);

drop policy if exists "Staff full access restaurant_tables" on public.restaurant_tables;
create policy "Staff full access restaurant_tables" on public.restaurant_tables
for all to authenticated using (true) with check (true);

drop policy if exists "Staff full access orders" on public.orders;
create policy "Staff full access orders" on public.orders
for all to authenticated using (true) with check (true);

drop policy if exists "Staff full access order_items" on public.order_items;
create policy "Staff full access order_items" on public.order_items
for all to authenticated using (true) with check (true);

drop policy if exists "Staff full access payments" on public.payments;
create policy "Staff full access payments" on public.payments
for all to authenticated using (true) with check (true);

-- Covering indexes for foreign keys.
create index if not exists idx_order_items_product_id on public.order_items(product_id);
create index if not exists idx_orders_table_id on public.orders(table_id);
create index if not exists idx_payments_order_id on public.payments(order_id);
