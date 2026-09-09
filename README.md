# License Management System

ระบบจัดการ License สำหรับสคริปต์ Lua  
Deploy บน Vercel + Supabase

---

## โครงสร้างโปรเจกต์

```
license-system/
├── app/
│   ├── admin/
│   │   ├── layout.tsx         ← Sidebar + Bottom Nav + Auth guard
│   │   ├── dashboard/         ← หน้าภาพรวม
│   │   ├── licenses/          ← หน้าจัดการ License
│   │   ├── logs/              ← หน้าประวัติการใช้งาน
│   │   └── settings/          ← หน้าตั้งค่า
│   ├── login/                 ← หน้าเข้าสู่ระบบ
│   ├── api/
│   │   ├── license/check/     ← Public API: ตรวจสอบ License
│   │   └── admin/             ← Admin API (ต้อง Auth)
│   │       ├── stats/
│   │       ├── licenses/
│   │       ├── logs/
│   │       └── settings/
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── StatusBadge.tsx
│   ├── LicenseModal.tsx
│   └── LicenseDrawer.tsx
├── lib/
│   ├── types/index.ts
│   ├── supabase/
│   │   ├── server.ts          ← Service Role (Server Only)
│   │   └── client.ts          ← Anon Key (Browser)
│   ├── AdminContext.tsx        ← Auth state + fetch helper
│   ├── auth.ts                ← Admin guard สำหรับ API
│   ├── jwt.ts                 ← Temporary token
│   ├── license.ts             ← Utilities
│   └── rateLimit.ts
├── supabase/
│   └── schema.sql
├── .env.example
└── README.md
```

---

## ขั้นตอนการ Deploy

### 1. สร้าง Supabase Project

1. ไปที่ [supabase.com](https://supabase.com) → สร้าง Project ใหม่
2. รอ Project พร้อม (~2 นาที)

### 2. รัน SQL Schema

1. ไปที่ **SQL Editor** ใน Supabase Dashboard
2. คัดลอกเนื้อหาจาก `supabase/schema.sql`
3. วางและกด **Run**

### 3. สร้าง Admin User

1. ไปที่ **Authentication → Users** → **Add user**
2. ใส่ Email + Password ที่ต้องการ (ห้ามลืม)
3. ไปที่ **SQL Editor** แล้วรัน:

```sql
update public.profiles
  set role = 'admin'
  where email = 'your-admin@email.com';
```

### 4. ตั้งค่า Environment Variables บน Vercel

| Variable | แหล่งที่มา |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `LICENSE_JWT_SECRET` | สร้างด้วย: `openssl rand -base64 32` |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ห้าม Expose ฝั่ง Client เด็ดขาด

### 5. Deploy ขึ้น Vercel

```bash
# ติดตั้ง Vercel CLI
npm i -g vercel

# Deploy
vercel

# หรือ Push ขึ้น GitHub แล้วเชื่อมกับ Vercel
```

---

## การทดสอบ API

### ตรวจสอบ License

```bash
curl -X POST https://your-domain.vercel.app/api/license/check \
  -H "Content-Type: application/json" \
  -d '{
    "license": "ABCD-1234-EFGH-5678",
    "device_id": "my-unique-device-id"
  }'
```

### Response สำเร็จ

```json
{
  "success": true,
  "allowed": true,
  "status": "active",
  "expires_at": "2026-12-31T00:00:00Z",
  "token": "eyJ..."
}
```

### Response ล้มเหลว

```json
{
  "success": false,
  "allowed": false,
  "reason": "expired"
}
```

### Reason ที่รองรับ

| Reason | ความหมาย |
|---|---|
| `invalid_license` | ไม่พบ License ในระบบ |
| `disabled` | ถูกปิดใช้งานโดย Admin |
| `banned` | ถูกแบน |
| `expired` | หมดอายุ |
| `device_mismatch` | Device ID ไม่ตรงกับที่ผูกไว้ |
| `invalid_request` | Request format ผิด หรือถูก Rate Limit |

---

## ตัวอย่างการใช้ใน Lua Script

```lua
local HttpService = game:GetService("HttpService")

local LICENSE_KEY = "ABCD-1234-EFGH-5678"
local DEVICE_ID = tostring(game.PlaceId) -- หรือ ID ที่ unique ต่ออุปกรณ์

local function checkLicense()
  local success, result = pcall(function()
    return HttpService:PostAsync(
      "https://your-domain.vercel.app/api/license/check",
      HttpService:JSONEncode({
        license = LICENSE_KEY,
        device_id = DEVICE_ID,
      }),
      Enum.HttpContentType.ApplicationJson
    )
  end)
  
  if not success then
    return false, "network_error"
  end
  
  local data = HttpService:JSONDecode(result)
  
  if data.allowed then
    -- เก็บ token ไว้ใช้ใน session
    _G.LICENSE_TOKEN = data.token
    return true, data.status
  else
    return false, data.reason
  end
end

local ok, reason = checkLicense()
if not ok then
  -- หยุดการทำงาน
  error("License invalid: " .. reason)
end
```

---

## Security

- ✅ Supabase Service Role Key ใช้เฉพาะ Server Side
- ✅ RLS เปิดทุก Table (เฉพาะ service_role เข้าได้)
- ✅ Admin API ทุก Endpoint ต้อง Verify Supabase Token
- ✅ Rate Limit 20 req/min ต่อ IP บน `/api/license/check`
- ✅ Temporary Token ลงลายเซ็นด้วย `LICENSE_JWT_SECRET`
- ✅ Error response ไม่เปิดเผย internal details
- ✅ Device Binding ป้องกันการแชร์ License
