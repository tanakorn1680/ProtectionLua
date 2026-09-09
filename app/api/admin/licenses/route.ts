import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { generateLicenseKey } from '@/lib/license'

// GET /api/admin/licenses?page=1&limit=20&search=xxx&status=active
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const search = searchParams.get('search')?.trim() ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const offset = (page - 1) * limit

  let query = supabase
    .from('licenses')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.or(`license_key.ilike.%${search}%,name.ilike.%${search}%,note.ilike.%${search}%`)
  }

  // filter by stored status (expired is computed client-side too)
  if (statusFilter && ['active', 'disabled', 'banned'].includes(statusFilter)) {
    query = query.eq('status', statusFilter)
  }

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

// POST /api/admin/licenses — สร้าง License ใหม่
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Fetch default device binding setting
  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'default_device_binding')
    .single()
  const defaultBinding = settingRow?.value !== 'false'

  const license_key = typeof body.license_key === 'string' && body.license_key.trim()
    ? body.license_key.trim().toUpperCase()
    : generateLicenseKey()

  const expires_at = typeof body.expires_at === 'string' && body.expires_at
    ? new Date(body.expires_at).toISOString()
    : null

  const { data, error } = await supabase
    .from('licenses')
    .insert({
      license_key,
      name: typeof body.name === 'string' ? body.name.trim() || null : null,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      status: 'active',
      expires_at,
      device_binding_enabled:
        typeof body.device_binding_enabled === 'boolean'
          ? body.device_binding_enabled
          : defaultBinding,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'License key already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
