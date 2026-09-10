import { createClient } from '@supabase/supabase-js'

// Browser client - ใช้ anon key เท่านั้น (สำหรับ Auth เท่านั้น)
// ข้อมูล License ทั้งหมดต้องผ่าน API Routes ไม่ query ตรง
let client: ReturnType<typeof createClient> | null = null

export function getSupabaseClient() {
  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error('Missing Supabase public environment variables')
  }

  client = createClient(url, key)
  return client
}
