/**
 * Protection Engine — Server Only
 *
 * Security model:
 *   source.lua
 *     → compress (deflate/zlib raw bytes)
 *     → encrypt  (AES-256-GCM, key from PAYLOAD_ENCRYPTION_KEY env)
 *     → sign     (HMAC-SHA256 of ciphertext+iv+tag)
 *     → wrap in versioned binary frame
 *     → store in private Supabase Storage
 *
 * At runtime delivery (/api/runtime/payload):
 *   - ตรวจ session token
 *   - อ่าน protected payload จาก Storage
 *   - decrypt + verify integrity
 *   - XOR encode ด้วย session_token keystream
 *   - คำนวณ checksum: SHA256(session_token || source) → first 8 bytes → 16 hex chars
 *   - Loader รับ data + checksum แล้วประมวลผล
 *
 * NOTE: ไม่ import ไฟล์นี้ฝั่ง Client เด็ดขาด
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from 'crypto'
import * as zlib from 'zlib'
import { promisify } from 'util'

const deflateRaw = promisify(zlib.deflateRaw)
const inflateRaw = promisify(zlib.inflateRaw)

// Algorithm version — bump เมื่อเปลี่ยน algorithm
const ALGO_VERSION = 1

// Frame format (binary):
//   [0]       : version (uint8)
//   [1..16]   : IV (16 bytes AES-GCM)
//   [17..48]  : HMAC-SHA256 signature (32 bytes)
//   [49..64]  : GCM auth tag (16 bytes)
//   [65..]    : ciphertext
const OFF_VERSION  = 0
const OFF_IV       = 1
const OFF_HMAC     = 17  // 1 + 16
const OFF_AUTHTAG  = 49  // 1 + 16 + 32
const OFF_CIPHER   = 65  // 1 + 16 + 32 + 16

function getKeys(): { encKey: Buffer; hmacKey: Buffer } {
  const raw = process.env.PAYLOAD_ENCRYPTION_KEY
  if (!raw || raw.length < 64) {
    throw new Error('PAYLOAD_ENCRYPTION_KEY must be at least 64 hex chars (32 bytes)')
  }
  // derive two 32-byte keys from one env var
  const master = Buffer.from(raw.slice(0, 64), 'hex')
  const encKey  = createHash('sha256').update(master).update('enc').digest()
  const hmacKey = createHash('sha256').update(master).update('mac').digest()
  return { encKey, hmacKey }
}

/**
 * protect(source) → protected Buffer
 * ใช้ตอน Admin อัปโหลด script.lua
 */
export async function protect(sourceCode: string): Promise<Buffer> {
  const { encKey, hmacKey } = getKeys()

  // 1. compress
  const compressed = await deflateRaw(Buffer.from(sourceCode, 'utf-8'), { level: 9 })

  // 2. encrypt (AES-256-GCM)
  const iv = randomBytes(16)
  const cipher = createCipheriv('aes-256-gcm', encKey, iv)
  const ct1 = cipher.update(compressed)
  const ct2 = cipher.final()
  const authTag = cipher.getAuthTag()        // 16 bytes GCM tag
  const ciphertext = Buffer.concat([ct1, ct2])

  // 3. HMAC over version + iv + authTag + ciphertext
  const mac = createHmac('sha256', hmacKey)
    .update(Buffer.from([ALGO_VERSION]))
    .update(iv)
    .update(authTag)
    .update(ciphertext)
    .digest()  // 32 bytes

  // 4. assemble frame
  const frame = Buffer.allocUnsafe(OFF_CIPHER + ciphertext.length)
  frame[OFF_VERSION] = ALGO_VERSION
  iv.copy(frame, OFF_IV)
  mac.copy(frame, OFF_HMAC)
  authTag.copy(frame, OFF_AUTHTAG)
  ciphertext.copy(frame, OFF_CIPHER)

  return frame
}

/**
 * verify(frame) → true/false
 * ตรวจ integrity ของ payload ก่อน decrypt
 */
export function verifyIntegrity(frame: Buffer): boolean {
  if (frame.length < OFF_CIPHER) return false
  if (frame[OFF_VERSION] !== ALGO_VERSION) return false

  const { hmacKey } = getKeys()

  const iv        = frame.subarray(OFF_IV,      OFF_HMAC)
  const storedMac = frame.subarray(OFF_HMAC,    OFF_AUTHTAG)
  const authTag   = frame.subarray(OFF_AUTHTAG, OFF_CIPHER)
  const ciphertext = frame.subarray(OFF_CIPHER)

  const expected = createHmac('sha256', hmacKey)
    .update(Buffer.from([frame[OFF_VERSION]]))
    .update(iv)
    .update(authTag)
    .update(ciphertext)
    .digest()

  // constant-time compare
  return storedMac.length === expected.length &&
    expected.every((b, i) => b === storedMac[i])
}

/**
 * prepareDeliveryXor(frame, sessionToken)
 *   → { data: base64(XOR(source, keystream(sessionToken))), checksum }
 *
 * XOR cipher ไม่ใช่ strong encryption แต่:
 *   - key (session_token) อายุ 5 นาที single-use
 *   - source ไม่ถูก store ที่ Loader side
 *   - static analysis ของ Loader ไม่เจอ source
 *
 * checksum: SHA256(sessionToken || source) → first 8 bytes → 16 hex chars
 *   ↑ ต้องตรงกับ Lua verifyChecksum():
 *     local h = sha256(token .. source)
 *     for i = 1,8 do hex = hex .. string.format("%02x", h:byte(i)) end
 */
export async function prepareDeliveryXor(
  frame: Buffer,
  sessionToken: string
): Promise<{ data: string; checksum: string }> {
  if (!verifyIntegrity(frame)) {
    throw new Error('Payload integrity check failed')
  }

  // decrypt the stored payload to get source back
  const { encKey } = getKeys()
  const iv      = frame.subarray(OFF_IV,      OFF_HMAC)
  const authTag = frame.subarray(OFF_AUTHTAG, OFF_CIPHER)
  const ct      = frame.subarray(OFF_CIPHER)

  const decipher = createDecipheriv('aes-256-gcm', encKey, iv)
  decipher.setAuthTag(authTag)
  const compressed = Buffer.concat([decipher.update(ct), decipher.final()])
  const source = await inflateRaw(compressed)

  // XOR with keystream derived from session token
  // keystream: repeat SHA256(token || [counter_lo, counter_hi]) until length matches
  const keystream = deriveKeystream(sessionToken, source.length)
  const xored = Buffer.allocUnsafe(source.length)
  for (let i = 0; i < source.length; i++) {
    xored[i] = source[i] ^ keystream[i]
  }

  // checksum: SHA256(sessionToken || source) → first 8 bytes → 16 hex chars
  // ต้องตรงกับ Lua: sha256(token .. source) → bytes 1..8 → "%02x"
  const hashBuf = createHash('sha256')
    .update(sessionToken)
    .update(source)
    .digest()
  const checksum = hashBuf.subarray(0, 8).toString('hex')  // 16 hex chars

  return {
    data: xored.toString('base64'),
    checksum,
  }
}

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

/**
 * hashToken(token) → hex string
 * สำหรับเก็บใน DB (ไม่เก็บ raw token)
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * generateProtectionId() → "PRT-XXXXXXXX"
 */
export function generateProtectionId(): string {
  const hex = randomBytes(4).toString('hex').toUpperCase()
  return `PRT-${hex}`
}
