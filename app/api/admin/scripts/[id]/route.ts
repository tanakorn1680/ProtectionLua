/**
 * GET    /api/admin/scripts/[id]/loader  — download loader ภายหลัง
 * DELETE /api/admin/scripts/[id]         — ลบ script
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase/server'
import { generateLoader } from '@/lib/loader'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { data: script, error } = await supabase
    .from('scripts')
    .select(`
      id,
      filename,
      license_id,
      licenses (
        license_key,
        name
      )
    `)
    .eq('id', params.id)
    .single()

  if (error || !script) {
    return NextResponse.json({ error: 'ไม่พบ Script' }, { status: 404 })
  }

  const lic = script.licenses as { license_key: string; name: string | null } | null
  if (!lic) {
    return NextResponse.json({ error: 'ไม่พบข้อมูล License' }, { status: 500 })
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? `https://${request.headers.get('host')}`
  const loaderContent = generateLoader(lic.license_key, apiBase)
  const loaderFilename = `loader_${lic.license_key.replace(/[^a-zA-Z0-9]/g, '_')}.lua`

  // ส่งกลับเป็น JSON ให้ frontend ทำ download เอง (ใช้ pattern เดิมที่ fix ไปแล้ว)
  return NextResponse.json({
    success: true,
    loader: {
      filename: loaderFilename,
      content: loaderContent,
    },
  })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireAdmin(request)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()

  const { error } = await supabase
    .from('scripts')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
