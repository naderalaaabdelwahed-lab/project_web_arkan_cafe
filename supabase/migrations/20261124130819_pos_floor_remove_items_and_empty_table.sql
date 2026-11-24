-- Safe POS removal of unprepared items and cancellation of an unpaid table order.
create or replace function public.pos_remove_pending_order_item(p_order_item_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_item public.order_items%rowtype;
  v_order public.orders%rowtype;
  v_subtotal numeric(12,2);
  v_discount_share numeric(12,2);
  v_new_total numeric(12,2);
  v_paid numeric(12,2);
  v_remaining_items integer;
begin
  if v_uid is null or not (public.is_admin() or public.has_permission('pos.use')) then raise exception 'POS permission required'; end if;
  select * into v_item from public.order_items where id=p_order_item_id for update;
  if not found then raise exception 'Order item not found'; end if;
  select * into v_order from public.orders where id=v_item.order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_type<>'dine-in' or v_order.status in ('delivered','cancelled') then raise exception 'Only an active table order can be edited'; end if;
  if v_item.preparation_status<>'pending' then raise exception 'Only items that have not started preparation can be removed'; end if;
  select coalesce(sum(subtotal),0) into v_subtotal from public.order_items where order_id=v_order.id;
  if v_subtotal<=0 then raise exception 'Invalid order subtotal'; end if;
  if v_item.subtotal>=v_subtotal then v_discount_share:=v_order.discount_amount;
  else v_discount_share:=least(v_order.discount_amount,round(v_order.discount_amount*v_item.subtotal/v_subtotal,2)); end if;
  v_new_total:=greatest(0,round(v_order.total_amount-v_item.subtotal+v_discount_share,2));
  select coalesce(sum(amount),0) into v_paid from public.pos_payments where order_id=v_order.id;
  if v_paid>v_new_total then raise exception 'Cannot remove this item because payments already received exceed the new order total'; end if;
  delete from public.order_items where id=p_order_item_id;
  select count(*) into v_remaining_items from public.order_items where order_id=v_order.id;
  if v_remaining_items=0 then
    update public.orders set status='cancelled',total_amount=0,discount_amount=0,cancellation_reason='تم حذف آخر صنف من الطلب',
      cancelled_at=now(),cancelled_by=v_uid::text where id=v_order.id;
  else
    update public.orders set total_amount=v_new_total,discount_amount=greatest(0,discount_amount-v_discount_share) where id=v_order.id;
  end if;
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(v_order.id,'pending_order_item_removed',jsonb_build_object('order_item_id',v_item.id,'product_name',v_item.product_name,
    'quantity',v_item.quantity,'subtotal_removed',v_item.subtotal,'discount_removed',v_discount_share,
    'new_total',case when v_remaining_items=0 then 0 else v_new_total end),v_uid);
  return jsonb_build_object('order_id',v_order.id,'new_total',case when v_remaining_items=0 then 0 else v_new_total end,'order_closed',v_remaining_items=0);
end;
$$;

create or replace function public.pos_empty_table_order(p_order_id bigint,p_reason text default 'تم إفراغ الطاولة بناءً على طلب الكاشير')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_order public.orders%rowtype;
  v_paid numeric(12,2);
  v_item_count integer;
begin
  if v_uid is null or not (public.is_admin() or public.has_permission('pos.use')) then raise exception 'POS permission required'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'A reason is required'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_type<>'dine-in' or v_order.status in ('delivered','cancelled') or v_order.table_number is null or v_order.table_area is null then
    raise exception 'Only an active table order can be emptied';
  end if;
  select coalesce(sum(amount),0) into v_paid from public.pos_payments where order_id=p_order_id;
  if v_paid>0 then raise exception 'This order has payments; settle or resolve them before emptying the table'; end if;
  select count(*) into v_item_count from public.order_items where order_id=p_order_id;
  if exists(select 1 from public.order_items where order_id=p_order_id and preparation_status<>'pending') then
    raise exception 'Cannot empty a table after preparation has started for any item';
  end if;
  delete from public.order_items where order_id=p_order_id;
  update public.orders set status='cancelled',total_amount=0,discount_amount=0,cancellation_reason=trim(p_reason),
    cancelled_at=now(),cancelled_by=v_uid::text where id=p_order_id;
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(p_order_id,'table_emptied',jsonb_build_object('reason',trim(p_reason),'table_number',v_order.table_number,
    'table_area',v_order.table_area,'items_removed',v_item_count),v_uid);
  return jsonb_build_object('order_id',p_order_id,'table_number',v_order.table_number,'table_area',v_order.table_area,
    'items_removed',v_item_count,'closed',true);
end;
$$;

revoke execute on function public.pos_remove_pending_order_item(bigint) from public,anon;
revoke execute on function public.pos_empty_table_order(bigint,text) from public,anon;
grant execute on function public.pos_remove_pending_order_item(bigint) to authenticated;
grant execute on function public.pos_empty_table_order(bigint,text) to authenticated;
