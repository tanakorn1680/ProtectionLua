/**
 * POST /api/admin/protect
 *
 * รับ multipart/form-data:
 *   file: .lua file
 *   level: 'basic' | 'standard' | 'strong'
 *   license_mode: 'none' | 'require_validation'
 *   license_id?: string (optional, ถ้า mode = require_validation)
 *
 * Flow: validate → protect → upload to Supabase Storage → save DB record
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'
import { protectLua } from '@/lib/protector'
import { validateLuaFile, MAX_FILE_SIZE } from '@/lib/protector/validate'
import type { ProtectionLevel, LicenseMode } from '@/lib/types'

export const runtime = 'nodejs'

// Vercel max body size for hobby/pro: 4.5MB — ไฟล์ Lua เล็กมากพอ
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse multipart form
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const level = (formData.get('level') as string) ?? 'basic'
  const licenseMode = (formData.get('license_mode') as string) ?? 'none'
  const licenseId = (formData.get('license_id') as string) || undefined

  // --- Validate inputs ---
  if (!file) {
    return NextResponse.json({ error: 'กรุณาเลือกไฟล์' }, { status: 400 })
  }
  if (!['basic', 'standard', 'strong'].includes(level)) {
    return NextResponse.json({ error: 'ระดับการป้องกันไม่ถูกต้อง' }, { status: 400 })
  }
  if (!['none', 'require_validation'].includes(licenseMode)) {
    return NextResponse.json({ error: 'License mode ไม่ถูกต้อง' }, { status: 400 })
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_FILE_SIZE / 1024}KB)` },
      { status: 400 }
    )
  }

  const filename = file.name
  const content = await file.text()

  const fileValidation = validateLuaFile(filename, file.size, content)
  if (!fileValidation.ok) {
    return NextResponse.json({ error: fileValidation.error }, { status: 400 })
  }

  const supabase = createServerClient()

  // ตรวจสอบ license_id ถ้าระบุมา
  if (licenseId) {
    const { data: lic, error: licErr } = await supabase
      .from('licenses')
      .select('id')
      .eq('id', licenseId)
      .single()
    if (licErr || !lic) {
      return NextResponse.json({ error: 'License ที่ระบุไม่พบในระบบ' }, { status: 400 })
    }
  }

  // --- Create DB record (status: processing) ---
  const { data: record, error: insertErr } = await supabase
    .from('protected_files')
    .insert({
      admin_id: admin.userId,
      original_filename: filename,
      original_size: file.size,
      protection_level: level as ProtectionLevel,
      license_mode: licenseMode as LicenseMode,
      license_id: licenseId ?? null,
      status: 'processing',
    })
    .select()
    .single()

  if (insertErr || !record) {
    return NextResponse.json({ error: 'ไม่สามารถสร้าง record ได้' }, { status: 500 })
  }

  const jobId = record.id

  // --- Run Protection Engine ---
  const apiBase =
    process.env.NEXT_PUBLIC_APP_URL ??
    `https://${request.headers.get('host') ?? 'localhost'}`

  const result = await protectLua({
    filename,
    content,
    level: level as ProtectionLevel,
    licenseMode: licenseMode as LicenseMode,
    licenseId,
    apiBase,
  })

  if (!result.ok) {
    // Update status to failed
    await supabase
      .from('protected_files')
      .update({
        status: 'failed',
        error_message: result.error,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)

    return NextResponse.json({ error: result.error }, { status: 422 })
  }

  // --- Upload original + protected to Supabase Storage ---
  const storagePath = `${admin.userId}/${jobId}`
  const protectedFilename = result.filename

  // Upload original
  const { error: origUploadErr } = await supabase.storage
    .from('protected-files')
    .upload(
      `${storagePath}/original.lua`,
      new Blob([content], { type: 'text/plain' }),
      { contentType: 'text/plain', upsert: false }
    )

  if (origUploadErr) {
    await supabase
      .from('protected_files')
      .update({
        status: 'failed',
        error_message: `Storage upload error: ${origUploadErr.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return NextResponse.json({ error: 'ไม่สามารถ upload ไฟล์ต้นฉบับได้' }, { status: 500 })
  }

  // Upload protected
  const { error: protUploadErr } = await supabase.storage
    .from('protected-files')
    .upload(
      `${storagePath}/protected.lua`,
      new Blob([result.code], { type: 'text/plain' }),
      { contentType: 'text/plain', upsert: false }
    )

  if (protUploadErr) {
    await supabase
      .from('protected_files')
      .update({
        status: 'failed',
        error_message: `Storage upload error: ${protUploadErr.message}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', jobId)
    return NextResponse.json({ error: 'ไม่สามารถ upload ไฟล์ protected ได้' }, { status: 500 })
  }

  // --- Update DB record to completed ---
  const { data: updated, error: updateErr } = await supabase
    .from('protected_files')
    .update({
      status: 'completed',
      protected_filename: protectedFilename,
      protected_size: result.size,
      storage_path: storagePath,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: 'ไม่สามารถ update สถานะได้' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    id: jobId,
    filename: protectedFilename,
    size: result.size,
    record: updated,
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
