
create or replace function public.get_pos_sellable_product_ids()
returns table(product_id bigint)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null
     or not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;

  return query
  select distinct r.product_id
  from public.inventory_recipes r
  where r.is_active = true
    and exists (
      select 1
      from public.inventory_recipe_items ri
      where ri.recipe_id = r.id
    )
    and not exists (
      select 1
      from public.inventory_recipe_items ri
      left join public.inventory_items ii on ii.id = ri.inventory_item_id
      where ri.recipe_id = r.id
        and (
          ii.id is null
          or ii.is_active = false
          or ii.item_type not in ('raw', 'finished')
        )
    );
end;
$function$;

revoke all on function public.get_pos_sellable_product_ids() from public, anon;
grant execute on function public.get_pos_sellable_product_ids() to authenticated;
