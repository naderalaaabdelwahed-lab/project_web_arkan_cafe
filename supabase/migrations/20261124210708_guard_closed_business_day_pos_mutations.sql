-- Prevent closed-day POS mutations and block closing while any orders remain active.
DO $migration$
DECLARE v_definition text; v_updated text;
BEGIN

  select replace(pg_get_functiondef('public.pos_empty_table_order(bigint,text)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, '  if not found then raise exception ''Order not found''; end if;', '  if not found then raise exception ''Order not found''; end if;
  perform pg_advisory_xact_lock_shared(20261121);
  if not exists (select 1 from public.business_days bd where bd.id=v_order.business_day_id and bd.status=''open'') then
    raise exception ''لا يمكن تعديل أوردر تابع ليومية مغلقة.'';
  end if;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 1, 'public.pos_empty_table_order(bigint,text)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.pos_remove_pending_order_item(bigint)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, '  if not found then raise exception ''Order not found''; end if;', '  if not found then raise exception ''Order not found''; end if;
  perform pg_advisory_xact_lock_shared(20261121);
  if not exists (select 1 from public.business_days bd where bd.id=v_order.business_day_id and bd.status=''open'') then
    raise exception ''لا يمكن تعديل أوردر تابع ليومية مغلقة.'';
  end if;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 2, 'public.pos_remove_pending_order_item(bigint)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.pos_remove_pending_order_item_quantity(bigint,integer)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, '  if not found then raise exception ''Order not found''; end if;', '  if not found then raise exception ''Order not found''; end if;
  perform pg_advisory_xact_lock_shared(20261121);
  if not exists (select 1 from public.business_days bd where bd.id=v_order.business_day_id and bd.status=''open'') then
    raise exception ''لا يمكن تعديل أوردر تابع ليومية مغلقة.'';
  end if;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 3, 'public.pos_remove_pending_order_item_quantity(bigint,integer)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.pos_record_cash_payment(bigint,numeric)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, ' if not found then raise exception ''Order not found''; end if;', ' if not found then raise exception ''Order not found''; end if;
 perform pg_advisory_xact_lock_shared(20261121);
 if not exists(select 1 from public.business_days bd where bd.id=v_order.business_day_id and bd.status=''open'') then raise exception ''لا يمكن تعديل أوردر تابع ليومية مغلقة.''; end if;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 4, 'public.pos_record_cash_payment(bigint,numeric)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.pos_update_order_discount(bigint,text,numeric)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, ' select * into v_order from public.orders where id=p_order_id for update;', ' perform pg_advisory_xact_lock_shared(20261121);
 select * into v_order from public.orders where id=p_order_id for update;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 5, 'public.pos_update_order_discount(bigint,text,numeric)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.pos_settle_and_close_cash(bigint,numeric)'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, '  select * into v_order from public.orders where id = p_order_id for update;', '  perform pg_advisory_xact_lock_shared(20261121);
  select * into v_order from public.orders where id = p_order_id for update;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 6, 'public.pos_settle_and_close_cash(bigint,numeric)'; end if;
  execute v_updated;

  select replace(pg_get_functiondef('public.close_business_day()'::regprocedure), chr(13)||chr(10), chr(10)) into v_definition;
  v_updated := replace(v_definition, '    IF NOT FOUND THEN
        RAISE EXCEPTION ''No open business day found'';
    END IF;', '    IF NOT FOUND THEN
        RAISE EXCEPTION ''No open business day found'';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.business_day_id = v_day.id
          AND o.status NOT IN (''delivered'', ''cancelled'')
    ) THEN
        RAISE EXCEPTION ''لا يمكن إنهاء اليومية قبل إنهاء أو إلغاء جميع الأوردرات المفتوحة.'';
    END IF;');
  if v_updated = v_definition then raise exception 'Migration patch % did not match function %', 7, 'public.close_business_day()'; end if;
  execute v_updated;
END;
$migration$;
