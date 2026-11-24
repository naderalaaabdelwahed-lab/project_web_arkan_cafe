create or replace function public.hr_skip_previous_checkout_and_check_in(
  p_employee_id uuid,
  p_shift_date date,
  p_check_in_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_open public.hr_attendance%rowtype;
  v_today public.hr_attendance%rowtype;
begin
  if p_employee_id is null or p_shift_date is null or p_check_in_at is null then
    raise exception 'بيانات تسجيل الحضور غير مكتملة' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_employee_id::text, 0));

  select * into v_today
  from public.hr_attendance
  where employee_id = p_employee_id and shift_date = p_shift_date
  for update;

  if found and v_today.check_in_at is not null then
    raise exception 'تم تسجيل حضور الموظف لهذا اليوم بالفعل' using errcode = '23505';
  end if;

  select * into v_open
  from public.hr_attendance
  where employee_id = p_employee_id
    and shift_date < p_shift_date
    and check_in_at is not null
    and check_out_at is null
    and checkout_skipped_at is null
  order by shift_date desc, check_in_at desc
  limit 1
  for update;

  if not found then
    raise exception 'لا يوجد حضور سابق مفتوح يحتاج إلى التجاوز' using errcode = 'P0002';
  end if;

  update public.hr_attendance
  set checkout_skipped_at = p_check_in_at,
      notes = left(concat_ws(E'\n', nullif(notes, ''), 'تم تجاوز تسجيل الانصراف دون إنشاء وقت انصراف وهمي عند بدء يوم عمل جديد'), 1000),
      updated_at = p_check_in_at
  where id = v_open.id;

  if v_today.id is not null then
    update public.hr_attendance
    set check_in_at = p_check_in_at,
        check_in_method = 'pin',
        attendance_status = 'present',
        late_minutes = 0,
        worked_minutes = 0,
        overtime_minutes = 0,
        shortage_minutes = 0,
        checkout_skipped_at = null,
        updated_at = p_check_in_at
    where id = v_today.id
    returning * into v_today;
  else
    insert into public.hr_attendance (
      employee_id, shift_date, check_in_at, check_in_method,
      attendance_status, late_minutes, updated_at
    ) values (
      p_employee_id, p_shift_date, p_check_in_at, 'pin',
      'present', 0, p_check_in_at
    ) returning * into v_today;
  end if;

  return jsonb_build_object(
    'skipped_shift_date', v_open.shift_date,
    'attendance', to_jsonb(v_today)
  );
end;
$$;

revoke all on function public.hr_skip_previous_checkout_and_check_in(uuid, date, timestamptz)
  from public, anon, authenticated;
grant execute on function public.hr_skip_previous_checkout_and_check_in(uuid, date, timestamptz)
  to service_role;
