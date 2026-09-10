import { NextRequest } from 'next/server'
import { createServerClient } from './supabase/server'

export interface AdminSession {
  userId: string
  email: string
  role: string
}

// ตรวจสอบ Admin session จาก Cookie ที่ Supabase ส่งมา
// ใช้ใน API Routes เพื่อ guard การเข้าถึง
export async function requireAdmin(
  request: NextRequest
): Promise<AdminSession | null> {
  try {
    const supabase = createServerClient()

    // ดึง token จาก Authorization header หรือ Cookie
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.replace('Bearer ', '') ?? null

    if (!token) return null

    // Verify token กับ Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) return null

    // ตรวจสอบ role จาก profiles table
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role !== 'admin') return null

    return {
      userId: user.id,
      email: user.email ?? '',
      role: profile.role,
    }
  } catch {
    return null
  }
}
