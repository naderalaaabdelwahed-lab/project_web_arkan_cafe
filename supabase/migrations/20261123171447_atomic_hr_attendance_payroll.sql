alter table public.hr_payroll_adjustments
  add column if not exists payroll_run_id uuid references public.hr_payroll_runs(id) on delete restrict;
create unique index if not exists hr_payroll_runs_period_unique on public.hr_payroll_runs(period_start,period_end);
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
grant usage on schema app_private to service_role;

create or replace function app_private.hr_review_attendance(
 p_attendance_id uuid,p_employee_id uuid,p_shift_date date,p_status text,p_notes text,p_reviewed_by uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_att public.hr_attendance%rowtype; v_employee public.hr_employees%rowtype;
 v_old_status text; v_delta integer:=0; v_allocated numeric(6,2); v_balance public.hr_leave_balances%rowtype;
begin
 if p_status not in ('present','absent','paid_leave','unpaid_leave','excused','holiday') then
  raise exception 'حالة الحضور غير صحيحة' using errcode='22023';
 end if;
 if p_attendance_id is not null then
  select * into v_att from public.hr_attendance where id=p_attendance_id for update;
 elsif p_employee_id is not null and p_shift_date is not null then
  select * into v_att from public.hr_attendance where employee_id=p_employee_id and shift_date=p_shift_date for update;
 else
  raise exception 'يجب تحديد سجل الحضور أو الموظف والتاريخ' using errcode='22023';
 end if;
 if found then
  v_old_status:=v_att.attendance_status; p_employee_id:=v_att.employee_id; p_shift_date:=v_att.shift_date;
 else
  select * into v_employee from public.hr_employees where id=p_employee_id and employment_status='active';
  if not found then raise exception 'الموظف غير موجود أو غير نشط' using errcode='P0002'; end if;
  v_old_status:=null;
  insert into public.hr_attendance(employee_id,shift_date,attendance_status,notes,reviewed_by,reviewed_at)
  values(p_employee_id,p_shift_date,p_status,nullif(left(coalesce(p_notes,''),1000),''),p_reviewed_by,now())
  returning * into v_att;
 end if;
 if v_old_status is distinct from p_status then
  if p_status='paid_leave' then v_delta:=1; end if;
  if v_old_status='paid_leave' then v_delta:=v_delta-1; end if;
 end if;
 if v_delta<>0 then
  select * into v_employee from public.hr_employees where id=p_employee_id;
  v_allocated:=coalesce(v_employee.paid_leave_days,0);
  if v_delta>0 then
   insert into public.hr_leave_balances(employee_id,leave_year,allocated_days,used_days,updated_at)
   values(p_employee_id,extract(year from p_shift_date)::integer,v_allocated,1,now())
   on conflict(employee_id,leave_year) do update
    set used_days=public.hr_leave_balances.used_days+1,updated_at=now()
    where public.hr_leave_balances.used_days+1<=public.hr_leave_balances.allocated_days
   returning * into v_balance;
   if not found then raise exception 'رصيد الإجازات المدفوعة غير كافٍ' using errcode='23514'; end if;
  else
   update public.hr_leave_balances set used_days=greatest(0,used_days-1),updated_at=now()
   where employee_id=p_employee_id and leave_year=extract(year from p_shift_date)::integer;
  end if;
 end if;
 update public.hr_attendance set attendance_status=p_status,notes=nullif(left(coalesce(p_notes,''),1000),''),
  reviewed_by=p_reviewed_by,reviewed_at=now(),updated_at=now()
 where id=v_att.id returning * into v_att;
 return to_jsonb(v_att);
end; $$;

create or replace function app_private.hr_create_payroll_run(p_period_start date,p_period_end date,p_created_by uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_run public.hr_payroll_runs%rowtype; v_emp public.hr_employees%rowtype;
 v_days integer; v_eligible_days integer; v_absent numeric; v_paid_leave numeric;
 v_late numeric; v_overtime numeric; v_deductions numeric; v_additions numeric;
 v_absence_deduction numeric; v_lateness_deduction numeric; v_overtime_amount numeric;
 v_base numeric; v_net numeric; v_items integer:=0;
begin
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then
  raise exception 'فترة الرواتب غير صحيحة' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_period_start::text||':'||p_period_end::text,0));
 select * into v_run from public.hr_payroll_runs where period_start=p_period_start and period_end=p_period_end;
 if found then raise exception 'يوجد كشف رواتب لهذه الفترة بالفعل' using errcode='23505'; end if;
 insert into public.hr_payroll_runs(period_start,period_end,status,created_by)
 values(p_period_start,p_period_end,'draft',p_created_by) returning * into v_run;
 perform 1 from public.hr_payroll_adjustments
 where payroll_run_id is null and adjustment_date between p_period_start and p_period_end for update;
 v_days:=(p_period_end-p_period_start)+1;
 for v_emp in select * from public.hr_employees
  where employment_status='active' and hire_date<=p_period_end order by id
 loop
  select count(*) filter(where attendance_status in ('absent','unpaid_leave')),
   count(*) filter(where attendance_status='paid_leave'),coalesce(sum(late_minutes),0),coalesce(sum(overtime_minutes),0)
  into v_absent,v_paid_leave,v_late,v_overtime from public.hr_attendance
  where employee_id=v_emp.id and shift_date between p_period_start and p_period_end;
  select coalesce(sum(amount) filter(where adjustment_type='deduction'),0),
   coalesce(sum(amount) filter(where adjustment_type='addition'),0)
  into v_deductions,v_additions from public.hr_payroll_adjustments
  where employee_id=v_emp.id and payroll_run_id is null and adjustment_date between p_period_start and p_period_end;
  v_eligible_days:=greatest(0,least(v_days,(p_period_end-greatest(p_period_start,v_emp.hire_date))+1));
  v_base:=round((coalesce(v_emp.monthly_salary,0)*least(v_eligible_days,30)/30.0)::numeric,2);
  v_absence_deduction:=round((coalesce(v_absent,0)*coalesce(v_emp.monthly_salary,0)/30.0)::numeric,2);
  v_lateness_deduction:=round((coalesce(v_late,0)/60.0*coalesce(v_emp.monthly_salary,0)/
   (greatest(1,coalesce(v_emp.daily_work_hours,8))*26.0))::numeric,2);
  v_overtime_amount:=round((coalesce(v_overtime,0)/60.0*coalesce(v_emp.overtime_hour_rate,0))::numeric,2);
  v_net:=greatest(0,v_base-v_absence_deduction-v_lateness_deduction+v_overtime_amount-coalesce(v_deductions,0)+coalesce(v_additions,0));
  insert into public.hr_payroll_items(payroll_run_id,employee_id,employee_name_snapshot,monthly_salary,overtime_amount,
   lateness_deduction,other_deductions,additions,paid_leave_days,net_salary,details)
  values(v_run.id,v_emp.id,v_emp.full_name,v_base,v_overtime_amount,v_lateness_deduction,
   coalesce(v_deductions,0)+v_absence_deduction,coalesce(v_additions,0),coalesce(v_paid_leave,0),round(v_net,2),
   jsonb_build_object('period_days',v_days,'eligible_days',v_eligible_days,'absent_days',coalesce(v_absent,0),
    'paid_leave_days',coalesce(v_paid_leave,0),'late_minutes',coalesce(v_late,0),
    'overtime_minutes',coalesce(v_overtime,0),'absence_deduction',v_absence_deduction));
  v_items:=v_items+1;
 end loop;
 update public.hr_payroll_adjustments set payroll_run_id=v_run.id
 where payroll_run_id is null and adjustment_date between p_period_start and p_period_end;
 return jsonb_build_object('run',to_jsonb(v_run),
  'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.employee_name_snapshot),'[]'::jsonb)
   from public.hr_payroll_items i where i.payroll_run_id=v_run.id),'item_count',v_items);
end; $$;
revoke all on function app_private.hr_review_attendance(uuid,uuid,date,text,text,uuid) from public,anon,authenticated;
revoke all on function app_private.hr_create_payroll_run(date,date,uuid) from public,anon,authenticated;
grant execute on function app_private.hr_review_attendance(uuid,uuid,date,text,text,uuid) to service_role;
grant execute on function app_private.hr_create_payroll_run(date,date,uuid) to service_role;
