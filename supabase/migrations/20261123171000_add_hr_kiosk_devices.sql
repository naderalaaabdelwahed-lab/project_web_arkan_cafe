create table if not exists public.hr_kiosk_devices (
 id uuid primary key default gen_random_uuid(), name text not null, token_hash text not null unique,
 is_active boolean not null default true, last_seen_at timestamptz,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.hr_kiosk_devices enable row level security;
drop policy if exists "Admins manage HR kiosk devices" on public.hr_kiosk_devices;
create policy "Admins manage HR kiosk devices" on public.hr_kiosk_devices for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.hr_kiosk_devices from anon;
grant select,insert,update,delete on public.hr_kiosk_devices to authenticated;
