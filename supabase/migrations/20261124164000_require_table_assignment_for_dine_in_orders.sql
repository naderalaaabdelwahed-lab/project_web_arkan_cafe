
create or replace function public.require_table_for_dine_in_order()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.order_type = 'dine-in'
     and (
       new.table_number is null
       or new.table_number < 1
       or new.table_area is null
       or new.table_area not in ('indoor', 'outdoor')
     ) then
    raise exception 'Dine-in orders must be assigned to a valid table in POS';
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_orders_require_dine_in_table on public.orders;
create trigger trg_orders_require_dine_in_table
before insert or update of order_type, table_number, table_area
on public.orders
for each row execute function public.require_table_for_dine_in_order();

revoke all on function public.require_table_for_dine_in_order() from public, anon, authenticated;
