/**
 * GET  /api/admin/scripts       — ดูรายการ scripts ทั้งหมด
 * POST /api/admin/scripts       — อัปโหลด .lua → encrypt → เก็บ DB → ส่ง loader กลับ
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { encryptScript } from '@/lib/crypto'
import { generateLoader } from '@/lib/loader'

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

    // รับ multipart/form-data เท่านั้น
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const licenseId = formData.get('license_id') as string | null

    if (!file || !licenseId) {
      return NextResponse.json({ error: 'กรุณาส่ง file และ license_id' }, { status: 400 })
    }
    if (!file.name.endsWith('.lua')) {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ .lua เท่านั้น' }, { status: 400 })
    }
    if (file.size > 512 * 1024) {
      return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 512KB' }, { status: 400 })
    }

    const supabase = createServerClient()

    // ตรวจสอบ license
    const { data: lic, error: licError } = await supabase
      .from('licenses')
      .select('id, license_key, name')
      .eq('id', licenseId)
      .single()

    if (licError || !lic) {
      return NextResponse.json({ error: 'ไม่พบ License นี้' }, { status: 404 })
    }

    // อ่านและ encrypt
    const luaCode = await file.text()
    const encrypted = await encryptScript(luaCode)

    // upsert (1 license = 1 script เสมอ)
    const { data: existing } = await supabase
      .from('scripts')
      .select('id, version')
      .eq('license_id', licenseId)
      .single()

    let scriptId: string
    let version: number

    if (existing) {
      version = existing.version + 1
      const { error: upErr } = await supabase
        .from('scripts')
        .update({
          filename: file.name,
          encrypted_code: encrypted.encrypted_code,
          iv: encrypted.iv,
          auth_tag: encrypted.auth_tag,
          version,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
      scriptId = existing.id
    } else {
      version = 1
      const { data: ins, error: insErr } = await supabase
        .from('scripts')
        .insert({
          license_id: licenseId,
          filename: file.name,
          encrypted_code: encrypted.encrypted_code,
          iv: encrypted.iv,
          auth_tag: encrypted.auth_tag,
          version,
        })
        .select('id')
        .single()

      if (insErr || !ins) return NextResponse.json({ error: insErr?.message ?? 'Insert failed' }, { status: 500 })
      scriptId = ins.id
    }

    // สร้าง loader content พร้อม license key ฝังไว้
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? `https://${request.headers.get('host')}`
    const loaderContent = generateLoader(lic.license_key, apiBase)
    const loaderFilename = `loader_${lic.license_key.replace(/[^a-zA-Z0-9]/g, '_')}.lua`

    return NextResponse.json({
      success: true,
      script: { id: scriptId, filename: file.name, version },
      loader: {
        filename: loaderFilename,
        content: loaderContent,
      },
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
