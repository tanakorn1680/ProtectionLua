import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { signLicenseToken } from '@/lib/jwt'
import { getClientIp, getEffectiveStatus, isValidDeviceId } from '@/lib/license'
import { checkRateLimit } from '@/lib/rateLimit'
import type { CheckResponse } from '@/lib/types'

type DenyReason = 'invalid_license' | 'disabled' | 'banned' | 'expired' | 'device_mismatch' | 'invalid_request'

function deny(reason: DenyReason, status = 200): NextResponse {
  return NextResponse.json(
    { success: false, allowed: false, reason } satisfies CheckResponse,
    { status }
  )
}

export async function POST(request: NextRequest) {
  // Rate limit: 20 requests/minute per IP
  const ip = getClientIp(request) ?? 'unknown'
  if (!checkRateLimit(`check:${ip}`, 20, 60_000)) {
    return deny('invalid_request', 429)
  }

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return deny('invalid_request', 400)
  }

  if (typeof body !== 'object' || body === null) {
    return deny('invalid_request', 400)
  }

  const { license, device_id } = body as Record<string, unknown>

  if (typeof license !== 'string' || license.length < 1) {
    return deny('invalid_request', 400)
  }

  const licenseKey = license.trim().toUpperCase()

  // device_id is optional (checked per-license binding setting)
  const deviceId = typeof device_id === 'string' ? device_id.trim() : null

  const supabase = createServerClient()

  // Fetch license
  const { data: lic, error } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey)
    .single()

  if (error || !lic) {
    // Log failed attempt
    await supabase.from('license_logs').insert({
      license_id: null,
      license_key: licenseKey,
      event_type: 'invalid_license',
      device_id: deviceId,
      ip,
    })
    return deny('invalid_license')
  }

  // Check effective status
  const effectiveStatus = getEffectiveStatus(lic)

  if (effectiveStatus === 'banned') {
    await supabase.from('license_logs').insert({
      license_id: lic.id,
      license_key: licenseKey,
      event_type: 'banned',
      device_id: deviceId,
      ip,
    })
    return deny('banned')
  }

  if (effectiveStatus === 'disabled') {
    await supabase.from('license_logs').insert({
      license_id: lic.id,
      license_key: licenseKey,
      event_type: 'disabled',
      device_id: deviceId,
      ip,
    })
    return deny('disabled')
  }

  if (effectiveStatus === 'expired') {
    await supabase.from('license_logs').insert({
      license_id: lic.id,
      license_key: licenseKey,
      event_type: 'expired',
      device_id: deviceId,
      ip,
    })
    return deny('expired')
  }

  // Device binding check
  if (lic.device_binding_enabled) {
    if (!deviceId || !isValidDeviceId(deviceId)) {
      return deny('invalid_request', 400)
    }

    if (!lic.device_id) {
      // First time — bind device
      await supabase
        .from('licenses')
        .update({ device_id: deviceId, last_seen: new Date().toISOString(), last_ip: ip })
        .eq('id', lic.id)

      await supabase.from('license_logs').insert({
        license_id: lic.id,
        license_key: licenseKey,
        event_type: 'device_bound',
        device_id: deviceId,
        ip,
      })
    } else if (lic.device_id !== deviceId) {
      await supabase.from('license_logs').insert({
        license_id: lic.id,
        license_key: licenseKey,
        event_type: 'device_mismatch',
        device_id: deviceId,
        ip,
      })
      return deny('device_mismatch')
    }
  }

  // Fetch token expire setting
  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'token_expire_minutes')
    .single()

  const expireMinutes = parseInt(settingRow?.value ?? '60', 10)

  // Generate temporary token
  const token = await signLicenseToken(
    {
      license_id: lic.id,
      license_key: licenseKey,
      device_id: deviceId,
      type: 'license_token',
    },
    expireMinutes
  )

  // Update last_seen and last_ip
  await supabase
    .from('licenses')
    .update({ last_seen: new Date().toISOString(), last_ip: ip })
    .eq('id', lic.id)

  // Log success
  await supabase.from('license_logs').insert({
    license_id: lic.id,
    license_key: licenseKey,
    event_type: 'check_success',
    device_id: deviceId,
    ip,
  })

  return NextResponse.json({
    success: true,
    allowed: true,
    status: effectiveStatus,
    expires_at: lic.expires_at,
    token,
  } satisfies CheckResponse)
}

// Block other HTTP methods
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
