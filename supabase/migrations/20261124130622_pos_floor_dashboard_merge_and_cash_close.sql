-- Atomic cash settlement and table-order merge for the floor dashboard.
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
  if p_received is null or p_received <= 0 then raise exception 'Enter a valid cash amount'; end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.order_type <> 'dine-in' or v_order.status in ('delivered','cancelled')
     or v_order.table_number is null or v_order.table_area is null then
    raise exception 'Only an active table order can be settled';
  end if;
  if not exists(select 1 from public.business_days bd where bd.id=v_order.business_day_id and bd.status='open') then
    raise exception 'Business day is closed';
  end if;
  select coalesce(sum(pp.amount),0) into v_paid from public.pos_payments pp where pp.order_id=p_order_id;
  v_due:=greatest(0,v_order.total_amount-v_paid);
  if v_due<=0 then raise exception 'This order is already fully paid'; end if;
  if p_received<=v_due then raise exception 'Received cash must be greater than the remaining amount'; end if;
  v_change:=p_received-v_due;
  insert into public.pos_payments(order_id,method,amount,created_by) values(p_order_id,'cash',v_due,v_uid);
  update public.orders set status='delivered' where id=p_order_id;
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(p_order_id,'cash_settled_and_order_closed',
    jsonb_build_object('received',p_received,'recorded',v_due,'change',v_change,'previous_paid',v_paid,
      'order_total',v_order.total_amount,'table_number',v_order.table_number,'table_area',v_order.table_area),v_uid);
  return jsonb_build_object('received',p_received,'recorded',v_due,'change',v_change,
    'paid_total',v_paid+v_due,'remaining',0,'closed',true);
end;
$$;

create or replace function public.pos_merge_table_orders(p_source_order_id bigint,p_target_order_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_source public.orders%rowtype;
  v_target public.orders%rowtype;
  v_open_day_id bigint;
  v_items_count integer;
  v_target_method text;
begin
  if v_uid is null or not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;
  if p_source_order_id is null or p_target_order_id is null or p_source_order_id=p_target_order_id then
    raise exception 'Choose two different active table orders';
  end if;
  perform pg_advisory_xact_lock(20261121);
  select id into v_open_day_id from public.business_days where status='open'
    order by opened_at desc limit 1 for share;
  if v_open_day_id is null then raise exception 'No open business day'; end if;
  select * into v_source from public.orders where id=p_source_order_id for update;
  if not found then raise exception 'Source order not found'; end if;
  select * into v_target from public.orders where id=p_target_order_id for update;
  if not found then raise exception 'Target order not found'; end if;
  if v_source.order_type<>'dine-in' or v_target.order_type<>'dine-in'
    or v_source.business_day_id<>v_open_day_id or v_target.business_day_id<>v_open_day_id
    or v_source.status in ('delivered','cancelled') or v_target.status in ('delivered','cancelled')
    or v_source.table_number is null or v_source.table_area is null
    or v_target.table_number is null or v_target.table_area is null then
    raise exception 'Both source and target must be active table orders';
  end if;
  if v_source.table_area=v_target.table_area and v_source.table_number=v_target.table_number then
    raise exception 'Source and target tables must be different';
  end if;
  select count(*) into v_items_count from public.order_items where order_id=p_source_order_id;
  if v_items_count=0 then raise exception 'Source order has no items to merge'; end if;
  update public.order_items set order_id=p_target_order_id where order_id=p_source_order_id;
  update public.pos_payments set order_id=p_target_order_id where order_id=p_source_order_id;
  update public.orders set total_amount=round(coalesce(v_target.total_amount,0)+coalesce(v_source.total_amount,0),2),
    discount_amount=round(coalesce(v_target.discount_amount,0)+coalesce(v_source.discount_amount,0),2)
    where id=p_target_order_id;
  select case when count(distinct method)=1 then min(method) when count(*)>1 then 'mixed' else 'cash' end
    into v_target_method from public.pos_payments where order_id=p_target_order_id;
  update public.orders set payment_method=v_target_method where id=p_target_order_id;
  update public.orders set status='cancelled',total_amount=0,discount_amount=0,
    cancellation_reason='تم دمج الأوردر في الطاولة '||v_target.table_number,
    cancelled_at=now(),cancelled_by=v_uid::text where id=p_source_order_id;
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(p_source_order_id,'table_order_merged_out',jsonb_build_object('target_order_id',p_target_order_id,
    'from_table_number',v_source.table_number,'from_table_area',v_source.table_area,
    'to_table_number',v_target.table_number,'to_table_area',v_target.table_area,
    'items_count',v_items_count,'amount_moved',v_source.total_amount,'discount_moved',v_source.discount_amount),v_uid);
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(p_target_order_id,'table_order_merged_in',jsonb_build_object('source_order_id',p_source_order_id,
    'from_table_number',v_source.table_number,'from_table_area',v_source.table_area,
    'items_count',v_items_count,'amount_added',v_source.total_amount,'discount_added',v_source.discount_amount),v_uid);
  return jsonb_build_object('source_order_id',p_source_order_id,'target_order_id',p_target_order_id,
    'items_count',v_items_count,'merged_total',v_target.total_amount+v_source.total_amount,
    'merged_discount',v_target.discount_amount+v_source.discount_amount);
end;
$$;

revoke execute on function public.pos_settle_and_close_cash(bigint,numeric) from public, anon;
revoke execute on function public.pos_merge_table_orders(bigint,bigint) from public, anon;
grant execute on function public.pos_settle_and_close_cash(bigint,numeric) to authenticated;
grant execute on function public.pos_merge_table_orders(bigint,bigint) to authenticated;
