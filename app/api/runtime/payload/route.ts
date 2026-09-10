import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/license'
import { verifyRuntimeSession } from '@/lib/protector/session'
import { hashToken, verifyIntegrity, prepareDeliveryChunks, CHUNK_SIZE } from '@/lib/protector/engine'
import { checkRateLimit } from '@/lib/rateLimit'

function deny(reason: string, status = 200) {
  return NextResponse.json({ success: false, reason }, { status })
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) ?? 'unknown'

  // Rate limit: 10 req/min per IP
  if (!checkRateLimit(`rtpayload:${ip}`, 10, 60_000)) {
    return deny('rate_limited', 429)
  }

  let body: { protection_id?: string; session_token?: string }
  try {
    body = await request.json()
  } catch {
    return deny('invalid_request', 400)
  }

  const { protection_id, session_token } = body

  if (typeof protection_id !== 'string' || !protection_id.startsWith('PRT-')) {
    return deny('invalid_request', 400)
  }
  if (typeof session_token !== 'string' || !session_token) {
    return deny('invalid_request', 400)
  }

  const supabase = createServerClient()

  // 1. Verify JWT signature and expiry
  const sessionPayload = await verifyRuntimeSession(session_token)
  if (!sessionPayload) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'invalid or expired session token',
    })
    return deny('invalid_session')
  }

  // 2. protection_id ต้องตรงกับที่อยู่ใน token
  if (sessionPayload.protection_id !== protection_id) {
    return deny('invalid_session')
  }

  // 3. ตรวจ session ใน DB — ต้องไม่ถูก revoke
  const tokenHash = hashToken(session_token)

  const { data: sessionRow, error: sessionErr } = await supabase
    .from('runtime_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .single()

  if (sessionErr || !sessionRow) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'session not found in db',
    })
    return deny('invalid_session')
  }

  if (sessionRow.revoked_at !== null) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'session was revoked',
    })
    return deny('session_revoked')
  }

  if (new Date(sessionRow.expires_at) < new Date()) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'session expired',
    })
    return deny('session_expired')
  }

  // 4. ตรวจ protection status
  const { data: script, error: scriptErr } = await supabase
    .from('protected_scripts')
    .select('status, payload_storage_path')
    .eq('protection_id', protection_id)
    .single()

  if (scriptErr || !script) {
    return deny('invalid_protection')
  }

  if (script.status === 'disabled') {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'disabled',
      ip,
    })
    return deny('disabled')
  }

  if (!script.payload_storage_path) {
    return deny('payload_not_ready')
  }

  // 5. Revoke session BEFORE delivering payload (single-use)
  await supabase
    .from('runtime_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionRow.id)

  // 6. ดาวน์โหลด payload จาก private storage
  const { data: payloadFile, error: downloadErr } = await supabase.storage
    .from('lua-payload')
    .download(script.payload_storage_path)

  if (downloadErr || !payloadFile) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'failed to fetch payload from storage',
    })
    return deny('server_error', 500)
  }

  const payloadBuffer = Buffer.from(await payloadFile.arrayBuffer())

  // 7. Verify payload integrity
  if (!verifyIntegrity(payloadBuffer)) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: 'payload integrity check failed',
    })
    return deny('server_error', 500)
  }

  // 8. Prepare chunk delivery (decrypt → obfuscate → split 512-byte chunks → XOR per chunk)
  let delivery: { chunks: string[]; checksum: string; count: number }
  try {
    delivery = await prepareDeliveryChunks(payloadBuffer, session_token)
  } catch (e) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'payload_denied',
      ip,
      detail: e instanceof Error ? e.message : 'prepare failed',
    })
    return deny('server_error', 500)
  }

  // 9. Update last_used
  await Promise.all([
    supabase
      .from('protected_scripts')
      .update({ last_used_at: new Date().toISOString() })
      .eq('protection_id', protection_id),
    supabase
      .from('runtime_sessions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('id', sessionRow.id),
  ])

  // 10. Log success
  await supabase.from('protection_logs').insert({
    protection_id,
    license_id: sessionRow.license_id,
    device_id: sessionRow.device_id,
    event_type: 'payload_delivered',
    ip,
  })

  // Response: chunks array + checksum + count + chunk_size (for Loader validation)
  return NextResponse.json({
    success: true,
    chunks: delivery.chunks,
    checksum: delivery.checksum,
    count: delivery.count,
    chunk_size: CHUNK_SIZE,
    algo: 2,
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
