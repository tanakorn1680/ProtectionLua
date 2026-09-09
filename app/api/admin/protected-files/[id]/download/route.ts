/**
 * GET /api/admin/protected-files/[id]/download
 *
 * Server ตรวจสอบสิทธิ์ → สร้าง Signed URL → redirect ให้ download
 * ไม่เปิด Storage URL แบบ public
 * Signed URL มีอายุ 60 วินาที
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

const SIGNED_URL_EXPIRES = 60 // seconds

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  const supabase = createServerClient()

  // ดึง record ตรวจสอบ ownership
  const { data: record, error: fetchErr } = await supabase
    .from('protected_files')
    .select('id, admin_id, storage_path, protected_filename, status')
    .eq('id', id)
    .eq('admin_id', admin.userId)
    .single()

  if (fetchErr || !record) {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }

  if (record.status !== 'completed') {
    return NextResponse.json({ error: 'ไฟล์ยังไม่พร้อมสำหรับการดาวน์โหลด' }, { status: 400 })
  }

  if (!record.storage_path) {
    return NextResponse.json({ error: 'ไม่พบ storage path' }, { status: 500 })
  }

  const storagePath = `${record.storage_path}/protected.lua`

  // สร้าง Signed URL (ใช้ได้ 60 วินาที)
  const { data: signedData, error: signErr } = await supabase.storage
    .from('protected-files')
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRES, {
      download: record.protected_filename ?? 'protected.lua',
    })

  if (signErr || !signedData) {
    return NextResponse.json({ error: 'ไม่สามารถสร้าง download URL ได้' }, { status: 500 })
  }

  // Log download
  await supabase.from('license_logs').insert({
    license_id: null,
    license_key: `file_download:${id.slice(0, 8)}`,
    event_type: 'check_success', // reuse log table
    device_id: null,
    ip: request.headers.get('x-forwarded-for') ?? 'unknown',
  }).then(() => {}) // fire-and-forget, don't await error

  // Redirect ไปยัง Signed URL
  return NextResponse.redirect(signedData.signedUrl)
}
