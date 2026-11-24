create or replace function public.pos_remove_pending_order_item_quantity(
  p_order_item_id bigint,
  p_quantity_to_remove integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_subtotal numeric(12,2);
  v_removed_subtotal numeric(12,2);
  v_discount_share numeric(12,2);
  v_new_total numeric(12,2);
  v_paid numeric(12,2);
  v_remaining_items integer;
  v_new_quantity integer;
begin
  if v_uid is null or not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;
  if p_quantity_to_remove is null or p_quantity_to_remove < 1 then
    raise exception 'Quantity to remove must be at least 1';
  end if;

  select * into v_item from public.order_items where id = p_order_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from public.orders where id = v_item.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_type <> 'dine-in' or v_order.status in ('delivered','cancelled') then
    raise exception 'Only an active table order can be edited';
  end if;
  if v_item.preparation_status <> 'pending' then
    raise exception 'Only items that have not started preparation can be changed';
  end if;
  if p_quantity_to_remove > v_item.quantity then
    raise exception 'Cannot remove more than the ordered quantity';
  end if;

  select coalesce(sum(subtotal),0) into v_subtotal
  from public.order_items where order_id = v_order.id;
  if v_subtotal <= 0 then raise exception 'Invalid order subtotal'; end if;

  v_removed_subtotal := round(v_item.subtotal * p_quantity_to_remove / v_item.quantity, 2);
  if p_quantity_to_remove = v_item.quantity then
    v_discount_share := least(v_order.discount_amount,
      round(v_order.discount_amount * v_item.subtotal / v_subtotal, 2));
    if v_item.subtotal >= v_subtotal then v_discount_share := v_order.discount_amount; end if;
  else
    v_discount_share := least(v_order.discount_amount,
      round(v_order.discount_amount * v_removed_subtotal / v_subtotal, 2));
  end if;

  v_new_total := greatest(0, round(v_order.total_amount - v_removed_subtotal + v_discount_share, 2));
  select coalesce(sum(amount),0) into v_paid from public.pos_payments where order_id = v_order.id;
  if v_paid > v_new_total then
    raise exception 'Cannot reduce this item because payments already received exceed the new order total';
  end if;

  v_new_quantity := v_item.quantity - p_quantity_to_remove;
  if v_new_quantity = 0 then
    delete from public.order_items where id = p_order_item_id;
  else
    update public.order_items
    set quantity = v_new_quantity,
        subtotal = round(v_item.subtotal - v_removed_subtotal, 2)
    where id = p_order_item_id;
  end if;

  select count(*) into v_remaining_items from public.order_items where order_id = v_order.id;
  if v_remaining_items = 0 then
    update public.orders set status = 'cancelled', total_amount = 0, discount_amount = 0,
      cancellation_reason = 'تم حذف آخر صنف من الطلب', cancelled_at = now(), cancelled_by = v_uid::text
    where id = v_order.id;
  else
    update public.orders set total_amount = v_new_total,
      discount_amount = greatest(0, discount_amount - v_discount_share)
    where id = v_order.id;
  end if;

  insert into public.pos_audit_logs(order_id, action, details, actor_id)
  values (v_order.id, 'pending_order_item_quantity_removed',
    jsonb_build_object('order_item_id',v_item.id,'product_name',v_item.product_name,
      'quantity_removed',p_quantity_to_remove,'quantity_remaining',v_new_quantity,
      'subtotal_removed',v_removed_subtotal,'discount_removed',v_discount_share,
      'new_total',case when v_remaining_items=0 then 0 else v_new_total end), v_uid);

  return jsonb_build_object('order_id',v_order.id,'quantity_remaining',v_new_quantity,
    'new_total',case when v_remaining_items=0 then 0 else v_new_total end,
    'order_closed',v_remaining_items=0);
end;
$function$;

revoke all on function public.pos_remove_pending_order_item_quantity(bigint, integer) from public, anon;
grant execute on function public.pos_remove_pending_order_item_quantity(bigint, integer) to authenticated;
