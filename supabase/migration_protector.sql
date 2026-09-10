-- ==========================================
-- Lua Protector - Migration (เพิ่มต่อจาก schema.sql เดิม)
-- ==========================================

-- ==========================================
-- Table: protected_scripts
-- ==========================================
create table if not exists public.protected_scripts (
  id uuid default uuid_generate_v4() primary key,
  protection_id text unique not null,   -- public identifier e.g. PRT-XXXXXXXX
  admin_id uuid references auth.users(id) on delete set null,
  original_filename text not null,
  source_storage_path text not null,    -- lua-source bucket path
  payload_storage_path text,            -- lua-payload bucket path (set after protection)
  license_id uuid references public.licenses(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_used_at timestamptz
);

-- ==========================================
-- Table: runtime_sessions
-- เก็บ Session Token (hash) ที่ออกให้ Loader
-- ==========================================
create table if not exists public.runtime_sessions (
  id uuid default uuid_generate_v4() primary key,
  protection_id text not null references public.protected_scripts(protection_id) on delete cascade,
  license_id uuid not null references public.licenses(id) on delete cascade,
  device_id text,
  token_hash text not null unique,      -- SHA-256 of raw token
  expires_at timestamptz not null,
  created_at timestamptz default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);

-- ==========================================
-- Table: protection_logs
-- ==========================================
create table if not exists public.protection_logs (
  id uuid default uuid_generate_v4() primary key,
  protection_id text,
  license_id uuid,
  device_id text,
  event_type text not null check (event_type in (
    'loader_started',
    'license_success',
    'license_failed',
    'session_created',
    'payload_requested',
    'payload_delivered',
    'payload_denied',
    'device_mismatch',
    'expired',
    'disabled',
    'session_revoked'
  )),
  ip text,
  detail text,
  created_at timestamptz default now()
);

-- ==========================================
-- Indexes
-- ==========================================
create index if not exists idx_protected_scripts_protection_id
  on public.protected_scripts(protection_id);

create index if not exists idx_protected_scripts_license_id
  on public.protected_scripts(license_id);

create index if not exists idx_protected_scripts_status
  on public.protected_scripts(status);

create index if not exists idx_runtime_sessions_token_hash
  on public.runtime_sessions(token_hash);

create index if not exists idx_runtime_sessions_protection_id
  on public.runtime_sessions(protection_id);

create index if not exists idx_runtime_sessions_expires_at
  on public.runtime_sessions(expires_at);

create index if not exists idx_protection_logs_protection_id
  on public.protection_logs(protection_id);

create index if not exists idx_protection_logs_created_at
  on public.protection_logs(created_at desc);

-- ==========================================
-- Trigger: updated_at
-- ==========================================
create trigger protected_scripts_updated_at
  before update on public.protected_scripts
  for each row execute function public.handle_updated_at();

-- ==========================================
-- RLS — เฉพาะ Service Role ทั้งหมด
-- ==========================================
alter table public.protected_scripts enable row level security;
create policy "Service role only" on public.protected_scripts
  using (auth.role() = 'service_role');

alter table public.runtime_sessions enable row level security;
create policy "Service role only" on public.runtime_sessions
  using (auth.role() = 'service_role');

alter table public.protection_logs enable row level security;
create policy "Service role only" on public.protection_logs
  using (auth.role() = 'service_role');

-- ==========================================
-- Storage Buckets (รัน SQL นี้ใน SQL Editor)
-- หมายเหตุ: ต้องสร้าง Bucket ผ่าน Dashboard ด้วย
-- ไปที่ Storage > New Bucket
--   1. lua-source  (Private, no public access)
--   2. lua-payload (Private, no public access)
-- ==========================================

-- Storage policies: Service Role เข้าถึงได้เท่านั้น
-- (จัดการผ่าน Dashboard: Storage > Policies หรือใช้ Service Role Key ผ่าน API)
