import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

// PATCH /api/admin/licenses/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Whitelist fields that admin can update
  const allowed: Record<string, unknown> = {}

  if (typeof body.name === 'string') allowed.name = body.name.trim() || null
  if (typeof body.note === 'string') allowed.note = body.note.trim() || null
  if (typeof body.status === 'string' && ['active', 'disabled', 'banned'].includes(body.status)) {
    allowed.status = body.status
  }
  if (body.expires_at === null) {
    allowed.expires_at = null
  } else if (typeof body.expires_at === 'string' && body.expires_at) {
    allowed.expires_at = new Date(body.expires_at).toISOString()
  }
  if (typeof body.device_binding_enabled === 'boolean') {
    allowed.device_binding_enabled = body.device_binding_enabled
  }
  // Reset device
  if (body.reset_device === true) {
    allowed.device_id = null

    // Log device reset
    const { data: lic } = await supabase
      .from('licenses')
      .select('license_key')
      .eq('id', id)
      .single()

    if (lic) {
      await supabase.from('license_logs').insert({
        license_id: id,
        license_key: lic.license_key,
        event_type: 'device_reset',
        device_id: null,
        ip: null,
      })
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('licenses')
    .update(allowed)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })

  return NextResponse.json({ data })
}

// DELETE /api/admin/licenses/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = params
  if (!id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 })

  const supabase = createServerClient()

  const { error } = await supabase.from('licenses').delete().eq('id', id)
  if (error) return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })

  return NextResponse.json({ success: true })
}
