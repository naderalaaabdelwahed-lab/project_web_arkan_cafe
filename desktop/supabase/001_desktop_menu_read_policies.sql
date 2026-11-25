-- ARKAN Desktop: allow read-only menu access from the POS using the publishable key.
-- Orders, order items and payments remain protected until employee authentication is added.

grant select on table public.categories, public.products to anon;

drop policy if exists "Public can read active menu categories" on public.categories;
create policy "Public can read active menu categories"
on public.categories
for select
to anon
using (is_active = true);

drop policy if exists "Public can read available menu products" on public.products;
create policy "Public can read available menu products"
on public.products
for select
to anon
using (is_available = true);
