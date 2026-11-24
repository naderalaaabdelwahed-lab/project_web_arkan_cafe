-- POS preparation routing and station workflow.
alter table public.products
  add column if not exists preparation_station text not null default 'kitchen';

alter table public.products
  drop constraint if exists products_preparation_station_check;

alter table public.products
  add constraint products_preparation_station_check
  check (preparation_station in ('kitchen', 'bar'));

-- Route the existing drinks category to the bar; all other existing products stay in kitchen.
update public.products p
set preparation_station = case
  when c.name = 'مشروبات' then 'bar'
  else 'kitchen'
end
from public.categories c
where c.id = p.category_id;

alter table public.order_items
  add column if not exists preparation_station text,
  add column if not exists preparation_status text not null default 'pending',
  add column if not exists preparation_started_at timestamptz,
  add column if not exists prepared_at timestamptz,
  add column if not exists preparation_note text;

alter table public.order_items
  drop constraint if exists order_items_preparation_station_check;
alter table public.order_items
  add constraint order_items_preparation_station_check
  check (preparation_station is null or preparation_station in ('kitchen', 'bar'));

alter table public.order_items
  drop constraint if exists order_items_preparation_status_check;
alter table public.order_items
  add constraint order_items_preparation_status_check
  check (preparation_status in ('pending', 'preparing', 'ready'));

-- Snapshot the routing on each item so changing a product's station won't move old tickets.
update public.order_items oi
set preparation_station = coalesce(
      (select p.preparation_station from public.products p where p.id = oi.product_id),
      'kitchen'
    ),
    preparation_started_at = coalesce(oi.preparation_started_at, o.created_at, now()),
    preparation_status = case
      when o.status in ('delivered', 'cancelled') then 'ready'
      else oi.preparation_status
    end,
    prepared_at = case
      when o.status in ('delivered', 'cancelled') then coalesce(oi.prepared_at, o.created_at, now())
      else oi.prepared_at
    end
from public.orders o
where o.id = oi.order_id;

create or replace function public.pos_snapshot_item_station()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_station text;
begin
  if new.preparation_station is null then
    select coalesce(p.preparation_station, 'kitchen')
      into v_station
    from public.products p
    where p.id = new.product_id;

    new.preparation_station := coalesce(v_station, 'kitchen');
  end if;

  new.preparation_status := coalesce(new.preparation_status, 'pending');
  new.preparation_started_at := coalesce(new.preparation_started_at, now());
  return new;
end;
$$;

revoke all on function public.pos_snapshot_item_station() from public;
revoke all on function public.pos_snapshot_item_station() from anon;
revoke all on function public.pos_snapshot_item_station() from authenticated;

drop trigger if exists trg_pos_snapshot_item_station on public.order_items;
create trigger trg_pos_snapshot_item_station
before insert on public.order_items
for each row execute function public.pos_snapshot_item_station();

drop policy if exists "Kitchen and bar employees view orders" on public.orders;
create policy "Kitchen and bar employees view orders"
on public.orders for select to authenticated
using (
  public.is_admin()
  or public.has_permission('kitchen.view')
  or public.has_permission('bar.view')
);

drop policy if exists "Kitchen and bar employees view order items" on public.order_items;
create policy "Kitchen and bar employees view order items"
on public.order_items for select to authenticated
using (
  public.is_admin()
  or (preparation_station = 'kitchen' and public.has_permission('kitchen.view'))
  or (preparation_station = 'bar' and public.has_permission('bar.view'))
);

create or replace function public.complete_station_order(
  p_order_id bigint,
  p_station text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_station is null or p_station not in ('kitchen', 'bar') then
    raise exception 'Invalid preparation station';
  end if;

  if not (
    public.is_admin()
    or public.has_permission(p_station || '.view')
  ) then
    raise exception 'Unauthorized';
  end if;

  perform 1
  from public.orders o
  where o.id = p_order_id
    and o.status not in ('delivered', 'cancelled')
  for update;

  if not found then
    raise exception 'Active order not found';
  end if;

  update public.order_items oi
  set preparation_status = 'ready',
      prepared_at = now()
  where oi.order_id = p_order_id
    and oi.preparation_station = p_station
    and oi.preparation_status <> 'ready';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    raise exception 'No unfinished items for this station';
  end if;

  return v_updated;
end;
$$;

revoke all on function public.complete_station_order(bigint, text) from public;
revoke all on function public.complete_station_order(bigint, text) from anon;
grant execute on function public.complete_station_order(bigint, text) to authenticated;

-- Enable live ticket refresh for both station screens.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_items'
  ) then
    alter publication supabase_realtime add table public.order_items;
  end if;
end;
$$;
