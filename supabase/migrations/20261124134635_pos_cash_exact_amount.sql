create or replace function public.pos_settle_and_close_cash(
  p_order_id bigint,
  p_received numeric
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_paid numeric(12,2);
  v_due numeric(12,2);
  v_change numeric(12,2);
begin
  if v_uid is null or not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;
  if p_received is null or p_received <= 0 then
    raise exception 'Enter a valid cash amount';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order not found'; end if;
  if v_order.order_type <> 'dine-in' or v_order.status in ('delivered','cancelled')
     or v_order.table_number is null or v_order.table_area is null then
    raise exception 'Only an active table order can be settled';
  end if;
  if not exists (
    select 1 from public.business_days bd
    where bd.id = v_order.business_day_id and bd.status = 'open'
  ) then raise exception 'Business day is closed'; end if;

  select coalesce(sum(pp.amount),0) into v_paid
  from public.pos_payments pp where pp.order_id = p_order_id;

  v_due := greatest(0, v_order.total_amount - v_paid);
  if v_due <= 0 then raise exception 'This order is already fully paid'; end if;
  if p_received < v_due then
    raise exception 'Received cash must be at least the remaining amount';
  end if;

  v_change := p_received - v_due;

  insert into public.pos_payments(order_id,method,amount,created_by)
  values(p_order_id,'cash',v_due,v_uid);

  update public.orders
  set status = 'delivered'
  where id = p_order_id;

  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(
    p_order_id,
    'cash_settled_and_order_closed',
    jsonb_build_object(
      'received',p_received,
      'recorded',v_due,
      'change',v_change,
      'previous_paid',v_paid,
      'order_total',v_order.total_amount,
      'table_number',v_order.table_number,
      'table_area',v_order.table_area
    ),
    v_uid
  );

  return jsonb_build_object(
    'received',p_received,
    'recorded',v_due,
    'change',v_change,
    'paid_total',v_paid+v_due,
    'remaining',0,
    'closed',true
  );
end;
$$;

revoke all on function public.pos_settle_and_close_cash(bigint,numeric) from public, anon;
grant execute on function public.pos_settle_and_close_cash(bigint,numeric) to authenticated;