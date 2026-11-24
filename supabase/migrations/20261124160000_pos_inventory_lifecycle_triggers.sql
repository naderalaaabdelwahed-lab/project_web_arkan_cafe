create or replace function public.apply_pos_order_item_inventory(
  p_order_id bigint,
  p_order_item_id bigint,
  p_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_product_id bigint;
  v_product_name text;
  v_recipe_found boolean;
  v_required record;
  v_available numeric;
  v_movement_id bigint;
  v_cycle integer;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Invalid POS inventory deduction quantity';
  end if;

  select oi.product_id, oi.product_name
    into v_product_id, v_product_name
  from public.order_items oi
  where oi.id = p_order_item_id
    and oi.order_id = p_order_id;

  if not found then
    raise exception 'POS order item not found while deducting inventory';
  end if;

  select exists (
    select 1
    from public.inventory_recipes r
    join public.inventory_recipe_items ri on ri.recipe_id = r.id
    where r.product_id = v_product_id
      and r.is_active = true
  ) into v_recipe_found;

  if not v_recipe_found then
    raise exception 'Product "%" does not have an active inventory recipe', v_product_name;
  end if;

  -- Lock and validate every required stock item before applying any deduction.
  for v_required in
    select ri.inventory_item_id,
      sum((ri.quantity /
        case when u.base_unit_id is not null
          then coalesce(nullif(u.conversion_factor, 0), 1) else 1 end
      ) * p_quantity)::numeric as required_quantity
    from public.inventory_recipes r
    join public.inventory_recipe_items ri on ri.recipe_id = r.id
    join public.inventory_items ii on ii.id = ri.inventory_item_id
    left join public.inventory_units u on u.id = ii.unit_id
    where r.product_id = v_product_id and r.is_active = true
      and ii.is_active = true and ii.item_type in ('raw', 'finished')
    group by ri.inventory_item_id
    order by ri.inventory_item_id
  loop
    select ii.current_stock into v_available
    from public.inventory_items ii
    where ii.id = v_required.inventory_item_id
      and ii.is_active = true and ii.item_type in ('raw', 'finished')
    for update;

    if not found then
      raise exception 'Inventory item % is missing or inactive', v_required.inventory_item_id;
    end if;

    if coalesce(v_available, 0) < v_required.required_quantity then
      raise exception 'Insufficient stock for inventory item %. Available: %, Required: %',
        v_required.inventory_item_id, coalesce(v_available, 0), v_required.required_quantity;
    end if;
  end loop;

  for v_required in
    select ri.inventory_item_id,
      sum((ri.quantity /
        case when u.base_unit_id is not null
          then coalesce(nullif(u.conversion_factor, 0), 1) else 1 end
      ) * p_quantity)::numeric as required_quantity
    from public.inventory_recipes r
    join public.inventory_recipe_items ri on ri.recipe_id = r.id
    join public.inventory_items ii on ii.id = ri.inventory_item_id
    left join public.inventory_units u on u.id = ii.unit_id
    where r.product_id = v_product_id and r.is_active = true
    group by ri.inventory_item_id
    order by ri.inventory_item_id
  loop
    update public.inventory_items
    set current_stock = current_stock - v_required.required_quantity, updated_at = now()
    where id = v_required.inventory_item_id;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit_cost,
      source_type, source_id, order_id, notes, created_by
    )
    select ii.id, 'sale', -v_required.required_quantity, coalesce(ii.unit_cost, 0),
      'order', p_order_id, p_order_id,
      'Automatic POS deduction for order item #' || p_order_item_id,
      (select o.pos_created_by from public.orders o where o.id = p_order_id)
    from public.inventory_items ii
    where ii.id = v_required.inventory_item_id
    returning id into v_movement_id;

    select coalesce(max(d.cycle_no), 0) + 1 into v_cycle
    from public.inventory_order_deductions d
    where d.order_item_id = p_order_item_id
      and d.inventory_item_id = v_required.inventory_item_id;

    insert into public.inventory_order_deductions (
      order_id, order_item_id, inventory_item_id, cycle_no, quantity, movement_id
    ) values (
      p_order_id, p_order_item_id, v_required.inventory_item_id,
      v_cycle, v_required.required_quantity, v_movement_id
    );
  end loop;
end;
$function$;

