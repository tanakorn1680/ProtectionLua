/**
 * AES-256-GCM Encryption Utility
 * ใช้เข้ารหัส Lua Script ก่อนเก็บใน DB
 * และถอดรหัสก่อนส่งให้ Loader (via memory เท่านั้น)
 */

function getEncryptionKey(): string {
  const key = process.env.SCRIPT_ENCRYPTION_KEY
  if (!key || key.length < 32) {
    throw new Error('SCRIPT_ENCRYPTION_KEY must be at least 32 characters')
  }
  return key
}

/**
 * แปลง string เป็น CryptoKey สำหรับ AES-256-GCM
 */
async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.slice(0, 32)), // ใช้แค่ 32 bytes (256-bit)
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
  return keyMaterial
}

function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export interface EncryptedScript {
  encrypted_code: string  // hex
  iv: string              // hex (12 bytes / 96-bit)
  auth_tag: string        // hex (16 bytes / 128-bit) — embedded in GCM output
}

/**
 * เข้ารหัส Lua code ด้วย AES-256-GCM
 * IV สุ่มใหม่ทุกครั้ง → ปลอดภัยแม้ encrypt code เดิมซ้ำ
 */
export async function encryptScript(luaCode: string): Promise<EncryptedScript> {
  const key = await deriveKey(getEncryptionKey())
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // 96-bit IV

  // Web Crypto AES-GCM: ciphertext + 16-byte auth tag ต่อท้ายอัตโนมัติ
  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    enc.encode(luaCode)
  )

  const cipherBytes = new Uint8Array(cipherBuf)
  const ciphertext = cipherBytes.slice(0, -16)
  const authTag = cipherBytes.slice(-16)

  return {
    encrypted_code: bufToHex(ciphertext),
    iv: bufToHex(iv),
    auth_tag: bufToHex(authTag),
  }
}

/**
 * ถอดรหัส Script จาก DB — ใช้ใน API /load เท่านั้น
 * ไม่มีการ save ลง disk
 */
export async function decryptScript(enc: EncryptedScript): Promise<string> {
  const key = await deriveKey(getEncryptionKey())
  const iv = hexToBuf(enc.iv)
  const ciphertext = hexToBuf(enc.encrypted_code)
  const authTag = hexToBuf(enc.auth_tag)

  // รวม ciphertext + authTag กลับ (GCM format)
  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    combined
  )

  return new TextDecoder().decode(plainBuf)
}
