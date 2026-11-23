create table if not exists public.hr_leave_balances (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.hr_employees(id) on delete restrict,
 leave_year integer not null check (leave_year between 2020 and 2100),
 allocated_days numeric(6,2) not null default 0 check (allocated_days >= 0),
 used_days numeric(6,2) not null default 0 check (used_days >= 0),
 updated_at timestamptz not null default now(),
 unique(employee_id,leave_year),
 check (used_days <= allocated_days)
);
alter table public.hr_leave_balances enable row level security;
drop policy if exists "Admins manage HR leave balances" on public.hr_leave_balances;
create policy "Admins manage HR leave balances" on public.hr_leave_balances for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.hr_leave_balances from anon;
grant select,insert,update,delete on public.hr_leave_balances to authenticated;