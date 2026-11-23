-- HR foundation. Existing Auth employee accounts remain untouched.
create table if not exists public.hr_employees (
 id uuid primary key default gen_random_uuid(),
 full_name text not null check (char_length(trim(full_name)) between 2 and 150),
 phone text, photo_path text, job_title text, department text,
 hire_date date not null default current_date,
 employment_status text not null default 'active' check (employment_status in ('active','inactive')),
 monthly_salary numeric(12,2) not null default 0 check (monthly_salary >= 0),
 overtime_hour_rate numeric(10,2) not null default 0 check (overtime_hour_rate >= 0),
 paid_leave_days numeric(6,2) not null default 0 check (paid_leave_days >= 0),
 daily_work_hours numeric(5,2) not null default 8 check (daily_work_hours > 0 and daily_work_hours <= 24),
 attendance_pin_hash text, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.hr_shifts (
 id uuid primary key default gen_random_uuid(), name text not null,
 start_time time not null, end_time time not null,
 crosses_midnight boolean not null default false,
 break_minutes integer not null default 0 check (break_minutes >= 0),
 grace_minutes integer not null default 0 check (grace_minutes >= 0),
 is_active boolean not null default true, created_at timestamptz not null default now(),
 check (start_time <> end_time)
);
create table if not exists public.hr_employee_shift_assignments (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 shift_id uuid not null references public.hr_shifts(id) on delete restrict,
 effective_from date not null, effective_to date,
 weekday smallint check (weekday between 0 and 6), created_at timestamptz not null default now(),
 check (effective_to is null or effective_to >= effective_from)
);
create table if not exists public.hr_attendance (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 shift_date date not null, check_in_at timestamptz, check_out_at timestamptz,
 attendance_status text not null default 'present' check (attendance_status in ('present','absent_pending','absent','paid_leave','unpaid_leave','holiday','excused')),
 check_in_method text check (check_in_method in ('manager','pin','face')),
 check_out_method text check (check_out_method in ('manager','pin','face')),
 late_minutes integer not null default 0 check (late_minutes >= 0),
 overtime_minutes integer not null default 0 check (overtime_minutes >= 0),
 worked_minutes integer not null default 0 check (worked_minutes >= 0),
 notes text, reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz, created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(employee_id, shift_date),
 check (check_out_at is null or check_in_at is null or check_out_at > check_in_at)
);
create table if not exists public.hr_payroll_adjustments (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 adjustment_date date not null default current_date,
 amount numeric(12,2) not null check (amount <> 0),
 adjustment_type text not null check (adjustment_type in ('deduction','addition')),
 reason text not null, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create table if not exists public.hr_payroll_runs (
 id uuid primary key default gen_random_uuid(), period_start date not null, period_end date not null,
 status text not null default 'draft' check (status in ('draft','finalized')),
 created_by uuid references auth.users(id) on delete set null,
 finalized_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), finalized_at timestamptz,
 check (period_end >= period_start)
);
create table if not exists public.hr_payroll_items (
 id uuid primary key default gen_random_uuid(),
 payroll_run_id uuid not null references public.hr_payroll_runs(id) on delete restrict,
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 employee_name_snapshot text not null, monthly_salary numeric(12,2) not null,
 overtime_amount numeric(12,2) not null default 0, lateness_deduction numeric(12,2) not null default 0,
 other_deductions numeric(12,2) not null default 0, additions numeric(12,2) not null default 0,
 paid_leave_days numeric(6,2) not null default 0, net_salary numeric(12,2) not null,
 details jsonb not null default '{}'::jsonb, unique(payroll_run_id, employee_id)
);
alter table public.hr_employees enable row level security;
alter table public.hr_shifts enable row level security;
alter table public.hr_employee_shift_assignments enable row level security;
alter table public.hr_attendance enable row level security;
alter table public.hr_payroll_adjustments enable row level security;
alter table public.hr_payroll_runs enable row level security;
alter table public.hr_payroll_items enable row level security;
do $$
declare t text;
begin
 foreach t in array array['hr_employees','hr_shifts','hr_employee_shift_assignments','hr_attendance','hr_payroll_adjustments','hr_payroll_runs','hr_payroll_items'] loop
  execute format('drop policy if exists "Admins manage %s" on public.%I',t,t);
  execute format('create policy "Admins manage %s" on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',t,t);
  execute format('revoke all on public.%I from anon',t);
  execute format('grant select, insert, update, delete on public.%I to authenticated',t);
 end loop;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('hr-employee-photos','hr-employee-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
drop policy if exists "Admins manage HR employee photos" on storage.objects;
create policy "Admins manage HR employee photos" on storage.objects for all to authenticated
using(bucket_id='hr-employee-photos' and (select public.is_admin()))
with check(bucket_id='hr-employee-photos' and (select public.is_admin()));
