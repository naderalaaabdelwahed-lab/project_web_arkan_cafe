-- Snapshot the product's assigned printer on each new order item.
-- Existing order items remain unchanged so historical tickets are not rerouted.
alter table public.order_items
  add column printer_id bigint references public.printers(id) on delete set null;

create index order_items_printer_id_idx
  on public.order_items (printer_id);

create or replace function public.pos_snapshot_item_station()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_station text;
  v_category_id bigint;
  v_printer_id bigint;
begin
  if new.preparation_station is null
    or new.preparation_category_id is null
    or new.printer_id is null then
    select
      coalesce(p.preparation_station, 'kitchen'),
      p.category_id,
      p.printer_id
    into v_station, v_category_id, v_printer_id
    from public.products p
    where p.id = new.product_id;

    if new.preparation_station is null then
      new.preparation_station := coalesce(v_station, 'kitchen');
    end if;
    if new.preparation_category_id is null then
      new.preparation_category_id := v_category_id;
    end if;
    if new.printer_id is null then
      new.printer_id := v_printer_id;
    end if;
  end if;

  new.preparation_status := coalesce(new.preparation_status, 'pending');
  new.preparation_started_at := coalesce(new.preparation_started_at, now());
  return new;
end;
$function$;
