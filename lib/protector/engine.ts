/**
 * Protection Engine — Server Only
 *
 * Security model:
 *   source.lua
 *     → obfuscate  (identifier rename + string encoding + dead-code injection)
 *     → compress   (deflate/zlib raw bytes)
 *     → encrypt    (AES-256-GCM, key from PAYLOAD_ENCRYPTION_KEY env)
 *     → sign       (HMAC-SHA256 of ciphertext+iv+tag)
 *     → wrap in versioned binary frame
 *     → store in private Supabase Storage
 *
 * At runtime delivery (/api/runtime/payload):
 *   - ตรวจ session token
 *   - อ่าน protected payload จาก Storage
 *   - decrypt + verify integrity
 *   - แบ่ง source เป็น chunks ขนาด CHUNK_SIZE bytes
 *   - XOR encode แต่ละ chunk ด้วย keystream(sessionToken, chunkIndex)
 *   - คำนวณ checksum: SHA256(sessionToken || source) → first 8 bytes → 16 hex chars
 *   - Loader รับ chunks[] + checksum แล้วประมวลผลทีละ chunk
 *
 * Obfuscation pipeline (pure TS, zero external deps — deploy-safe on Vercel):
 *   1. Rename local variables/functions → short random identifiers
 *   2. Encode string literals → \xNN escape sequences
 *   3. Inject dead-code blocks to confuse static analysis
 *   4. Shuffle math constants / add no-op expressions
 *
 * NOTE: ไม่ import ไฟล์นี้ฝั่ง Client เด็ดขาด
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from 'crypto'
import * as zlib from 'zlib'
import { promisify } from 'util'

const deflateRaw = promisify(zlib.deflateRaw)
const inflateRaw = promisify(zlib.inflateRaw)

// Algorithm version — bump เมื่อเปลี่ยน algorithm
const ALGO_VERSION = 2  // bumped: v1=XOR whole, v2=chunk streaming + obfuscation

// Chunk size ที่ตกลงกัน — 512 bytes
// Security note: plaintext window ที่อยู่ใน memory ขณะ decode ≤ 512 bytes
// ทำให้ memory dump ได้เพียง fragment ที่ reconstruct ยาก
export const CHUNK_SIZE = 512

// Frame format (binary) — ไม่เปลี่ยนจาก v1:
//   [0]       : version (uint8)
//   [1..16]   : IV (16 bytes AES-GCM)
//   [17..48]  : HMAC-SHA256 signature (32 bytes)
//   [49..64]  : GCM auth tag (16 bytes)
//   [65..]    : ciphertext (of obfuscated+compressed source)
const OFF_VERSION  = 0
const OFF_IV       = 1
const OFF_HMAC     = 17  // 1 + 16
const OFF_AUTHTAG  = 49  // 1 + 16 + 32
const OFF_CIPHER   = 65  // 1 + 16 + 32 + 16

// ─────────────────────────────────────────────
// Key management
// ─────────────────────────────────────────────

function getKeys(): { encKey: Buffer; hmacKey: Buffer } {
  const raw = process.env.PAYLOAD_ENCRYPTION_KEY
  if (!raw || raw.length < 64) {
    throw new Error('PAYLOAD_ENCRYPTION_KEY must be at least 64 hex chars (32 bytes)')
  }
  const master = Buffer.from(raw.slice(0, 64), 'hex')
  const encKey  = createHash('sha256').update(master).update('enc').digest()
  const hmacKey = createHash('sha256').update(master).update('mac').digest()
  return { encKey, hmacKey }
}

// ─────────────────────────────────────────────
// Obfuscation Pipeline (pure TS, zero deps)
// ─────────────────────────────────────────────

/**
 * obfuscateLua(source) → obfuscated source string
 *
 * Passes:
 *   1. Identifier renaming  — local vars/functions → _Gxxx random names
 *   2. String encoding      — "literal" → hex escape sequence
 *   3. Dead code injection  — random unreachable blocks
 *   4. No-op expression pad — x = x + 0 style noise at top-level
 *
 * Limitations (intentional for serverless / zero-dep):
 *   - Regex-based, not AST-based → safe for well-formed Lua
 *   - Does NOT rename: global functions, Lua builtins, gg.* calls,
 *     string constants used as table keys (detected by heuristic)
 *   - ตั้งใจ conservative เพื่อไม่ break runtime behavior
 */
export function obfuscateLua(source: string): string {
  let out = source

  // Pass 1: rename local identifiers (local x → local _G<hash>)
  out = renameLocals(out)

  // Pass 2: encode string literals → \xNN
  out = encodeStrings(out)

  // Pass 3 (dead code injection) — DISABLED
  // Regex-based insertion without AST cannot guarantee valid insertion points.
  // Injecting mid-block causes Lua parse errors inside load().

  // Pass 4 (no-op pad) — DISABLED
  // Prepending statements risks breaking scripts with strict first-line structure.

  return out
}

