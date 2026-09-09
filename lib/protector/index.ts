/**
 * lib/protector/index.ts
 * Main Protection Engine
 *
 * Flow: validate → obfuscate → transform → inject license header → generate
 *
 * ⚠️ หมายเหตุ: การป้องกันนี้มีเป้าหมายเพื่อเพิ่มความยากในการวิเคราะห์
 * และแก้ไขไฟล์ ไม่ใช่การป้องกัน Reverse Engineering ได้ 100%
 */

import { validateLuaFile } from './validate'
import { obfuscateBasic, encodeStrings, addIntegrityComment } from './obfuscate'
import { addJunkCode, encodeNumbers, wrapWithIntegrityCheck } from './transform'
import { buildLicenseHeader, buildNoLicenseHeader } from './license'
import type { ProtectionLevel, LicenseMode } from '@/lib/types'

export interface ProtectOptions {
  filename: string
  content: string
  level: ProtectionLevel
  licenseMode: LicenseMode
  licenseId?: string
  /** Public API base URL สำหรับ embed ใน protected file */
  apiBase: string
}

export interface ProtectResult {
  ok: true
  code: string
  size: number
  filename: string
}

export interface ProtectError {
  ok: false
  error: string
}

/** Simple SHA-256 via Web Crypto (Node.js 18+) */
async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text)
  )
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function protectLua(
  opts: ProtectOptions
): Promise<ProtectResult | ProtectError> {
  const { filename, content, level, licenseMode, licenseId, apiBase } = opts

  // 1. Validate
  const validation = validateLuaFile(filename, content.length, content)
  if (!validation.ok) {
    return { ok: false, error: validation.error! }
  }

  let code = content

  // 2. Apply protection by level
  try {
    if (level === 'basic') {
      // Basic: rename locals + add header
      code = obfuscateBasic(code)
      const hash = await sha256hex(content)
      code = addIntegrityComment(code, hash)
    } else if (level === 'standard') {
      // Standard: basic + string encoding + control flow + integrity check
      code = obfuscateBasic(code)
      code = encodeStrings(code)
      code = addJunkCode(code)
      const hash = await sha256hex(content)
      const token = hash.slice(0, 16)
      code = wrapWithIntegrityCheck(code, token)
      code = addIntegrityComment(code, hash)
    } else if (level === 'strong') {
      // Strong: standard + license validation header
      code = obfuscateBasic(code)
      code = encodeStrings(code)
      code = encodeNumbers(code)
      code = addJunkCode(code)
      const hash = await sha256hex(content)
      const token = hash.slice(0, 16)
      code = wrapWithIntegrityCheck(code, token)

      // License header
      const licenseHeader =
        licenseMode === 'require_validation'
          ? buildLicenseHeader({ apiBase, licenseId })
          : buildNoLicenseHeader()

      code = licenseHeader + '\n\n' + code
      code = addIntegrityComment(code, hash)
    }
  } catch (err) {
    return {
      ok: false,
      error: `Protection engine error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  // 3. Generate output filename
  const baseName = filename.replace(/\.lua$/i, '')
  const levelSuffix = { basic: '_b', standard: '_s', strong: '_p' }[level]
  const outFilename = `${baseName}${levelSuffix}_protected.lua`

  return {
    ok: true,
    code,
    size: new TextEncoder().encode(code).length,
    filename: outFilename,
  }
}
