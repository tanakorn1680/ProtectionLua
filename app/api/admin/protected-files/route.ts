/**
 * GET /api/admin/protected-files
 * ดึงรายการ Protected Files ของ Admin ปัจจุบัน
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient()
  const { searchParams } = new URL(request.url)

  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const search = searchParams.get('search')?.trim() ?? ''
  const statusFilter = searchParams.get('status') ?? ''
  const levelFilter = searchParams.get('level') ?? ''
  const offset = (page - 1) * limit

  let query = supabase
    .from('protected_files')
    .select(
      `
      *,
      licenses (
        license_key,
        name
      )
    `,
      { count: 'exact' }
    )
    .eq('admin_id', admin.userId) // RLS: เห็นเฉพาะของตัวเอง
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) {
    query = query.ilike('original_filename', `%${search}%`)
  }

  if (statusFilter && ['uploaded', 'processing', 'completed', 'failed'].includes(statusFilter)) {
    query = query.eq('status', statusFilter)
  }

  if (levelFilter && ['basic', 'standard', 'strong'].includes(levelFilter)) {
    query = query.eq('protection_level', levelFilter)
  }

  const { data, count, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }

  return NextResponse.json({ data, total: count ?? 0, page, limit })
}
