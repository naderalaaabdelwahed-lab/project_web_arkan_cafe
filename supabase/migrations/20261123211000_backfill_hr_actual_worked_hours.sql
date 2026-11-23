-- Backfill historical completed records to actual-hours attendance rules.
-- Recalculate existing completed attendance records using actual elapsed time.
update public.hr_attendance a
set worked_minutes = calc.worked_minutes,
    overtime_minutes = greatest(0, calc.worked_minutes - calc.planned_minutes),
    shortage_minutes = greatest(0, calc.planned_minutes - calc.worked_minutes),
    late_minutes = 0,
    updated_at = now()
from public.hr_employees e
cross join lateral (
  select
    greatest(0, round(extract(epoch from (a.check_out_at - a.check_in_at)) / 60.0)::integer) as worked_minutes,
    round(coalesce(e.daily_work_hours, 8) * 60)::integer as planned_minutes
) calc
where e.id = a.employee_id
  and a.check_in_at is not null
  and a.check_out_at is not null;
