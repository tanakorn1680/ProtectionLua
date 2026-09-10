import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { getEffectiveStatus, getClientIp, isValidDeviceId } from '@/lib/license'
import { signRuntimeSession, SESSION_EXPIRE_MINUTES } from '@/lib/protector/session'
import { hashToken } from '@/lib/protector/engine'
import { checkRateLimit } from '@/lib/rateLimit'
import type { RuntimeSessionRequest } from '@/lib/types/protector'

function deny(reason: string, status = 200) {
  return NextResponse.json({ success: false, reason }, { status })
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request) ?? 'unknown'

  // Rate limit: 10 req/min per IP (stricter than license check)
  if (!checkRateLimit(`rtsession:${ip}`, 10, 60_000)) {
    return deny('rate_limited', 429)
  }

  let body: RuntimeSessionRequest
  try {
    body = await request.json()
  } catch {
    return deny('invalid_request', 400)
  }

  const { protection_id, license, device_id } = body

  if (typeof protection_id !== 'string' || !protection_id.startsWith('PRT-')) {
    return deny('invalid_request', 400)
  }
  if (typeof license !== 'string' || license.length < 1) {
    return deny('invalid_request', 400)
  }

  const licenseKey = license.trim().toUpperCase()
  const deviceId = typeof device_id === 'string' ? device_id.trim() : null

  const supabase = createServerClient()

  // 1. ตรวจสอบว่า protection_id มีอยู่และ active
  const { data: script, error: scriptErr } = await supabase
    .from('protected_scripts')
    .select('protection_id, license_id, status')
    .eq('protection_id', protection_id)
    .single()

  if (scriptErr || !script) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'license_failed',
      ip,
      detail: 'protection not found',
    })
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

  // 2. ตรวจสอบ License
  const { data: lic, error: licErr } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey)
    .single()

  if (licErr || !lic) {
    await supabase.from('protection_logs').insert({
      protection_id,
      event_type: 'license_failed',
      ip,
      detail: 'invalid license key',
    })
    return deny('invalid_license')
  }

  // ตรวจว่า license ที่ใช้ตรงกับที่ผูกไว้กับ protection
  if (script.license_id && lic.id !== script.license_id) {
    await supabase.from('protection_logs').insert({
      protection_id,
      license_id: lic.id,
      event_type: 'license_failed',
      ip,
      detail: 'license not bound to this protection',
    })
    return deny('invalid_license')
  }

  // effective status
  const effectiveStatus = getEffectiveStatus(lic)
  if (effectiveStatus === 'banned') {
    await supabase.from('protection_logs').insert({
      protection_id, license_id: lic.id, event_type: 'license_failed', ip, detail: 'banned',
    })
    return deny('banned')
  }
  if (effectiveStatus === 'disabled') {
    await supabase.from('protection_logs').insert({
      protection_id, license_id: lic.id, event_type: 'license_failed', ip, detail: 'disabled',
    })
    return deny('disabled')
  }
  if (effectiveStatus === 'expired') {
    await supabase.from('protection_logs').insert({
      protection_id, license_id: lic.id, event_type: 'expired', ip,
    })
    return deny('expired')
  }

  // 3. Device Binding
  if (lic.device_binding_enabled) {
    if (!deviceId || !isValidDeviceId(deviceId)) {
      return deny('invalid_request', 400)
    }

    if (!lic.device_id) {
      // bind
      await supabase
        .from('licenses')
        .update({ device_id: deviceId, last_seen: new Date().toISOString(), last_ip: ip })
        .eq('id', lic.id)
    } else if (lic.device_id !== deviceId) {
      await supabase.from('protection_logs').insert({
        protection_id, license_id: lic.id, event_type: 'device_mismatch', device_id: deviceId, ip,
      })
      return deny('device_mismatch')
    }
  }

  // 4. สร้าง session record in DB (ก่อนสร้าง JWT เพื่อเอา id)
  const expiresAt = new Date(Date.now() + SESSION_EXPIRE_MINUTES * 60_000).toISOString()

  // placeholder hash — จะ update หลังสร้าง JWT
  const { data: sessionRow, error: sessionErr } = await supabase
    .from('runtime_sessions')
    .insert({
      protection_id,
      license_id: lic.id,
      device_id: deviceId,
      token_hash: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (sessionErr || !sessionRow) {
    return deny('server_error', 500)
  }

  // 5. Sign JWT with session DB id
  const token = await signRuntimeSession({
    protection_id,
    license_id: lic.id,
    license_key: licenseKey,
    device_id: deviceId,
    session_db_id: sessionRow.id,
  })

  // 6. Store token hash
  const tokenHash = hashToken(token)
  await supabase
    .from('runtime_sessions')
    .update({ token_hash: tokenHash })
    .eq('id', sessionRow.id)

  // 7. Update license last_seen
  await supabase
    .from('licenses')
    .update({ last_seen: new Date().toISOString(), last_ip: ip })
    .eq('id', lic.id)

  // 8. Log
  await supabase.from('protection_logs').insert({
    protection_id,
    license_id: lic.id,
    device_id: deviceId,
    event_type: 'session_created',
    ip,
  })

  return NextResponse.json({
    success: true,
    session_token: token,
    expires_at: expiresAt,
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
