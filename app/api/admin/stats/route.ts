import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()

  // ดึง License counts ทั้งหมด
  const { data: licenses } = await supabase
    .from('licenses')
    .select('status, expires_at')

  if (!licenses) {
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }

  const now = new Date()
  let active = 0, disabled = 0, banned = 0, expired = 0

  for (const lic of licenses) {
    if (lic.status === 'banned') { banned++; continue }
    if (lic.status === 'disabled') { disabled++; continue }
    if (lic.expires_at && new Date(lic.expires_at) < now) { expired++; continue }
    active++
  }

  // นับ check_success ใน 24 ชั่วโมงที่ผ่านมา
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentChecks } = await supabase
    .from('license_logs')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', 'check_success')
    .gte('created_at', since)

  return NextResponse.json({
    total: licenses.length,
    active,
    disabled,
    expired,
    banned,
    recent_checks: recentChecks ?? 0,
  })
}
