/**
 * Admin API: /api/admin/scripts
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { encryptScript } from '@/lib/crypto'

export const config = {
  api: {
    bodyParser: false,
  },
}

export async function GET(request: NextRequest) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('scripts')
    .select(`
      id,
      filename,
      version,
      created_at,
      updated_at,
      license_id,
      licenses (
        license_key,
        name,
        status
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin(request)
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let licenseId: string
    let filename: string
    let luaCode: string

    const contentType = request.headers.get('content-type') ?? ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null
      const lid = formData.get('license_id') as string | null

      if (!file || !lid) {
        return NextResponse.json({ error: 'Missing file or license_id' }, { status: 400 })
      }

      if (!file.name.endsWith('.lua')) {
        return NextResponse.json({ error: 'Only .lua files allowed' }, { status: 400 })
      }

      if (file.size > 1024 * 1024) {
        return NextResponse.json({ error: 'File too large (max 1MB)' }, { status: 400 })
      }

      luaCode = await file.text()
      filename = file.name
      licenseId = lid
    } else {
      const body = await request.json()
      if (!body.license_id || !body.code || !body.filename) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
      }
      luaCode = body.code
      filename = body.filename
      licenseId = body.license_id
    }

    const supabase = createServerClient()

    const { data: lic, error: licError } = await supabase
      .from('licenses')
      .select('id')
      .eq('id', licenseId)
      .single()

    if (licError || !lic) {
      return NextResponse.json({ error: 'License not found' }, { status: 404 })
    }

    const encrypted = await encryptScript(luaCode)

    const { data: existing } = await supabase
      .from('scripts')
      .select('id, version')
      .eq('license_id', licenseId)
      .single()

    let result
    if (existing) {
      const { data, error } = await supabase
        .from('scripts')
        .update({
          filename,
          encrypted_code: encrypted.encrypted_code,
          iv: encrypted.iv,
          auth_tag: encrypted.auth_tag,
          version: existing.version + 1,
        })
        .eq('id', existing.id)
        .select('id, filename, version')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      result = data
    } else {
      const { data, error } = await supabase
        .from('scripts')
        .insert({
          license_id: licenseId,
          filename,
          encrypted_code: encrypted.encrypted_code,
          iv: encrypted.iv,
          auth_tag: encrypted.auth_tag,
          version: 1,
        })
        .select('id, filename, version')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      result = data
    }

    return NextResponse.json({ success: true, script: result })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
