/**
 * DELETE /api/admin/protected-files/[id]
 * ลบ Protected File (DB record + Storage files)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await requireAdmin(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = params
  const supabase = createServerClient()

  // ดึง record ก่อน ตรวจสอบว่าเป็นของ admin นี้
  const { data: record, error: fetchErr } = await supabase
    .from('protected_files')
    .select('id, admin_id, storage_path')
    .eq('id', id)
    .eq('admin_id', admin.userId) // เฉพาะของตัวเอง
    .single()

  if (fetchErr || !record) {
    return NextResponse.json({ error: 'ไม่พบไฟล์' }, { status: 404 })
  }

  // ลบไฟล์จาก Storage ถ้ามี
  if (record.storage_path) {
    const filesToDelete = [
      `${record.storage_path}/original.lua`,
      `${record.storage_path}/protected.lua`,
    ]
    // ไม่ throw ถ้า storage ลบไม่ได้ (อาจไม่มีไฟล์)
    await supabase.storage.from('protected-files').remove(filesToDelete)
  }

  // ลบ DB record
  const { error: deleteErr } = await supabase
    .from('protected_files')
    .delete()
    .eq('id', id)
    .eq('admin_id', admin.userId)

  if (deleteErr) {
    return NextResponse.json({ error: 'ไม่สามารถลบได้' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
