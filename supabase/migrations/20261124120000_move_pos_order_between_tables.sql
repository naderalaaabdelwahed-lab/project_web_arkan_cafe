-- Move an active dine-in POS order atomically to another configured table.
create or replace function public.move_pos_order_between_tables(
  p_order_id bigint,
  p_target_table_number integer,
  p_target_table_area text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_open_day_id bigint;
  v_table_count integer;
  v_source_area text;
  v_source_number integer;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;

  if p_target_table_area not in ('indoor', 'outdoor')
     or p_target_table_number is null
     or p_target_table_number < 1 then
    raise exception 'Invalid destination table';
  end if;

  -- Serialize table assignment changes against new POS orders and other transfers.
  perform pg_advisory_xact_lock(20261121);

  select id
    into v_open_day_id
  from public.business_days
  where status = 'open'
  order by opened_at desc
  limit 1
  for share;

  if v_open_day_id is null then
    raise exception 'No open business day';
  end if;

  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.order_type <> 'dine-in'
     or v_order.business_day_id <> v_open_day_id
     or v_order.status in ('delivered', 'cancelled')
     or v_order.table_number is null
     or v_order.table_area is null then
    raise exception 'Only an active dine-in order can be moved';
  end if;

  v_source_area := v_order.table_area;
  v_source_number := v_order.table_number;

  if v_source_area = p_target_table_area
     and v_source_number = p_target_table_number then
    raise exception 'Choose a different table';
  end if;

  select case
    when p_target_table_area = 'indoor' then indoor_tables
    else outdoor_tables
  end
  into v_table_count
  from public.restaurant_settings
  where id = 1;

  if p_target_table_number > coalesce(v_table_count, 0) then
    raise exception 'Destination table is outside the configured table count';
  end if;

  if exists (
    select 1
    from public.orders o
    where o.business_day_id = v_open_day_id
      and o.order_type = 'dine-in'
      and o.table_area = p_target_table_area
      and o.table_number = p_target_table_number
      and o.status not in ('delivered', 'cancelled')
      and o.id <> p_order_id
  ) then
    raise exception 'Destination table is already occupied';
  end if;

  if exists (
    select 1
    from public.reservations r
    where r.status in ('pending', 'confirmed')
      and r.reservation_date = (now() at time zone 'Africa/Cairo')::date
      and r.table_number = p_target_table_number
      and coalesce(r.seating_area, 'indoor') = p_target_table_area
  ) then
    raise exception 'Destination table is reserved today';
  end if;

  update public.orders
  set table_number = p_target_table_number,
      table_area = p_target_table_area
  where id = p_order_id;

  if v_order.reservation_id is not null then
    update public.reservations
    set table_number = p_target_table_number,
        seating_area = p_target_table_area
    where id = v_order.reservation_id;
  end if;

  insert into public.pos_audit_logs(order_id, action, details, actor_id)
  values (
    p_order_id,
    'table_transferred',
    jsonb_build_object(
      'from_table_number', v_source_number,
      'from_table_area', v_source_area,
      'to_table_number', p_target_table_number,
      'to_table_area', p_target_table_area
    ),
    v_uid
  );
end;
$$;

revoke all on function public.move_pos_order_between_tables(bigint, integer, text) from public;
revoke all on function public.move_pos_order_between_tables(bigint, integer, text) from anon;
grant execute on function public.move_pos_order_between_tables(bigint, integer, text) to authenticated;
