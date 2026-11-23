alter table public.hr_employees
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists username text;

create unique index if not exists hr_employees_auth_user_id_uidx
  on public.hr_employees(auth_user_id)
  where auth_user_id is not null;

create unique index if not exists hr_employees_username_lower_uidx
  on public.hr_employees(lower(username))
  where username is not null;

comment on column public.hr_employees.auth_user_id is
  'Supabase Auth identity for the employee self-service HR portal';

comment on column public.hr_employees.username is
  'Employee login username; password is managed by Supabase Auth and never stored here';
