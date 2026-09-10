import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { generateLoader } from '@/lib/protector/loader'
import { generateProtectionId } from '@/lib/protector/engine'

// PATCH /api/admin/protected/[id] — enable/disable/regenerate
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = createServerClient()

  // fetch current record
  const { data: script, error: fetchErr } = await supabase
    .from('protected_scripts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !script) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // handle regenerate — revoke old sessions, assign new protection_id
  if (body.action === 'regenerate') {
    const newProtectionId = generateProtectionId()

    // revoke all sessions for old protection_id
    await supabase
      .from('runtime_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('protection_id', script.protection_id)
      .is('revoked_at', null)

    // log
    await supabase.from('protection_logs').insert({
      protection_id: script.protection_id,
      event_type: 'session_revoked',
      detail: `regenerated → ${newProtectionId}`,
    })

    const { data: updated, error: updErr } = await supabase
      .from('protected_scripts')
      .update({ protection_id: newProtectionId })
      .eq('id', params.id)
      .select()
      .single()

    if (updErr) return NextResponse.json({ error: 'Regenerate failed' }, { status: 500 })

    return NextResponse.json({ data: updated })
  }

  // handle status change
  const allowed: Record<string, unknown> = {}
  if (typeof body.status === 'string' && ['active', 'disabled'].includes(body.status)) {
    allowed.status = body.status

    // if disabling — revoke all active sessions
    if (body.status === 'disabled') {
      await supabase
        .from('runtime_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('protection_id', script.protection_id)
        .is('revoked_at', null)
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('protected_scripts')
    .update(allowed)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

  return NextResponse.json({ data })
}

// DELETE /api/admin/protected/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const deleteSource = searchParams.get('delete_source') === 'true'

  const supabase = createServerClient()

  const { data: script, error: fetchErr } = await supabase
    .from('protected_scripts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (fetchErr || !script) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // 1. disable + revoke sessions first
  await supabase
    .from('protected_scripts')
    .update({ status: 'disabled' })
    .eq('id', params.id)

  await supabase
    .from('runtime_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('protection_id', script.protection_id)
    .is('revoked_at', null)

  // 2. delete payload always
  if (script.payload_storage_path) {
    await supabase.storage
      .from('lua-payload')
      .remove([script.payload_storage_path])
  }

  // 3. delete source only if confirmed
  if (deleteSource && script.source_storage_path) {
    await supabase.storage
      .from('lua-source')
      .remove([script.source_storage_path])
  }

  // 4. log
  await supabase.from('protection_logs').insert({
    protection_id: script.protection_id,
    event_type: 'session_revoked',
    detail: `deleted by admin ${admin.email}, source_deleted=${deleteSource}`,
  })

  // 5. delete DB record
  await supabase.from('protected_scripts').delete().eq('id', params.id)

  return NextResponse.json({ success: true })
}

// GET /api/admin/protected/[id]/loader — download Loader.lua
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data: script, error } = await supabase
    .from('protected_scripts')
    .select('*')
    .eq('id', params.id)
    .single()

  if (error || !script) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const host = request.headers.get('host') ?? 'localhost:3000'
  const proto = process.env.NODE_ENV === 'production' ? 'https' : 'http'
  const apiEndpoint = `${proto}://${host}`

  const loaderContent = generateLoader({
    protectionId: script.protection_id,
    originalFilename: script.original_filename,
    apiEndpoint,
    createdAt: new Date().toISOString(),
  })

  const basename = script.original_filename.replace(/\.lua$/, '')
  const downloadName = `${basename}-Loader.lua`

  return new NextResponse(loaderContent, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${downloadName}"`,
    },
  })
}
