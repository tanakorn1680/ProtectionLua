import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { protect, generateProtectionId } from '@/lib/protector/engine'
import { getClientIp } from '@/lib/license'

const MAX_FILE_SIZE = 512 * 1024  // 512 KB — Lua scripts ไม่ควรใหญ่กว่านี้

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // รับ multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const licenseId = formData.get('license_id') as string | null

  if (!file) return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 400 })
  if (!licenseId) return NextResponse.json({ error: 'กรุณาเลือก License' }, { status: 400 })

  // ตรวจสอบนามสกุล
  const filename = file.name
  if (!filename.endsWith('.lua')) {
    return NextResponse.json({ error: 'อนุญาตเฉพาะไฟล์ .lua' }, { status: 400 })
  }

  // ตรวจสอบขนาด
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `ไฟล์ใหญ่เกิน ${MAX_FILE_SIZE / 1024}KB` }, { status: 400 })
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'ไฟล์ว่างเปล่า' }, { status: 400 })
  }

  const supabase = createServerClient()

  // ตรวจสอบ License
  const { data: license, error: licErr } = await supabase
    .from('licenses')
    .select('id, status, expires_at, license_key')
    .eq('id', licenseId)
    .single()

  if (licErr || !license) {
    return NextResponse.json({ error: 'ไม่พบ License' }, { status: 404 })
  }
  if (license.status === 'banned' || license.status === 'disabled') {
    return NextResponse.json({ error: 'License ถูกปิดใช้งาน' }, { status: 400 })
  }
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return NextResponse.json({ error: 'License หมดอายุ' }, { status: 400 })
  }

  // อ่าน source
  const sourceBytes = await file.arrayBuffer()
  const sourceText = new TextDecoder('utf-8').decode(sourceBytes)

  // ตรวจ MIME/content — ตรวจว่าเป็น text ไม่ใช่ binary
  if (sourceText.includes('\x00')) {
    return NextResponse.json({ error: 'ไฟล์ไม่ใช่ Lua source code' }, { status: 400 })
  }

  const protectionId = generateProtectionId()
  const sourcePath = `${protectionId}/source.lua`
  const payloadPath = `${protectionId}/payload.bin`

  // อัปโหลด source ไปยัง private bucket
  const { error: srcUploadErr } = await supabase.storage
    .from('lua-source')
    .upload(sourcePath, sourceBytes, {
      contentType: 'text/plain',
      upsert: false,
    })

  if (srcUploadErr) {
    // Bucket อาจยังไม่ได้สร้าง
    return NextResponse.json({
      error: 'อัปโหลด Source ไม่สำเร็จ: ' + srcUploadErr.message +
        ' — กรุณาสร้าง Bucket "lua-source" (Private) ใน Supabase Storage'
    }, { status: 500 })
  }

  // สร้าง protected payload
  let payloadBuffer: Buffer
  try {
    payloadBuffer = await protect(sourceText)
  } catch (e) {
    // cleanup source
    await supabase.storage.from('lua-source').remove([sourcePath])
    const msg = e instanceof Error ? e.message : 'Protection failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  // อัปโหลด payload ไปยัง private bucket
  const { error: payloadUploadErr } = await supabase.storage
    .from('lua-payload')
    .upload(payloadPath, payloadBuffer, {
      contentType: 'application/octet-stream',
      upsert: false,
    })

  if (payloadUploadErr) {
    await supabase.storage.from('lua-source').remove([sourcePath])
    return NextResponse.json({
      error: 'อัปโหลด Payload ไม่สำเร็จ: ' + payloadUploadErr.message +
        ' — กรุณาสร้าง Bucket "lua-payload" (Private) ใน Supabase Storage'
    }, { status: 500 })
  }

  // บันทึก DB record
  const { data: script, error: dbErr } = await supabase
    .from('protected_scripts')
    .insert({
      protection_id: protectionId,
      admin_id: admin.userId,
      original_filename: filename,
      source_storage_path: sourcePath,
      payload_storage_path: payloadPath,
      license_id: licenseId,
      status: 'active',
    })
    .select()
    .single()

  if (dbErr || !script) {
    // cleanup storage
    await supabase.storage.from('lua-source').remove([sourcePath])
    await supabase.storage.from('lua-payload').remove([payloadPath])
    return NextResponse.json({ error: 'บันทึกข้อมูลไม่สำเร็จ' }, { status: 500 })
  }

  // log
  await supabase.from('protection_logs').insert({
    protection_id: protectionId,
    event_type: 'loader_started',
    ip: getClientIp(request),
    detail: `created by admin ${admin.email}`,
  })

  return NextResponse.json({ data: script }, { status: 201 })
}
