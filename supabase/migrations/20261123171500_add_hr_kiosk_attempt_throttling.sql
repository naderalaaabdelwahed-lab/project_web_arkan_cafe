create table if not exists public.hr_kiosk_attempts (
 id bigint generated always as identity primary key,
 device_id uuid not null references public.hr_kiosk_devices(id) on delete cascade,
 attempted_at timestamptz not null default now(),
 succeeded boolean not null default false
);
create index if not exists hr_kiosk_attempts_device_time_idx on public.hr_kiosk_attempts(device_id,attempted_at desc);
alter table public.hr_kiosk_attempts enable row level security;
revoke all on public.hr_kiosk_attempts from anon, authenticated;
