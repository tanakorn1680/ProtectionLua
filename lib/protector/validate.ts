/**
 * validate.ts
 * ตรวจสอบไฟล์ Lua ก่อนประมวลผล
 */

export const MAX_FILE_SIZE = 512 * 1024 // 512 KB

export interface ValidationResult {
  ok: boolean
  error?: string
}

/**
 * ตรวจสอบขนาดและ content type เบื้องต้น
 */
export function validateLuaFile(
  filename: string,
  size: number,
  content: string
): ValidationResult {
  // ตรวจสอบนามสกุลไฟล์
  if (!filename.toLowerCase().endsWith('.lua')) {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ .lua เท่านั้น' }
  }

  // ตรวจสอบขนาดไฟล์
  if (size > MAX_FILE_SIZE) {
    return {
      ok: false,
      error: `ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_FILE_SIZE / 1024}KB)`,
    }
  }

  // ตรวจสอบว่าไม่ใช่ไฟล์ว่าง
  const trimmed = content.trim()
  if (trimmed.length === 0) {
    return { ok: false, error: 'ไฟล์ว่างเปล่า' }
  }

  // ตรวจสอบ binary content (Lua ต้องเป็น text)
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0e-\x1f\x7f]/.test(content.slice(0, 1000))) {
    return { ok: false, error: 'ไฟล์ไม่ใช่ Lua source code (อาจเป็น binary)' }
  }

  return { ok: true }
}
