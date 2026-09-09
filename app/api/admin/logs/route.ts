import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
  const licenseId = searchParams.get('license_id')
  const eventType = searchParams.get('event_type')
  const offset = (page - 1) * limit

  let query = supabase
    .from('license_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (licenseId) query = query.eq('license_id', licenseId)
  if (eventType) query = query.eq('event_type', eventType)

  const { data, count, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to fetch logs' }, { status: 500 })

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}