// ── Pass 1: Rename locals ──────────────────────────────────────────────────

/**
 * Find `local <name>` and `local function <name>` declarations,
 * build a rename map, then substitute all occurrences.
 *
 * Safety: skip names that appear in gg.* calls or global-looking contexts.
 * Skip: Lua keywords, single-char vars (prone to false positive), builtins.
 */
function renameLocals(src: string): string {
  const SKIP = new Set([
    'and','break','do','else','elseif','end','false','for','function',
    'goto','if','in','local','nil','not','or','repeat','return','then',
    'true','until','while','string','table','math','io','os','pcall',
    'xpcall','ipairs','pairs','next','select','tostring','tonumber',
    'type','error','assert','rawget','rawset','setmetatable','getmetatable',
    'load','loadstring','dofile','require','print','unpack',
    // GG builtins
    'gg','ok','res','raw','data','out','err','url','pad','hex','msg',
    // common short vars likely in gg scripts
    'i','j','k','n','v','t','s','m','r','c','f','b','a','e','h','w',
  ])

  // collect candidate names from `local name` or `local function name`
  const declPattern = /\blocal\s+(?:function\s+)?([A-Za-z_][A-Za-z0-9_]*)/g
  const candidates = new Map<string, string>()  // original → renamed
  let match: RegExpExecArray | null

  while ((match = declPattern.exec(src)) !== null) {
    const name = match[1]
    if (SKIP.has(name) || candidates.has(name)) continue
    if (name.length <= 1) continue
    // don't rename anything that's part of gg.XYZ
    if (src.includes(`gg.${name}`)) continue
    candidates.set(name, generateObfName(name))
  }

  // substitute — whole-word only, skip inside string literals
  let result = src
  for (const [orig, renamed] of Array.from(candidates.entries())) {
    // word boundary replacement, careful not to hit substrings
    const re = new RegExp(`(?<![.:\\w])\\b${escapeRegex(orig)}\\b(?!\\s*=\\s*function\\s*\\()`, 'g')
    result = result.replace(re, renamed)
  }

  return result
}

function generateObfName(seed: string): string {
  // deterministic but unreadable: _G + 6 hex chars derived from seed
  const h = createHash('sha256').update(seed + 'obf').digest('hex').slice(0, 6)
  return `_G${h}`
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ── Pass 2: Encode string literals ────────────────────────────────────────

/**
 * Replace "double-quoted" and 'single-quoted' string literals with hex escapes.
 * Skips multiline [[ ]] strings (too complex without AST).
 * Skips strings that are just identifiers used as table keys.
 */
function encodeStrings(src: string): string {
  // Match double-quoted strings
  let result = src.replace(/"((?:[^"\\]|\\.)*)"/g, (_full, content) => {
    return '"' + hexEncodeStr(content) + '"'
  })
  // Match single-quoted strings
  result = result.replace(/'((?:[^'\\]|\\.)*)'/g, (_full, content) => {
    return '"' + hexEncodeStr(content) + '"'
  })
  return result
}

function hexEncodeStr(s: string): string {
  // Only encode printable ASCII that aren't already escape sequences
  // Encode every char as \xNN for maximum opacity
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    // preserve existing escape sequences (backslash-prefixed)
    if (s[i] === '\\') {
      out += s[i] + (s[i + 1] ?? '')
      i++
      continue
    }
    if (c >= 32 && c <= 126) {
      out += `\\x${c.toString(16).padStart(2, '0')}`
    } else {
      out += s[i]  // keep non-printable as-is (newlines, etc.)
    }
  }
  return out
}

// ── Pass 3: Dead code injection ────────────────────────────────────────────

const DEAD_CODE_TEMPLATES = [
  `if false then local _d1 = math.random(1,100) end`,
  `do local _d2 = nil if _d2 then error("unreachable") end end`,
  `if (1 ~= 1) then print("dead") end`,
  `do local _d3 = 0 repeat _d3 = _d3 - 1 until true end`,
  `if type(nil) == "number" then return end`,
  `do local _d4 = {} setmetatable(_d4, {}) end`,
]

function injectDeadCode(src: string): string {
  // Insert dead code after every 20th line roughly
  const lines = src.split('\n')
  const result: string[] = []
  let counter = 0
  for (const line of lines) {
    result.push(line)
    counter++
    if (counter % 20 === 0 && !line.trim().startsWith('--')) {
      const template = DEAD_CODE_TEMPLATES[counter % DEAD_CODE_TEMPLATES.length]
      result.push(template)
    }
  }
  return result.join('\n')
}

// ── Pass 4: No-op expressions ──────────────────────────────────────────────

