import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase.from('system_settings').select('*')
  if (error) return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })

  const settings: Record<string, string> = {}
  for (const row of data ?? []) {
    settings[row.key] = row.value
  }

  return NextResponse.json({ data: settings })
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()

  const allowed: { key: string; value: string }[] = []

  if (typeof body.system_name === 'string' && body.system_name.trim()) {
    allowed.push({ key: 'system_name', value: body.system_name.trim() })
  }
  if (typeof body.default_device_binding === 'boolean') {
    allowed.push({ key: 'default_device_binding', value: String(body.default_device_binding) })
  }
  if (typeof body.token_expire_minutes === 'number' && body.token_expire_minutes > 0) {
    allowed.push({ key: 'token_expire_minutes', value: String(Math.floor(body.token_expire_minutes)) })
  }

  if (allowed.length === 0) {
    return NextResponse.json({ error: 'No valid settings to update' }, { status: 400 })
  }

  for (const setting of allowed) {
    await supabase
      .from('system_settings')
      .upsert({ key: setting.key, value: setting.value })
  }

  return NextResponse.json({ success: true })
}
