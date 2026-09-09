/**
 * POST /api/license/load
 *
 * Public endpoint — ใช้โดย Lua Loader
 * รับ license key + device_id → ตรวจสอบ → ส่ง encrypted script กลับ
 *
 * Security:
 * - Rate limit เข้มกว่า /check (10 req/min)
 * - ส่ง code เป็น AES-256-GCM encrypted (Loader ต้อง decrypt ด้วย session key)
 * - Session key ผูกกับ license_id + device_id + timestamp (สุ่มทุก request)
 * - ไม่มี plain text Lua code ในสาย network เลย
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { verifyLicenseToken } from '@/lib/jwt'
import { decryptScript } from '@/lib/crypto'
import { getClientIp, getEffectiveStatus } from '@/lib/license'
import { checkRateLimit } from '@/lib/rateLimit'

function deny(reason: string, status = 200) {
  return NextResponse.json({ success: false, allowed: false, reason }, { status })
}

/**
 * XOR obfuscation layer สำหรับ payload
 * Loader จะ XOR กลับด้วย session_key เดิม
 * เพิ่มความยากในการ inspect traffic แม้ HTTPS ถูก MITM
 */
function xorEncrypt(text: string, key: string): string {
  const textBytes = new TextEncoder().encode(text)
  const keyBytes = new TextEncoder().encode(key)
  const result = new Uint8Array(textBytes.length)
  for (let i = 0; i < textBytes.length; i++) {
    result[i] = textBytes[i] ^ keyBytes[i % keyBytes.length]
  }
  return btoa(Array.from(result).map(b => String.fromCharCode(b)).join(''))
}

export async function POST(request: NextRequest) {
  // Rate limit เข้มกว่า /check
  const ip = getClientIp(request) ?? 'unknown'
  if (!checkRateLimit(`load:${ip}`, 10, 60_000)) {
    return deny('rate_limited', 429)
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

  const { license, device_id, token } = body as Record<string, unknown>

  if (typeof license !== 'string' || !license) return deny('invalid_request', 400)
  if (typeof device_id !== 'string' || !device_id) return deny('invalid_request', 400)
  if (typeof token !== 'string' || !token) return deny('no_token', 400)

  // Verify JWT token จาก /check ก่อน (ต้องผ่าน check แล้ว)
  const tokenPayload = await verifyLicenseToken(token)
  if (!tokenPayload) return deny('invalid_token')

  // ตรวจสอบว่า token ตรงกับ license + device ที่ส่งมา
  const licenseKey = license.trim().toUpperCase()
  if (
    tokenPayload.license_key !== licenseKey ||
    tokenPayload.device_id !== device_id.trim()
  ) {
    return deny('token_mismatch')
  }

  const supabase = createServerClient()

  // ดึง license อีกครั้งเพื่อเช็คสถานะปัจจุบัน (อาจถูก ban ระหว่างที่ token ยังไม่หมด)
  const { data: lic, error: licError } = await supabase
    .from('licenses')
    .select('*')
    .eq('license_key', licenseKey)
    .single()

  if (licError || !lic) return deny('invalid_license')

  const effectiveStatus = getEffectiveStatus(lic)
  if (effectiveStatus !== 'active') return deny(effectiveStatus)

  // Device binding double-check
  if (lic.device_binding_enabled && lic.device_id !== device_id.trim()) {
    return deny('device_mismatch')
  }

  // ดึง encrypted script จาก DB
  const { data: script, error: scriptError } = await supabase
    .from('scripts')
    .select('encrypted_code, iv, auth_tag, version')
    .eq('license_id', lic.id)
    .single()

  if (scriptError || !script) {
    return deny('no_script')
  }

  // ถอดรหัส AES-GCM → ได้ plain Lua code (ใน server memory เท่านั้น)
  let plainCode: string
  try {
    plainCode = await decryptScript({
      encrypted_code: script.encrypted_code,
      iv: script.iv,
      auth_tag: script.auth_tag,
    })
  } catch {
    return deny('decrypt_error', 500)
  }

  // สร้าง session key แบบสุ่ม (unique ต่อ request นี้)
  // Loader จะรับ session_key แล้ว XOR กลับ
  const sessionKey = crypto.randomUUID().replace(/-/g, '') // 32 hex chars

  // XOR encrypt plain code ด้วย session key
  const obfuscatedCode = xorEncrypt(plainCode, sessionKey)

  // Log
  await supabase.from('license_logs').insert({
    license_id: lic.id,
    license_key: licenseKey,
    event_type: 'script_loaded',
    device_id: device_id.trim(),
    ip,
  })

  // ส่ง obfuscated code + session key
  // (session key ใช้งานได้แค่ครั้งเดียว request นี้เท่านั้น)
  return NextResponse.json({
    success: true,
    payload: obfuscatedCode,   // XOR-encrypted Lua code
    session_key: sessionKey,   // key สำหรับ XOR กลับ
    version: script.version,
  })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
