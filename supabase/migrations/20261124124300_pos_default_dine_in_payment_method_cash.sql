CREATE OR REPLACE FUNCTION public.create_pos_order(p_order_type text, p_items jsonb, p_table_number integer DEFAULT NULL::integer, p_table_area text DEFAULT NULL::text, p_customer_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_address text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_reservation_id bigint DEFAULT NULL::bigint, p_discount_type text DEFAULT 'amount'::text, p_discount_value numeric DEFAULT 0, p_payments jsonb DEFAULT '[]'::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid(); v_day_id bigint; v_order_id bigint; v_item jsonb;
  v_product record; v_qty integer; v_subtotal numeric(10,2):=0;
  v_discount numeric(10,2):=0; v_total numeric(10,2); v_payment_total numeric(10,2):=0;
  v_method text; v_tables integer; v_payment jsonb;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  if not (public.is_admin() or public.has_permission('pos.use')) then raise exception 'POS permission required'; end if;
  if p_order_type not in ('dine-in','takeaway','delivery') then raise exception 'Invalid order type'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Add at least one item'; end if;
  if p_discount_type not in ('amount','percent') or coalesce(p_discount_value,0)<0 then raise exception 'Invalid discount'; end if;
  perform pg_advisory_xact_lock_shared(20261121);
  select id into v_day_id from public.business_days where status='open' order by opened_at desc limit 1 for share;
  if v_day_id is null then raise exception 'No open business day'; end if;
  if p_order_type='dine-in' then
    if p_table_number is null or p_table_area not in ('indoor','outdoor') then raise exception 'Choose a dining table'; end if;
    select case when p_table_area='indoor' then indoor_tables else outdoor_tables end into v_tables from public.restaurant_settings where id=1;
    if p_table_number<1 or p_table_number>coalesce(v_tables,0) then raise exception 'Table number is outside the configured table count'; end if;
    if exists(select 1 from public.orders o where o.business_day_id=v_day_id and o.order_type='dine-in' and o.table_area=p_table_area and o.table_number=p_table_number and o.status not in ('delivered','cancelled')) then raise exception 'This table already has an active order'; end if;
  else p_table_number:=null; p_table_area:=null; end if;
  if p_reservation_id is not null and not exists(select 1 from public.reservations r where r.id=p_reservation_id and r.status in ('pending','confirmed')) then raise exception 'Reservation is no longer active'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    if coalesce((v_item->>'quantity')::integer,0)<1 then raise exception 'Invalid item quantity'; end if;
    select id,name,price into v_product from public.products where id=(v_item->>'product_id')::bigint and is_available=true;
    if not found then raise exception 'A selected product is unavailable'; end if;
    v_subtotal:=v_subtotal+v_product.price*(v_item->>'quantity')::integer;
  end loop;
  if p_discount_type='percent' then
    if p_discount_value>100 then raise exception 'Discount cannot exceed 100 percent'; end if;
    v_discount:=round(v_subtotal*p_discount_value/100,2);
  else v_discount:=round(p_discount_value,2); end if;
  if v_discount>v_subtotal then raise exception 'Discount cannot exceed subtotal'; end if;
  v_total:=v_subtotal-v_discount;
  if jsonb_typeof(coalesce(p_payments,'[]'::jsonb))<>'array' then raise exception 'Invalid payments'; end if;
  for v_payment in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    if v_payment->>'method' not in ('cash','card','online') or coalesce((v_payment->>'amount')::numeric,0)<=0 then raise exception 'Invalid payment line'; end if;
    v_payment_total:=v_payment_total+(v_payment->>'amount')::numeric;
  end loop;
  if p_order_type='dine-in' then
    if v_payment_total>v_total then raise exception 'Payment cannot exceed order total'; end if;
  elsif abs(v_payment_total-v_total)>0.01 then raise exception 'Payment total must equal order total'; end if;
  select case when count(distinct value->>'method')=0 then 'cash' when count(distinct value->>'method')=1 then min(value->>'method') else 'mixed' end into v_method from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb));
  if v_method is null then v_method:='cash'; end if;
  insert into public.orders(customer_name,phone,address,notes,total_amount,status,order_type,payment_method,delivery_fee,reservation_id,business_day_id,table_number,table_area,discount_amount,pos_created_by)
  values(coalesce(nullif(trim(p_customer_name),''),'عميل نقدي'),coalesce(nullif(trim(p_phone),''),'غير مسجل'),nullif(trim(p_address),''),nullif(trim(p_notes),''),v_total,'pending',p_order_type,v_method,0,p_reservation_id,v_day_id,p_table_number,p_table_area,v_discount,v_uid)
  returning id into v_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select id,name,price into v_product from public.products where id=(v_item->>'product_id')::bigint and is_available=true;
    v_qty:=(v_item->>'quantity')::integer;
    insert into public.order_items(order_id,product_id,product_name,quantity,unit_price,subtotal,item_note)
    values(v_order_id,v_product.id,v_product.name,v_qty,v_product.price,v_product.price*v_qty,nullif(trim(v_item->>'note'),''));
  end loop;
  for v_payment in select value from jsonb_array_elements(coalesce(p_payments,'[]'::jsonb)) loop
    insert into public.pos_payments(order_id,method,amount,created_by) values(v_order_id,v_payment->>'method',(v_payment->>'amount')::numeric,v_uid);
  end loop;
  if p_reservation_id is not null and p_order_type='dine-in' then
    update public.reservations set status='completed',table_number=p_table_number where id=p_reservation_id;
  end if;
  insert into public.pos_audit_logs(order_id,action,details,actor_id)
  values(v_order_id,'order_created',jsonb_build_object('order_type',p_order_type,'table_number',p_table_number,'table_area',p_table_area,'subtotal',v_subtotal,'discount',v_discount,'total',v_total),v_uid);
  return v_order_id;
end;
$function$

