create or replace function public.transfer_pos_order_items(
  p_source_order_id bigint,
  p_target_table_number integer,
  p_target_table_area text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_source public.orders%rowtype;
  v_target public.orders%rowtype;
  v_line public.order_items%rowtype;
  v_payment public.pos_payments%rowtype;
  v_open_day_id bigint;
  v_table_count integer;
  v_target_count integer;
  v_target_order_id bigint;
  v_target_created boolean := false;
  v_source_items_subtotal numeric(12,2) := 0;
  v_moved_subtotal numeric(12,2) := 0;
  v_discount_share numeric(12,2) := 0;
  v_net_amount numeric(12,2) := 0;
  v_paid_total numeric(12,2) := 0;
  v_paid_to_move numeric(12,2) := 0;
  v_payment_remaining numeric(12,2) := 0;
  v_payment_move numeric(12,2) := 0;
  v_payment_count integer := 0;
  v_payment_index integer := 0;
  v_qty integer;
  v_item jsonb;
  v_moved_count integer := 0;
  v_method text;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  if not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;

  if p_target_table_area is null
     or p_target_table_area not in ('indoor', 'outdoor')
     or p_target_table_number is null
     or p_target_table_number < 1 then
    raise exception 'Invalid destination table';
  end if;

  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one item to transfer';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) e
    where coalesce((e->>'order_item_id')::bigint, 0) < 1
       or coalesce((e->>'quantity')::integer, 0) < 1
  ) then
    raise exception 'Invalid item selection';
  end if;

  if (
    select count(*) from jsonb_array_elements(p_items)
  ) <> (
    select count(distinct (e->>'order_item_id')::bigint)
    from jsonb_array_elements(p_items) e
  ) then
    raise exception 'The same order item cannot be selected more than once';
  end if;

  -- Serialize transfers with table assignment and order creation operations.
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
    into v_source
  from public.orders
  where id = p_source_order_id
  for update;

  if not found then
    raise exception 'Source order not found';
  end if;

  if v_source.order_type <> 'dine-in'
     or v_source.business_day_id <> v_open_day_id
     or v_source.status in ('delivered', 'cancelled')
     or v_source.table_number is null
     or v_source.table_area is null then
    raise exception 'Only an active dine-in order can transfer items';
  end if;

  if v_source.table_area = p_target_table_area
     and v_source.table_number = p_target_table_number then
    raise exception 'Choose a different destination table';
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

  select count(*)
    into v_target_count
  from public.orders o
  where o.business_day_id = v_open_day_id
    and o.order_type = 'dine-in'
    and o.table_area = p_target_table_area
    and o.table_number = p_target_table_number
    and o.status not in ('delivered', 'cancelled');

  if v_target_count > 1 then
    raise exception 'Destination table has more than one active order; resolve it first';
  end if;

  if v_target_count = 1 then
    select *
      into v_target
    from public.orders o
    where o.business_day_id = v_open_day_id
      and o.order_type = 'dine-in'
      and o.table_area = p_target_table_area
      and o.table_number = p_target_table_number
      and o.status not in ('delivered', 'cancelled')
    for update;

    v_target_order_id := v_target.id;
  else
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

    insert into public.orders (
      customer_name, phone, notes, total_amount, status, order_type,
      payment_method, delivery_fee, business_day_id, table_number,
      table_area, discount_amount, pos_created_by
    )
    values (
      coalesce(nullif(trim(v_source.customer_name), ''), 'عميل نقدي'),
      coalesce(nullif(trim(v_source.phone), ''), 'غير مسجل'),
      null,
      0,
      'pending',
      'dine-in',
      'cash',
      0,
      v_open_day_id,
      p_target_table_number,
      p_target_table_area,
      0,
      v_uid
    )
    returning id into v_target_order_id;

    v_target_created := true;
  end if;

  select coalesce(sum(oi.subtotal), 0)
    into v_source_items_subtotal
  from public.order_items oi
  where oi.order_id = p_source_order_id;

  if v_source_items_subtotal <= 0 then
    raise exception 'Source order has no transferable items';
  end if;

  -- Validate and lock every selected line before changing either order.
  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    select *
      into v_line
    from public.order_items oi
    where oi.id = (v_item->>'order_item_id')::bigint
      and oi.order_id = p_source_order_id
    for update;

    if not found then
      raise exception 'A selected item does not belong to the source order';
    end if;

    v_qty := (v_item->>'quantity')::integer;

    if v_qty > v_line.quantity then
      raise exception 'Selected quantity exceeds the item quantity';
    end if;

    if v_line.preparation_status <> 'pending' then
      raise exception 'Only items that have not started preparation can be transferred';
    end if;

    v_moved_subtotal := v_moved_subtotal + (v_line.unit_price * v_qty);
    v_moved_count := v_moved_count + 1;
  end loop;

  if v_moved_subtotal >= v_source_items_subtotal then
    v_discount_share := v_source.discount_amount;
  else
    v_discount_share := least(
      v_source.discount_amount,
      round(v_source.discount_amount * v_moved_subtotal / v_source_items_subtotal, 2)
    );
  end if;

  v_net_amount := greatest(0, v_moved_subtotal - v_discount_share);

  if v_source.total_amount + 0.01 < v_net_amount then
    raise exception 'Transfer value exceeds the source order balance';
  end if;

  select coalesce(sum(pp.amount), 0), count(*)
    into v_paid_total, v_payment_count
  from public.pos_payments pp
  where pp.order_id = p_source_order_id;

  if v_moved_subtotal >= v_source_items_subtotal then
    v_paid_to_move := v_paid_total;
  elsif v_source.total_amount > 0 then
    v_paid_to_move := least(
      v_net_amount,
      round(v_paid_total * v_net_amount / v_source.total_amount, 2)
    );
  else
    v_paid_to_move := 0;
  end if;

  -- Move full lines, or split a line while preserving its price, note and station.
  for v_item in
    select value from jsonb_array_elements(p_items)
  loop
    select *
      into v_line
    from public.order_items oi
    where oi.id = (v_item->>'order_item_id')::bigint
      and oi.order_id = p_source_order_id
    for update;

    v_qty := (v_item->>'quantity')::integer;

    if v_qty = v_line.quantity then
      update public.order_items
      set order_id = v_target_order_id
      where id = v_line.id;
    else
      update public.order_items
      set quantity = quantity - v_qty,
          subtotal = unit_price * (quantity - v_qty)
      where id = v_line.id;

      insert into public.order_items (
        order_id, product_id, product_name, quantity, unit_price, subtotal,
        preparation_station, preparation_status, preparation_started_at,
        prepared_at, preparation_note, item_note
      )
      values (
        v_target_order_id, v_line.product_id, v_line.product_name, v_qty,
        v_line.unit_price, v_line.unit_price * v_qty,
        v_line.preparation_station, 'pending', now(),
        null, v_line.preparation_note, v_line.item_note
      );
    end if;
  end loop;

  update public.orders
  set total_amount = greatest(0, total_amount - v_net_amount),
      discount_amount = greatest(0, discount_amount - v_discount_share)
  where id = p_source_order_id;

  update public.orders
  set total_amount = total_amount + v_net_amount,
      discount_amount = discount_amount + v_discount_share
  where id = v_target_order_id;

  -- Reallocate the paid portion with the transferred items so neither bill
  -- becomes overpaid merely because its lines moved to another table.
  if v_paid_to_move > 0 and v_paid_total > 0 then
    v_payment_remaining := v_paid_to_move;
    v_payment_index := 0;

    for v_payment in
      select *
      from public.pos_payments pp
      where pp.order_id = p_source_order_id
      order by pp.id
      for update
    loop
      v_payment_index := v_payment_index + 1;

      if v_payment_index = v_payment_count then
        v_payment_move := least(v_payment.amount, v_payment_remaining);
      else
        v_payment_move := least(
          v_payment.amount,
          round(v_payment.amount * v_paid_to_move / v_paid_total, 2)
        );
      end if;

      v_payment_remaining := greatest(0, v_payment_remaining - v_payment_move);

      if v_payment_move > 0 then
        if v_payment.amount <= v_payment_move then
          delete from public.pos_payments where id = v_payment.id;
        else
          update public.pos_payments
          set amount = amount - v_payment_move
          where id = v_payment.id;
        end if;

        insert into public.pos_payments (
          order_id, method, amount, created_by, created_at
        )
        values (
          v_target_order_id, v_payment.method, v_payment_move,
          v_payment.created_by, v_payment.created_at
        );
      end if;
    end loop;
  end if;

  select case
    when count(distinct pp.method) = 1 then min(pp.method)
    when count(*) > 1 then 'mixed'
    else 'cash'
  end
    into v_method
  from public.pos_payments pp
  where pp.order_id = p_source_order_id;

  update public.orders
  set payment_method = v_method
  where id = p_source_order_id;

  select case
    when count(distinct pp.method) = 1 then min(pp.method)
    when count(*) > 1 then 'mixed'
    else 'cash'
  end
    into v_method
  from public.pos_payments pp
  where pp.order_id = v_target_order_id;

  update public.orders
  set payment_method = v_method
  where id = v_target_order_id;

  if not exists (
    select 1 from public.order_items oi where oi.order_id = p_source_order_id
  ) then
    update public.orders
    set status = 'cancelled',
        total_amount = 0,
        discount_amount = 0,
        cancellation_reason = 'تم نقل جميع الأصناف إلى طاولة أخرى',
        cancelled_at = now(),
        cancelled_by = v_uid::text
    where id = p_source_order_id;
  end if;

  insert into public.pos_audit_logs(order_id, action, details, actor_id)
  values (
    p_source_order_id,
    'items_transferred_out',
    jsonb_build_object(
      'target_order_id', v_target_order_id,
      'target_table_number', p_target_table_number,
      'target_table_area', p_target_table_area,
      'items', p_items,
      'moved_subtotal', v_moved_subtotal,
      'discount_moved', v_discount_share,
      'net_amount_moved', v_net_amount,
      'payment_moved', v_paid_to_move
    ),
    v_uid
  );

  insert into public.pos_audit_logs(order_id, action, details, actor_id)
  values (
    v_target_order_id,
    'items_transferred_in',
    jsonb_build_object(
      'source_order_id', p_source_order_id,
      'source_table_number', v_source.table_number,
      'source_table_area', v_source.table_area,
      'items', p_items,
      'moved_subtotal', v_moved_subtotal,
      'discount_moved', v_discount_share,
      'net_amount_moved', v_net_amount,
      'payment_moved', v_paid_to_move,
      'target_order_created', v_target_created
    ),
    v_uid
  );

  return jsonb_build_object(
    'source_order_id', p_source_order_id,
    'target_order_id', v_target_order_id,
    'target_created', v_target_created,
    'moved_items_count', v_moved_count,
    'moved_subtotal', v_moved_subtotal,
    'discount_moved', v_discount_share,
    'net_amount_moved', v_net_amount,
    'payment_moved', v_paid_to_move
  );
end;
$$;

revoke all on function public.transfer_pos_order_items(bigint, integer, text, jsonb) from public;
revoke all on function public.transfer_pos_order_items(bigint, integer, text, jsonb) from anon;
grant execute on function public.transfer_pos_order_items(bigint, integer, text, jsonb) to authenticated;
