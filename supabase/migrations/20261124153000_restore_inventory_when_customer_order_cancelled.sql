create or replace function public.cancel_customer_order(
  p_order_id bigint,
  p_cancellation_token uuid,
  p_cancellation_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.orders%rowtype;
  v_deduction record;
  v_movement_id bigint;
  v_actor uuid := auth.uid();
begin
  if p_cancellation_reason is null
     or length(trim(p_cancellation_reason)) = 0 then
    raise exception 'يجب كتابة سبب الإلغاء';
  end if;

  if length(trim(p_cancellation_reason)) > 500 then
    raise exception 'سبب الإلغاء يجب ألا يتجاوز 500 حرف';
  end if;

  -- Lock the order so concurrent cancellation attempts cannot restore stock twice.
  select *
    into v_order
  from public.orders
  where id = p_order_id
    and cancellation_token = p_cancellation_token
    and status = 'pending'
  for update;

  if not found then
    return false;
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = 'customer',
      cancellation_reason = trim(p_cancellation_reason)
  where id = p_order_id;

  -- Restore every active deduction once and write an auditable reversal movement.
  for v_deduction in
    select d.inventory_item_id, sum(d.quantity)::numeric as quantity
    from public.inventory_order_deductions d
    where d.order_id = p_order_id
      and d.is_reversed = false
    group by d.inventory_item_id
    order by d.inventory_item_id
  loop
    update public.inventory_items
    set current_stock = current_stock + v_deduction.quantity,
        updated_at = now()
    where id = v_deduction.inventory_item_id;

    if not found then
      raise exception 'Cannot restore missing inventory item %',
        v_deduction.inventory_item_id;
    end if;

    insert into public.inventory_movements (
      inventory_item_id,
      movement_type,
      quantity,
      unit_cost,
      source_type,
      source_id,
      order_id,
      notes,
      created_by
    )
    select
      v_deduction.inventory_item_id,
      'reversal',
      v_deduction.quantity,
      coalesce(ii.unit_cost, 0),
      'order_cancellation',
      p_order_id,
      p_order_id,
      'Inventory restored after customer cancellation for order #' || p_order_id,
      v_actor
    from public.inventory_items ii
    where ii.id = v_deduction.inventory_item_id
    returning id into v_movement_id;

    update public.inventory_order_deductions
    set is_reversed = true,
        reversed_at = now()
    where order_id = p_order_id
      and inventory_item_id = v_deduction.inventory_item_id
      and is_reversed = false;
  end loop;

  return true;
end;
$function$;

revoke all on function public.cancel_customer_order(bigint, uuid, text) from public;
revoke all on function public.cancel_customer_order(bigint, uuid, text) from anon;
grant execute on function public.cancel_customer_order(bigint, uuid, text) to anon, authenticated;
