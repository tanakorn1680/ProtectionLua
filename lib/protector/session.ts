/**
 * Runtime Session JWT
 * แยกจาก License JWT เพื่อ separation of concerns
 * ใช้ LICENSE_JWT_SECRET เดียวกัน แต่ type claim ต่างกัน
 * อายุสั้น (5 นาที default) และ single-use (revoked ใน DB หลัง payload fetch)
 */

import { SignJWT, jwtVerify } from 'jose'

function getSecret() {
  const s = process.env.LICENSE_JWT_SECRET
  if (!s || s.length < 32) throw new Error('LICENSE_JWT_SECRET too short')
  return new TextEncoder().encode(s)
}

export interface RuntimeSessionPayload {
  type: 'runtime_session'
  protection_id: string
  license_id: string
  license_key: string
  device_id: string | null
  session_db_id: string   // references runtime_sessions.id for revocation
}

const SESSION_EXPIRE_MINUTES = 5  // hard-coded short lifetime

export async function signRuntimeSession(
  payload: Omit<RuntimeSessionPayload, 'type'>
): Promise<string> {
  return new SignJWT({ ...payload, type: 'runtime_session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_EXPIRE_MINUTES}m`)
    .sign(getSecret())
}

export async function verifyRuntimeSession(
  token: string
): Promise<RuntimeSessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    if (payload.type !== 'runtime_session') return null
    return payload as unknown as RuntimeSessionPayload
  } catch {
    return null
  }
}

export { SESSION_EXPIRE_MINUTES }
