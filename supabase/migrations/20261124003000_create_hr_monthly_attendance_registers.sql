create table if not exists public.hr_attendance_monthly_registers (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 month_start date not null,
 month_end date not null,
 created_at timestamptz not null default now(),
 constraint hr_attendance_monthly_registers_month_bounds_check
   check (month_end = (date_trunc('month', month_start)::date + interval '1 month - 1 day')::date),
 constraint hr_attendance_monthly_registers_employee_month_key unique(employee_id, month_start)
);

alter table public.hr_attendance_monthly_registers enable row level security;
revoke all on public.hr_attendance_monthly_registers from public, anon, authenticated;
grant all on public.hr_attendance_monthly_registers to service_role;

alter table public.hr_attendance
 add column if not exists monthly_register_id uuid
 references public.hr_attendance_monthly_registers(id) on delete restrict;

create or replace function app_private.hr_ensure_monthly_attendance_register(p_employee_id uuid,p_date date)
returns uuid language plpgsql security definer set search_path=public,app_private,pg_temp
as $$
declare v_start date; v_end date; v_id uuid;
begin
 v_start:=date_trunc('month',p_date)::date;
 v_end:=(v_start + interval '1 month - 1 day')::date;
 insert into public.hr_attendance_monthly_registers(employee_id,month_start,month_end)
 values(p_employee_id,v_start,v_end)
 on conflict(employee_id,month_start) do update set month_end=excluded.month_end
 returning id into v_id;
 return v_id;
end;
$$;
revoke all on function app_private.hr_ensure_monthly_attendance_register(uuid,date) from public,anon,authenticated;
grant execute on function app_private.hr_ensure_monthly_attendance_register(uuid,date) to service_role;

create or replace function app_private.hr_attach_monthly_register_to_attendance()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp
as $$
begin
 new.monthly_register_id:=app_private.hr_ensure_monthly_attendance_register(new.employee_id,new.shift_date);
 return new;
end;
$$;
revoke all on function app_private.hr_attach_monthly_register_to_attendance() from public,anon,authenticated;
drop trigger if exists trg_hr_attach_monthly_register on public.hr_attendance;
create trigger trg_hr_attach_monthly_register
before insert or update of employee_id,shift_date on public.hr_attendance
for each row execute function app_private.hr_attach_monthly_register_to_attendance();

create or replace function app_private.hr_create_monthly_attendance_registers()
returns integer language plpgsql security definer set search_path=public,app_private,pg_temp
as $$
declare v_today date; v_count integer;
begin
 v_today:=(now() at time zone 'Africa/Cairo')::date;
 insert into public.hr_attendance_monthly_registers(employee_id,month_start,month_end)
 select e.id,date_trunc('month',v_today)::date,
        (date_trunc('month',v_today)::date + interval '1 month - 1 day')::date
 from public.hr_employees e
 where e.employment_status='active' and e.hire_date<=v_today
 on conflict(employee_id,month_start) do nothing;
 get diagnostics v_count=row_count;
 return v_count;
end;
$$;
revoke all on function app_private.hr_create_monthly_attendance_registers() from public,anon,authenticated;
grant execute on function app_private.hr_create_monthly_attendance_registers() to service_role;

create or replace function app_private.hr_create_register_after_employee_insert()
returns trigger language plpgsql security definer set search_path=public,app_private,pg_temp
as $$
declare v_today date;
begin
 v_today:=(now() at time zone 'Africa/Cairo')::date;
 if new.employment_status='active' and new.hire_date<=v_today then
  perform app_private.hr_ensure_monthly_attendance_register(new.id,v_today);
 end if;
 return new;
end;
$$;
revoke all on function app_private.hr_create_register_after_employee_insert() from public,anon,authenticated;
drop trigger if exists trg_hr_create_register_after_employee_insert on public.hr_employees;
create trigger trg_hr_create_register_after_employee_insert
after insert on public.hr_employees
for each row execute function app_private.hr_create_register_after_employee_insert();

insert into public.hr_attendance_monthly_registers(employee_id,month_start,month_end)
select e.id,months.month_start,(months.month_start + interval '1 month - 1 day')::date
from public.hr_employees e
cross join lateral generate_series(
 date_trunc('month',least(e.hire_date,coalesce((select min(a.shift_date) from public.hr_attendance a where a.employee_id=e.id),e.hire_date)))::date,
 date_trunc('month',(now() at time zone 'Africa/Cairo')::date)::date,
 interval '1 month'
) as months(month_start)
on conflict(employee_id,month_start) do nothing;

update public.hr_attendance a
set monthly_register_id=app_private.hr_ensure_monthly_attendance_register(a.employee_id,a.shift_date)
where a.monthly_register_id is null;

do $
declare v_job record;
begin
 if to_regclass('cron.job') is not null then
  for v_job in select jobid from cron.job where jobname='arkan-hr-monthly-attendance-registers'
  loop
   perform cron.unschedule(v_job.jobid);
  end loop;
 end if;
end $;

select cron.schedule(
 'arkan-hr-monthly-attendance-registers',
 '0 0 1 * *',
 'select app_private.hr_create_monthly_attendance_registers();'
);
