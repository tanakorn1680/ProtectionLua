import type { License, LicenseStatus, LicenseWithStatus } from './types'

// สร้าง License Key รูปแบบ XXXX-XXXX-XXXX-XXXX
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // ตัดอักษรที่สับสน
  const segment = () =>
    Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')

  return `${segment()}-${segment()}-${segment()}-${segment()}`
}

// คำนวณ effective status (รวมการหมดอายุ)
export function getEffectiveStatus(license: License): LicenseStatus {
  if (license.status === 'banned') return 'banned'
  if (license.status === 'disabled') return 'disabled'
  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return 'expired'
  }
  return 'active'
}

export function withEffectiveStatus(license: License): LicenseWithStatus {
  return {
    ...license,
    effective_status: getEffectiveStatus(license),
  }
}

// ดึง Client IP จาก Request Headers (Vercel/Cloudflare)
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') ?? null
}

// Validate License Key format
export function isValidLicenseKeyFormat(key: string): boolean {
  return /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(key)
}

// Validate Device ID (ไม่เกิน 128 ตัวอักษร ไม่ว่าง)
export function isValidDeviceId(id: string): boolean {
  return typeof id === 'string' && id.length >= 1 && id.length <= 128
}

// Status label สำหรับแสดง UI
export const STATUS_LABELS: Record<LicenseStatus, string> = {
  active: 'ใช้งานได้',
  disabled: 'ปิดใช้งาน',
  banned: 'แบน',
  expired: 'หมดอายุ',
}

export const STATUS_COLORS: Record<LicenseStatus, string> = {
  active: 'text-status-active bg-status-active/10 border-status-active/20',
  disabled: 'text-status-disabled bg-status-disabled/10 border-status-disabled/20',
  banned: 'text-status-banned bg-status-banned/10 border-status-banned/20',
  expired: 'text-status-expired bg-status-expired/10 border-status-expired/20',
}