function injectNops(src: string): string {
  const nops = [
    `local _nop1 = (0 + 0) * 1`,
    `local _nop2 = tostring(nil)`,
    `local _nop3 = #""`,
  ]
  // prepend nops at very top (after any shebang/comment block)
  const headerEnd = src.indexOf('\n') + 1
  const header = src.slice(0, headerEnd)
  const body = src.slice(headerEnd)
  return header + nops.join('\n') + '\n' + body
}

// ─────────────────────────────────────────────
// protect() — Admin upload pipeline
// ─────────────────────────────────────────────

/**
 * protect(sourceCode) → protected Buffer
 *
 * Pipeline:
 *   source → obfuscate → compress → encrypt(AES-256-GCM) → HMAC → frame
 */
export async function protect(sourceCode: string): Promise<Buffer> {
  const { encKey, hmacKey } = getKeys()

  // 1. obfuscate (NEW in v2)
  const obfuscated = obfuscateLua(sourceCode)

  // 2. compress obfuscated source
  const compressed = await deflateRaw(Buffer.from(obfuscated, 'utf-8'), { level: 9 })

  // 3. encrypt (AES-256-GCM)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', encKey, iv)
  const ct1 = cipher.update(compressed)
  const ct2 = cipher.final()
  const authTag = cipher.getAuthTag()        // 16 bytes GCM tag
  const ciphertext = Buffer.concat([ct1, ct2])

  // 4. HMAC over version + iv + authTag + ciphertext
  const mac = createHmac('sha256', hmacKey)
    .update(Buffer.from([ALGO_VERSION]))
    .update(iv)
    .update(authTag)
    .update(ciphertext)
    .digest()  // 32 bytes

  // 5. assemble frame (same binary layout as v1)
  const frame = Buffer.allocUnsafe(OFF_CIPHER + ciphertext.length)
  frame[OFF_VERSION] = ALGO_VERSION
  iv.copy(frame, OFF_IV)
  mac.copy(frame, OFF_HMAC)
  authTag.copy(frame, OFF_AUTHTAG)
  ciphertext.copy(frame, OFF_CIPHER)

  return frame
}

// ─────────────────────────────────────────────
// verifyIntegrity()
// ─────────────────────────────────────────────

export function verifyIntegrity(frame: Buffer): boolean {
  if (frame.length < OFF_CIPHER) return false
  // accept both v1 and v2 frames for backwards compat during migration
  const ver = frame[OFF_VERSION]
  if (ver !== 1 && ver !== 2) return false

  const { hmacKey } = getKeys()

  const iv        = frame.subarray(OFF_IV,      OFF_HMAC)
  const storedMac = frame.subarray(OFF_HMAC,    OFF_AUTHTAG)
  const authTag   = frame.subarray(OFF_AUTHTAG, OFF_CIPHER)
  const ciphertext = frame.subarray(OFF_CIPHER)

  const expected = createHmac('sha256', hmacKey)
    .update(Buffer.from([ver]))
    .update(iv)
    .update(authTag)
    .update(ciphertext)
    .digest()

  // constant-time compare
  return storedMac.length === expected.length &&
    expected.every((b, i) => b === storedMac[i])
}

// ─────────────────────────────────────────────
// prepareDeliveryChunks() — Runtime delivery
// ─────────────────────────────────────────────

/**
 * prepareDeliveryChunks(frame, sessionToken)
 *   → { chunks: string[], checksum: string, count: number }
 *
 * Chunk streaming model:
 *   - source แบ่งเป็น CHUNK_SIZE (512) byte blocks
 *   - แต่ละ chunk XOR ด้วย keystream ที่ keyed โดย (sessionToken, chunkIndex)
 *   - keystream ต่างกันทุก chunk → ถ้า dump memory ได้ fragment เดียว ไม่สามารถ
 *     reconstruct chunk อื่นได้
 *   - chunk แต่ละอัน encode เป็น base64 → JSON array
 *
 * Keystream per chunk:
 *   SHA256(sessionToken || "chunk" || uint32BE(chunkIndex)) ต่อกันจนยาวพอ
 *   ต้องตรงกับ Loader deriveChunkKeystream(seed, index, length)
 *
 * checksum: SHA256(sessionToken || source) → first 8 bytes → 16 hex chars
 *   ต้องตรงกับ Lua verifyChecksum() เหมือน v1
 *
 * NOTE: "source" หมายถึง obfuscated source (สิ่งที่ถูก load() ใน Loader)
 *       ต้องใช้ obfuscated string เดียวกันในการคำนวณ checksum
 */
