-- Allow appending items to any open POS order type (dine-in, takeaway, delivery).
create or replace function public.append_pos_order_items(
  p_order_id bigint,
  p_items jsonb
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order public.orders%rowtype;
  v_item jsonb;
  v_product record;
  v_qty integer;
  v_added numeric(10,2) := 0;
  v_new_total numeric(10,2);
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.is_admin() or public.has_permission('pos.use')) then
    raise exception 'POS permission required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one new item';
  end if;

  perform pg_advisory_xact_lock_shared(20261121);
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'This order is already closed';
  end if;
  if not exists (
    select 1 from public.business_days bd
    where bd.id = v_order.business_day_id and bd.status = 'open'
  ) then raise exception 'The business day for this order is not open'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty < 1 then raise exception 'Invalid item quantity'; end if;
    select p.id, p.name, p.price into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::bigint and p.is_available = true;
    if not found then raise exception 'A selected product is unavailable'; end if;
    v_added := v_added + (v_product.price * v_qty);
  end loop;

  for v_item in select value from jsonb_array_elements(p_items) loop
    select p.id, p.name, p.price into v_product
    from public.products p
    where p.id = (v_item->>'product_id')::bigint and p.is_available = true;
    v_qty := (v_item->>'quantity')::integer;
    insert into public.order_items (
      order_id, product_id, product_name, quantity, unit_price, subtotal, item_note
    ) values (
      p_order_id, v_product.id, v_product.name, v_qty, v_product.price,
      v_product.price * v_qty, nullif(trim(v_item->>'note'), '')
    );
  end loop;

  update public.orders set total_amount = total_amount + v_added
  where id = p_order_id returning total_amount into v_new_total;

  insert into public.pos_audit_logs(order_id, action, details, actor_id)
  values (
    p_order_id, 'items_added',
    jsonb_build_object('added_amount', v_added, 'new_total', v_new_total, 'items', p_items),
    v_uid
  );
  return v_new_total;
end;
$$;

revoke all on function public.append_pos_order_items(bigint, jsonb) from public;
revoke all on function public.append_pos_order_items(bigint, jsonb) from anon;
grant execute on function public.append_pos_order_items(bigint, jsonb) to authenticated;