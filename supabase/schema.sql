-- ==========================================
-- License Management System - Supabase Schema
-- ==========================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ==========================================
-- Table: profiles (ใช้เชื่อมกับ Supabase Auth)
-- ==========================================
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz default now()
);

-- ==========================================
-- Table: system_settings
-- ==========================================
create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Default settings
insert into public.system_settings (key, value) values
  ('system_name', 'License Manager'),
  ('default_device_binding', 'true'),
  ('token_expire_minutes', '60')
on conflict (key) do nothing;

-- ==========================================
-- Table: licenses
-- ==========================================
create table if not exists public.licenses (
  id uuid default uuid_generate_v4() primary key,
  license_key text unique not null,
  name text,
  note text,
  status text not null default 'active' check (status in ('active', 'disabled', 'banned')),
  expires_at timestamptz,
  device_id text,
  device_binding_enabled boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_seen timestamptz,
  last_ip text
);

-- ==========================================
-- Table: license_logs
-- ==========================================
create table if not exists public.license_logs (
  id uuid default uuid_generate_v4() primary key,
  license_id uuid references public.licenses(id) on delete set null,
  license_key text not null,
  event_type text not null check (event_type in (
    'check_success',
    'invalid_license',
    'disabled',
    'banned',
    'expired',
    'device_mismatch',
    'device_bound',
    'device_reset'
  )),
  device_id text,
  ip text,
  created_at timestamptz default now()
);

-- ==========================================
-- Indexes
-- ==========================================
create index if not exists idx_licenses_license_key on public.licenses(license_key);
create index if not exists idx_licenses_status on public.licenses(status);
create index if not exists idx_licenses_created_at on public.licenses(created_at desc);
create index if not exists idx_license_logs_license_id on public.license_logs(license_id);
create index if not exists idx_license_logs_event_type on public.license_logs(event_type);
create index if not exists idx_license_logs_created_at on public.license_logs(created_at desc);

-- ==========================================
-- Trigger: auto-update updated_at
-- ==========================================
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger licenses_updated_at
  before update on public.licenses
  for each row execute function public.handle_updated_at();

create trigger settings_updated_at
  before update on public.system_settings
  for each row execute function public.handle_updated_at();

-- ==========================================
-- Trigger: auto-create profile on signup
-- ==========================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================
-- Row Level Security (RLS)
-- ==========================================

-- profiles: เฉพาะ Service Role เข้าถึงได้ (ผ่าน API Routes เท่านั้น)
alter table public.profiles enable row level security;
create policy "Service role only" on public.profiles
  using (auth.role() = 'service_role');

-- licenses: เฉพาะ Service Role เข้าถึงได้
alter table public.licenses enable row level security;
create policy "Service role only" on public.licenses
  using (auth.role() = 'service_role');

-- license_logs: เฉพาะ Service Role เข้าถึงได้
alter table public.license_logs enable row level security;
create policy "Service role only" on public.license_logs
  using (auth.role() = 'service_role');

-- system_settings: เฉพาะ Service Role เข้าถึงได้
alter table public.system_settings enable row level security;
create policy "Service role only" on public.system_settings
  using (auth.role() = 'service_role');

-- ==========================================
-- หมายเหตุ: วิธีสร้าง Admin
-- 1. ไปที่ Supabase Dashboard > Authentication > Users
-- 2. กด "Invite user" หรือ "Add user" ด้วย Email + Password
-- 3. รัน SQL ด้านล่างเพื่อตั้ง Role เป็น admin:
--
-- update public.profiles
--   set role = 'admin'
--   where email = 'your-admin@email.com';
-- ==========================================