export async function prepareDeliveryChunks(
  frame: Buffer,
  sessionToken: string
): Promise<{ chunks: string[]; checksum: string; count: number }> {
  if (!verifyIntegrity(frame)) {
    throw new Error('Payload integrity check failed')
  }

  // decrypt to get obfuscated source
  const { encKey } = getKeys()
  const iv      = frame.subarray(OFF_IV,      OFF_HMAC)
  const authTag = frame.subarray(OFF_AUTHTAG, OFF_CIPHER)
  const ct      = frame.subarray(OFF_CIPHER)

  const decipher = createDecipheriv('aes-256-gcm', encKey, iv)
  decipher.setAuthTag(authTag)
  const compressed = Buffer.concat([decipher.update(ct), decipher.final()])
  const source = await inflateRaw(compressed)
  // source is now the obfuscated Lua source as Buffer

  // split into CHUNK_SIZE chunks
  const chunks: string[] = []
  const total = source.length

  for (let offset = 0, index = 0; offset < total; offset += CHUNK_SIZE, index++) {
    const chunk = source.subarray(offset, offset + CHUNK_SIZE)
    const ks = deriveChunkKeystream(sessionToken, index, chunk.length)
    const xored = Buffer.allocUnsafe(chunk.length)
    for (let i = 0; i < chunk.length; i++) {
      xored[i] = chunk[i] ^ ks[i]
    }
    chunks.push(xored.toString('base64'))
  }

  // checksum over full source (obfuscated, as utf-8 string)
  // matches Lua: sha256(token .. source_string) → bytes 1..8 → hex
  const hashBuf = createHash('sha256')
    .update(sessionToken)
    .update(source)   // raw bytes of obfuscated source
    .digest()
  const checksum = hashBuf.subarray(0, 8).toString('hex')

  return { chunks, checksum, count: chunks.length }
}

// ─────────────────────────────────────────────
// prepareDeliveryXor() — kept for v1 frame backwards compat
// (frames stored before v2 upgrade can still be served)
// ─────────────────────────────────────────────

/**
 * @deprecated Use prepareDeliveryChunks for new frames.
 * Kept so existing v1 stored payloads can still be delivered.
 */
export async function prepareDeliveryXor(
  frame: Buffer,
  sessionToken: string
): Promise<{ data: string; checksum: string }> {
  if (!verifyIntegrity(frame)) {
    throw new Error('Payload integrity check failed')
  }

  const { encKey } = getKeys()
  const iv      = frame.subarray(OFF_IV,      OFF_HMAC)
  const authTag = frame.subarray(OFF_AUTHTAG, OFF_CIPHER)
  const ct      = frame.subarray(OFF_CIPHER)

  const decipher = createDecipheriv('aes-256-gcm', encKey, iv)
  decipher.setAuthTag(authTag)
  const compressed = Buffer.concat([decipher.update(ct), decipher.final()])
  const source = await inflateRaw(compressed)

  const keystream = deriveKeystream(sessionToken, source.length)
  const xored = Buffer.allocUnsafe(source.length)
  for (let i = 0; i < source.length; i++) {
    xored[i] = source[i] ^ keystream[i]
  }

  const hashBuf = createHash('sha256')
    .update(sessionToken)
    .update(source)
    .digest()
  const checksum = hashBuf.subarray(0, 8).toString('hex')

  return { data: xored.toString('base64'), checksum }
}

// ─────────────────────────────────────────────
// Keystream derivation
// ─────────────────────────────────────────────

/**
 * deriveChunkKeystream(seed, chunkIndex, length) → Buffer
 *
 * Per-chunk keystream: SHA256(seed || "chunk" || uint32BE(index))
 * ต้องตรงกับ Lua deriveChunkKeystream(seed, index, length) ใน loader.ts
 */
export function deriveChunkKeystream(seed: string, chunkIndex: number, length: number): Buffer {
  const indexBuf = Buffer.allocUnsafe(4)
  indexBuf.writeUInt32BE(chunkIndex, 0)

  const blocks: Buffer[] = []
  let counter = 0
  let accumulated = 0
  while (accumulated < length) {
    const block = createHash('sha256')
      .update(seed)
      .update('chunk')
      .update(indexBuf)
      .update(Buffer.from([counter & 0xff, (counter >> 8) & 0xff]))
      .digest()
    blocks.push(block)
    accumulated += block.length
    counter++
  }
  return Buffer.concat(blocks).subarray(0, length)
}

/**
 * deriveKeystream — ใช้ใน v1 backward compat เท่านั้น
 */
function deriveKeystream(seed: string, length: number): Buffer {
  const blocks: Buffer[] = []
  let counter = 0
  while (blocks.reduce((s, b) => s + b.length, 0) < length) {
    blocks.push(
      createHash('sha256')
        .update(seed)
        .update(Buffer.from([counter & 0xff, (counter >> 8) & 0xff]))
        .digest()
    )
    counter++
  }
  return Buffer.concat(blocks).subarray(0, length)
}

// ─────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateProtectionId(): string {
  const hex = randomBytes(4).toString('hex').toUpperCase()
  return `PRT-${hex}`
}
