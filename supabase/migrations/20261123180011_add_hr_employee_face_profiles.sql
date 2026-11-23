create table if not exists public.hr_employee_face_profiles (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null unique references public.hr_employees(id) on delete cascade,
  embedding_ciphertext text not null,
  embedding_iv text not null,
  embedding_auth_tag text not null,
  model_version text not null default 'opencv-yunet-sface-2021dec',
  consent_confirmed_at timestamptz not null,
  enrolled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.hr_employee_face_profiles enable row level security;
revoke all on public.hr_employee_face_profiles from anon, authenticated;
grant all on public.hr_employee_face_profiles to service_role;
