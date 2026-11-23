alter table public.hr_shifts
  add column if not exists is_flexible boolean not null default false,
  add column if not exists latest_check_in time;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'hr_shifts_flexible_cutoff_check'
      and conrelid = 'public.hr_shifts'::regclass
  ) then
    alter table public.hr_shifts
      add constraint hr_shifts_flexible_cutoff_check
      check (not is_flexible or latest_check_in is not null);
  end if;
end $$;

create or replace function public.hr_generate_pending_absences()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer := 0;
begin
  insert into public.hr_attendance(employee_id,shift_date,attendance_status)
  select e.id,calendar.shift_date,'absent_pending'
  from public.hr_employees e
  join public.hr_employee_shift_assignments a on a.employee_id=e.id
  join public.hr_shifts s on s.id=a.shift_id and s.is_active=true
  cross join lateral generate_series(
    (now() at time zone 'Africa/Cairo')::date - 7,
    (now() at time zone 'Africa/Cairo')::date,
    interval '1 day'
  ) as dates(shift_day)
  cross join lateral (select dates.shift_day::date as shift_date) calendar
  where e.employment_status='active'
    and a.effective_from <= calendar.shift_date
    and (a.effective_to is null or a.effective_to >= calendar.shift_date)
    and (a.weekday is null or a.weekday=extract(dow from calendar.shift_date)::integer)
    and (
      (
        case
          when s.is_flexible and s.latest_check_in is not null then
            ((calendar.shift_date::timestamp + s.latest_check_in) at time zone 'Africa/Cairo')
            + (s.end_time - s.start_time)
            + case when s.crosses_midnight then interval '1 day' else interval '0' end
          else
            ((calendar.shift_date::timestamp + s.end_time) at time zone 'Africa/Cairo')
            + case when s.crosses_midnight then interval '1 day' else interval '0' end
        end
      ) + make_interval(mins => coalesce(s.grace_minutes,0))
    ) < now()
  on conflict(employee_id,shift_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.hr_generate_pending_absences() from public,anon,authenticated;
grant execute on function public.hr_generate_pending_absences() to service_role;
