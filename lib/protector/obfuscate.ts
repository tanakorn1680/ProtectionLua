/**
 * obfuscate.ts
 * Basic obfuscation: rename local variables, encode string literals
 *
 * ⚠️ หมายเหตุ: การป้องกันนี้มีเป้าหมายเพื่อเพิ่มความยากในการวิเคราะห์
 * และแก้ไขไฟล์ ไม่ใช่การป้องกัน Reverse Engineering ได้ 100%
 */

/** สร้างชื่อตัวแปรแบบ obfuscated */
function makeVarName(index: number): string {
  const chars = 'lIOo0'
  let name = '_'
  let n = index
  do {
    name += chars[n % chars.length]
    n = Math.floor(n / chars.length)
  } while (n > 0)
  return name
}

/** Encode string เป็น UTF-8 byte codes สำหรับ string.char() ใน Lua */
function encodeString(str: string): string {
  // ใช้ UTF-8 bytes เพราะ Lua string.char() รับค่า 0-255 เท่านั้น
  // charCodeAt() ให้ UTF-16 code units ที่อาจ > 255 สำหรับ Thai/Emoji
  const bytes = Array.from(new TextEncoder().encode(str))
  return `(function()local _s=""for _,_c in ipairs({${bytes.join(',')}})do _s=_s..string.char(_c)end;return _s end)()`
}

/** Basic obfuscation: rename locals, encode some strings */
export function obfuscateBasic(lua: string): string {
  const lines = lua.split('\n')
  let varCounter = 0
  const varMap = new Map<string, string>()

  // ค้นหา local variable declarations
  // pattern: local varname [, varname2 ...] [= ...]
  const localDeclRe = /^(\s*local\s+)([a-zA-Z_][a-zA-Z0-9_]*)(\b)/

  const result = lines.map(line => {
    // ข้าม comments
    if (/^\s*--/.test(line)) return line

    let out = line

    // rename local vars
    const m = localDeclRe.exec(out)
    if (m) {
      const origName = m[2]
      // ข้ามชื่อ keyword-like และชื่อพิเศษ
      if (!['self', 'args', 'arg', 'ENV', '_G', 'true', 'false', 'nil'].includes(origName)) {
        if (!varMap.has(origName)) {
          varMap.set(origName, makeVarName(varCounter++))
        }
      }
    }

    return out
  })

  // Apply var renames
  let code = result.join('\n')
  varMap.forEach((newName, origName) => {
    // ใช้ word boundary replacement
    const re = new RegExp(`\\b${origName}\\b`, 'g')
    code = code.replace(re, newName)
  })

  return code
}

/** String encryption สำหรับ Standard level */
export function encodeStrings(lua: string): string {
  // encode เฉพาะ ASCII-only string literals ที่ยาวกว่า 3 chars
  // \n ใน character class ป้องกันการ match ข้ามบรรทัด (multi-line string)
  // non-ASCII (Thai/Emoji) ต้องข้ามเพราะ string.char() ใน Lua รับได้แค่ 0-255
  return lua.replace(/"([^"\\\n]{4,})"|'([^'\\\n]{4,})'/g, (match, d, s) => {
    const str = d ?? s
    // ข้ามถ้ามี backslash escape sequences
    if (/\\/.test(str)) return match
    // ข้ามถ้ามี non-ASCII characters (Thai, Emoji, CJK ฯลฯ)
    if (/[^\x00-\x7F]/.test(str)) return match
    return encodeString(str)
  })
}

/** Add integrity header comment */
export function addIntegrityComment(lua: string, hash: string): string {
  const header = `-- Protected by License Manager [${hash.slice(0, 8)}]\n-- ⚠️ การแก้ไขไฟล์นี้อาจทำให้ไม่สามารถทำงานได้\n`
  return header + lua
}
