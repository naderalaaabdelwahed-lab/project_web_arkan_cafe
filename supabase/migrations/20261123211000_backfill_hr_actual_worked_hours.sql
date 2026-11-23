-- Backfill historical completed records to actual-hours attendance rules.
update public.hr_attendance a
set worked_minutes = greatest(0, round(extract(epoch from (a.check_out_at - a.check_in_at)) / 60.0)::integer),
    overtime_minutes = greatest(0,
      greatest(0, round(extract(epoch from (a.check_out_at - a.check_in_at)) / 60.0)::integer)
      - round(coalesce(e.daily_work_hours, 8) * 60)::integer),
    shortage_minutes = greatest(0,
      round(coalesce(e.daily_work_hours, 8) * 60)::integer
      - greatest(0, round(extract(epoch from (a.check_out_at - a.check_in_at)) / 60.0)::integer)),
    late_minutes = 0,
    updated_at = now()
from public.hr_employees e
where e.id = a.employee_id
  and a.check_in_at is not null
  and a.check_out_at is not null;
