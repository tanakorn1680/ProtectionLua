/**
 * transform.ts
 * Control flow transformation + data encoding สำหรับ Standard level
 *
 * ⚠️ หมายเหตุ: การป้องกันนี้มีเป้าหมายเพื่อเพิ่มความยากในการวิเคราะห์
 * และแก้ไขไฟล์ ไม่ใช่การป้องกัน Reverse Engineering ได้ 100%
 */

/** สร้าง random hex string */
function randHex(len: number): string {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

/** เพิ่ม dead code / junk variables เพื่อเพิ่มความซับซ้อน */
export function addJunkCode(lua: string): string {
  const junkVars = Array.from({ length: 3 }, (_, i) => {
    const name = `_j${randHex(4)}`
    const val = Math.floor(Math.random() * 0xffff)
    return `local ${name}=${val};`
  })

  const junkBlock = junkVars.join('') + '\n'

  // ใส่ junk หลัง shebang หรือที่ต้นไฟล์
  if (lua.startsWith('--')) {
    const firstNL = lua.indexOf('\n')
    return lua.slice(0, firstNL + 1) + junkBlock + lua.slice(firstNL + 1)
  }
  return junkBlock + lua
}

/** Encode numeric literals ให้เป็น expression */
export function encodeNumbers(lua: string): string {
  // แทนที่ integer literals บางส่วนด้วย XOR expression
  return lua.replace(/\b(\d{4,})\b/g, (match, num) => {
    const n = parseInt(num, 10)
    if (n > 0xffffff) return match // ข้ามตัวเลขใหญ่เกิน
    const key = Math.floor(Math.random() * 0xff) + 1
    const masked = n ^ key
    return `(${masked}~${key})`
  })
}

/** Wrap main content in integrity-check shell */
export function wrapWithIntegrityCheck(lua: string, token: string): string {
  // สร้าง simple checksum จาก token
  const checkVal = token
    .split('')
    .reduce((acc, c) => (acc + c.charCodeAt(0)) & 0xffff, 0)

  return `
-- [Integrity Check Layer]
local _ck=${checkVal}
local _tv="${token.slice(0, 8)}"
local function _ic(v)
  local s=0
  for i=1,#v do s=(s+string.byte(v,i))%65536 end
  return s
end
if _ic(_tv)~=_ck then
  error("integrity check failed",2)
end
-- [Protected Content]
${lua}
`.trim()
}
