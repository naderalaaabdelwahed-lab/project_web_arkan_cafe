-- Switch HR attendance and payroll to actual worked hours, without shift schedules.
alter table public.hr_attendance
  add column if not exists shortage_minutes integer not null default 0
  check (shortage_minutes >= 0);

-- The old cron job created absence rows from assigned shifts. Attendance is now recorded
-- from actual check-in/check-out events; absences are entered/reviewed by the manager.
do $$
declare v_job record;
begin
  if to_regclass('cron.job') is not null then
    for v_job in select jobid from cron.job where jobname='arkan-hr-pending-absences'
    loop
      perform cron.unschedule(v_job.jobid);
    end loop;
  end if;
end $$;

create or replace function public.hr_generate_pending_absences()
returns integer language sql security definer set search_path=public,pg_temp
as $$ select 0; $$;

create or replace function public.hr_create_payroll_run(
 p_period_start date,p_period_end date,p_created_by uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_run public.hr_payroll_runs%rowtype;
 v_emp public.hr_employees%rowtype;
 v_days integer;
 v_eligible_days integer;
 v_attended_days integer;
 v_paid_leave numeric:=4;
 v_overtime numeric;
 v_shortage numeric;
 v_net_hours numeric;
 v_deductions numeric;
 v_additions numeric;
 v_hour_rate numeric;
 v_hour_adjustment numeric;
 v_base numeric;
 v_net numeric;
 v_items integer:=0;
begin
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then
  raise exception 'فترة الرواتب غير صحيحة' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_period_start::text||':'||p_period_end::text,0));
 select * into v_run from public.hr_payroll_runs
 where period_start=p_period_start and period_end=p_period_end;
 if found then raise exception 'يوجد كشف رواتب لهذه الفترة بالفعل' using errcode='23505'; end if;

 insert into public.hr_payroll_runs(period_start,period_end,status,created_by)
 values(p_period_start,p_period_end,'draft',p_created_by) returning * into v_run;

 perform 1 from public.hr_payroll_adjustments
 where payroll_run_id is null and adjustment_date between p_period_start and p_period_end for update;

 v_days:=(p_period_end-p_period_start)+1;
 for v_emp in
  select * from public.hr_employees
  where employment_status='active' and hire_date<=p_period_end
  order by id
 loop
  select
   count(*) filter(where attendance_status='present' and check_in_at is not null),
   coalesce(sum(overtime_minutes),0),
   coalesce(sum(shortage_minutes),0)
  into v_attended_days,v_overtime,v_shortage
  from public.hr_attendance
  where employee_id=v_emp.id
    and shift_date between greatest(p_period_start,v_emp.hire_date) and p_period_end;

  select
   coalesce(sum(amount) filter(where adjustment_type='deduction'),0),
   coalesce(sum(amount) filter(where adjustment_type='addition'),0)
  into v_deductions,v_additions
  from public.hr_payroll_adjustments
  where employee_id=v_emp.id and payroll_run_id is null
    and adjustment_date between p_period_start and p_period_end;

  v_eligible_days:=greatest(0,least(v_days,(p_period_end-greatest(p_period_start,v_emp.hire_date))+1));
  v_paid_leave:=least(4,30);
  v_base:=round((coalesce(v_emp.monthly_salary,0) *
    least(30,coalesce(v_attended_days,0)+v_paid_leave)/30.0)::numeric,2);

  v_hour_rate:=coalesce(v_emp.monthly_salary,0) /
    (30.0 * greatest(1,coalesce(v_emp.daily_work_hours,8)));
  v_net_hours:=coalesce(v_overtime,0)-coalesce(v_shortage,0);
  v_hour_adjustment:=round((v_net_hours/60.0*v_hour_rate)::numeric,2);

  v_net:=greatest(0,v_base+v_hour_adjustment-coalesce(v_deductions,0)+coalesce(v_additions,0));

  insert into public.hr_payroll_items(
   payroll_run_id,employee_id,employee_name_snapshot,monthly_salary,overtime_amount,
   lateness_deduction,other_deductions,additions,paid_leave_days,net_salary,details
  ) values (
   v_run.id,v_emp.id,v_emp.full_name,v_base,v_hour_adjustment,
   0,coalesce(v_deductions,0),coalesce(v_additions,0),v_paid_leave,round(v_net,2),
   jsonb_build_object(
    'period_days',v_days,
    'eligible_days',v_eligible_days,
    'attended_days',coalesce(v_attended_days,0),
    'paid_leave_days',v_paid_leave,
    'daily_work_hours',v_emp.daily_work_hours,
    'hour_rate',round(v_hour_rate::numeric,4),
    'overtime_minutes',coalesce(v_overtime,0),
    'shortage_minutes',coalesce(v_shortage,0),
    'net_hours_minutes',v_net_hours,
    'hour_adjustment',v_hour_adjustment
   )
  );
  v_items:=v_items+1;
 end loop;

 update public.hr_payroll_adjustments set payroll_run_id=v_run.id
 where payroll_run_id is null and adjustment_date between p_period_start and p_period_end;

 return jsonb_build_object(
  'run',to_jsonb(v_run),
  'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.employee_name_snapshot),'[]'::jsonb)
   from public.hr_payroll_items i where i.payroll_run_id=v_run.id),
  'item_count',v_items
 );
end; $$;
