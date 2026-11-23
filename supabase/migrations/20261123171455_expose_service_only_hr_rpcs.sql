alter function app_private.hr_review_attendance(uuid,uuid,date,text,text,uuid) set schema public;
alter function app_private.hr_create_payroll_run(date,date,uuid) set schema public;
revoke all on function public.hr_review_attendance(uuid,uuid,date,text,text,uuid) from public,anon,authenticated;
revoke all on function public.hr_create_payroll_run(date,date,uuid) from public,anon,authenticated;
grant execute on function public.hr_review_attendance(uuid,uuid,date,text,text,uuid) to service_role;
grant execute on function public.hr_create_payroll_run(date,date,uuid) to service_role;