create or replace function public.reverse_pos_order_item_inventory(
  p_order_id bigint,
  p_order_item_id bigint,
  p_removed_quantity integer,
  p_previous_quantity integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_deduction record;
  v_restore numeric;
  v_movement_id bigint;
  v_actor uuid;
begin
  if p_removed_quantity is null or p_removed_quantity < 1
     or p_previous_quantity is null or p_previous_quantity < p_removed_quantity then
    raise exception 'Invalid POS inventory reversal quantity';
  end if;

  select o.pos_created_by into v_actor from public.orders o where o.id = p_order_id;

  for v_deduction in
    select d.id, d.inventory_item_id, d.quantity
    from public.inventory_order_deductions d
    where d.order_id = p_order_id and d.order_item_id = p_order_item_id
      and d.is_reversed = false
    order by d.inventory_item_id, d.id
    for update
  loop
    v_restore := v_deduction.quantity * p_removed_quantity / p_previous_quantity;
    if v_restore <= 0 then continue; end if;

    update public.inventory_items
    set current_stock = current_stock + v_restore, updated_at = now()
    where id = v_deduction.inventory_item_id;

    if not found then
      raise exception 'Cannot restore missing inventory item %', v_deduction.inventory_item_id;
    end if;

    insert into public.inventory_movements (
      inventory_item_id, movement_type, quantity, unit_cost,
      source_type, source_id, order_id, notes, created_by
    )
    select ii.id, 'reversal', v_restore, coalesce(ii.unit_cost, 0),
      'order_item_reversal', p_order_item_id, p_order_id,
      'POS inventory restored for removed quantity from order item #' || p_order_item_id,
      v_actor
    from public.inventory_items ii
    where ii.id = v_deduction.inventory_item_id
    returning id into v_movement_id;

    if p_removed_quantity = p_previous_quantity then
      update public.inventory_order_deductions
      set is_reversed = true, reversed_at = now(), quantity = 0
      where id = v_deduction.id;
    else
      update public.inventory_order_deductions
      set quantity = greatest(0, quantity - v_restore)
      where id = v_deduction.id;
    end if;
  end loop;
end;
$function$;

create or replace function public.handle_pos_order_item_inventory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old_pos boolean := false;
  v_new_pos boolean := false;
begin
  if tg_op <> 'INSERT' then
    select coalesce(o.pos_created_by is not null, false) into v_old_pos
    from public.orders o where o.id = old.order_id;
  end if;
  if tg_op <> 'DELETE' then
    select coalesce(o.pos_created_by is not null, false) into v_new_pos
    from public.orders o where o.id = new.order_id;
  end if;

  if tg_op = 'INSERT' then
    if v_new_pos then
      perform public.apply_pos_order_item_inventory(new.order_id, new.id, new.quantity);
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if v_old_pos then
      perform public.reverse_pos_order_item_inventory(old.order_id, old.id, old.quantity, old.quantity);
    end if;
    return old;
  end if;

  if old.order_id is distinct from new.order_id then
    if v_old_pos and v_new_pos then
      update public.inventory_order_deductions set order_id = new.order_id
      where order_item_id = old.id and is_reversed = false;
      update public.inventory_movements set order_id = new.order_id
      where id in (select d.movement_id from public.inventory_order_deductions d
                   where d.order_item_id = old.id);
    elsif v_old_pos and not v_new_pos then
      perform public.reverse_pos_order_item_inventory(old.order_id, old.id, old.quantity, old.quantity);
    elsif not v_old_pos and v_new_pos then
      perform public.apply_pos_order_item_inventory(new.order_id, new.id, new.quantity);
    end if;
  elsif v_new_pos and new.quantity < old.quantity then
    perform public.reverse_pos_order_item_inventory(
      new.order_id, new.id, old.quantity - new.quantity, old.quantity
    );
  elsif v_new_pos and new.quantity > old.quantity then
    perform public.apply_pos_order_item_inventory(new.order_id, new.id, new.quantity - old.quantity);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_pos_order_item_inventory on public.order_items;
create trigger trg_pos_order_item_inventory
after insert or delete or update of order_id, quantity
on public.order_items
for each row execute function public.handle_pos_order_item_inventory();

revoke all on function public.apply_pos_order_item_inventory(bigint,bigint,integer) from public, anon, authenticated;
revoke all on function public.reverse_pos_order_item_inventory(bigint,bigint,integer,integer) from public, anon, authenticated;
revoke all on function public.handle_pos_order_item_inventory() from public, anon, authenticated;
