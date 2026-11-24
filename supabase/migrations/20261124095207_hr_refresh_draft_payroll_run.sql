create or replace function public.hr_refresh_draft_payroll_run(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
 v_run public.hr_payroll_runs%rowtype;
 v_emp public.hr_employees%rowtype;
 v_days integer;
 v_eligible_days integer;
 v_eligible_start date;
 v_eligible_end date;
 v_attended_days integer;
 v_overtime integer;
 v_shortage integer;
 v_net_minutes integer;
 v_deductions numeric;
 v_additions numeric;
 v_hour_rate numeric;
 v_hour_adjustment numeric;
 v_overtime_amount numeric;
 v_shortage_amount numeric;
 v_base numeric;
 v_net numeric;
 v_items integer:=0;
begin
 select * into v_run from public.hr_payroll_runs where id=p_run_id for update;
 if not found then raise exception 'كشف الرواتب غير موجود' using errcode='P0002'; end if;
 if v_run.status<>'draft' then raise exception 'لا يمكن تحديث كشف رواتب معتمد' using errcode='55000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_run.period_start::text||':'||v_run.period_end::text,0));
 delete from public.hr_payroll_items where payroll_run_id=v_run.id;
 v_days:=(v_run.period_end-v_run.period_start)+1;
 for v_emp in
  select e.* from public.hr_employees e
  where e.hire_date<=v_run.period_end
    and coalesce(e.termination_date,v_run.period_end)>=v_run.period_start
    and (e.employment_status='active' or e.termination_date is not null or exists(
      select 1 from public.hr_attendance a where a.employee_id=e.id and a.shift_date between v_run.period_start and v_run.period_end))
  order by e.full_name
 loop
  v_eligible_start:=greatest(v_run.period_start,v_emp.hire_date);
  v_eligible_end:=least(v_run.period_end,coalesce(v_emp.termination_date,case when v_emp.employment_status='inactive' then (
    select max(a.shift_date) from public.hr_attendance a where a.employee_id=v_emp.id and a.shift_date between v_run.period_start and v_run.period_end
  ) else v_run.period_end end));
  if v_eligible_end is null or v_eligible_end<v_eligible_start then continue; end if;
  v_eligible_days:=(v_eligible_end-v_eligible_start)+1;
  select
   count(*) filter(where a.attendance_status='present' and a.check_in_at is not null and a.check_out_at is not null),
   coalesce(sum(greatest(round(extract(epoch from (a.check_out_at-a.check_in_at))/60.0)::integer-round(coalesce(v_emp.daily_work_hours,8)*60)::integer,0)) filter(where a.attendance_status='present' and a.check_in_at is not null and a.check_out_at is not null),0)::integer,
   coalesce(sum(greatest(round(coalesce(v_emp.daily_work_hours,8)*60)::integer-round(extract(epoch from (a.check_out_at-a.check_in_at))/60.0)::integer,0)) filter(where a.attendance_status='present' and a.check_in_at is not null and a.check_out_at is not null),0)::integer
  into v_attended_days,v_overtime,v_shortage from public.hr_attendance a
  where a.employee_id=v_emp.id and a.shift_date between v_eligible_start and v_eligible_end;
  select coalesce(sum(amount) filter(where adjustment_type='deduction'),0),coalesce(sum(amount) filter(where adjustment_type='addition'),0)
  into v_deductions,v_additions from public.hr_payroll_adjustments
  where employee_id=v_emp.id and (payroll_run_id=v_run.id or payroll_run_id is null)
    and adjustment_date between v_run.period_start and v_run.period_end;
  v_base:=round((coalesce(v_emp.monthly_salary,0)/30.0*(coalesce(v_attended_days,0)+floor(coalesce(v_attended_days,0)/7.0)))::numeric,2);
  v_hour_rate:=coalesce(v_emp.monthly_salary,0)/(30.0*greatest(0.01,coalesce(v_emp.daily_work_hours,8)));
  v_net_minutes:=coalesce(v_overtime,0)-coalesce(v_shortage,0);
  v_hour_adjustment:=round((v_net_minutes/60.0*v_hour_rate)::numeric,2);
  v_overtime_amount:=round((greatest(v_net_minutes,0)/60.0*v_hour_rate)::numeric,2);
  v_shortage_amount:=round((greatest(-v_net_minutes,0)/60.0*v_hour_rate)::numeric,2);
  v_net:=round((v_base+v_hour_adjustment-coalesce(v_deductions,0)+coalesce(v_additions,0))::numeric,2);
  insert into public.hr_payroll_items(payroll_run_id,employee_id,employee_name_snapshot,monthly_salary,overtime_amount,lateness_deduction,other_deductions,additions,paid_leave_days,net_salary,details)
  values(v_run.id,v_emp.id,v_emp.full_name,v_base,v_overtime_amount,v_shortage_amount,coalesce(v_deductions,0),coalesce(v_additions,0),0,v_net,
   jsonb_build_object('contract_monthly_salary',v_emp.monthly_salary,'period_days',v_days,'eligible_days',v_eligible_days,'eligible_start',v_eligible_start,'eligible_end',v_eligible_end,
    'hire_date',v_emp.hire_date,'termination_date',v_emp.termination_date,'attended_days',coalesce(v_attended_days,0),'weekly_paid_rest_days',floor(coalesce(v_attended_days,0)/7.0),
    'paid_leave_days',0,'paid_days_total',coalesce(v_attended_days,0)+floor(coalesce(v_attended_days,0)/7.0),'daily_work_hours',v_emp.daily_work_hours,'hour_rate',round(v_hour_rate::numeric,6),
    'overtime_minutes',coalesce(v_overtime,0),'shortage_minutes',coalesce(v_shortage,0),'net_minutes',v_net_minutes,'overtime_amount',v_overtime_amount,'shortage_amount',v_shortage_amount,
    'hour_adjustment',v_hour_adjustment,'deductions',coalesce(v_deductions,0),'incentives',coalesce(v_additions,0),'base_salary_due',v_base,'net_salary',v_net));
  v_items:=v_items+1;
 end loop;
 update public.hr_payroll_adjustments set payroll_run_id=v_run.id where payroll_run_id is null and adjustment_date between v_run.period_start and v_run.period_end;
 return jsonb_build_object('run',to_jsonb(v_run),'items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.employee_name_snapshot),'[]'::jsonb) from public.hr_payroll_items i where i.payroll_run_id=v_run.id),'item_count',v_items);
end;
$function$;
revoke all on function public.hr_refresh_draft_payroll_run(uuid) from public, anon, authenticated;
grant execute on function public.hr_refresh_draft_payroll_run(uuid) to service_role;
