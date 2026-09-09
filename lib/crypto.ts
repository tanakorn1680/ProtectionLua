/**
 * AES-256-GCM Encryption Utility
 */

function getEncryptionKey(): string {
  const key = process.env.SCRIPT_ENCRYPTION_KEY
  if (!key || key.length < 32) {
    throw new Error('SCRIPT_ENCRYPTION_KEY must be at least 32 characters')
  }
  return key
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret.slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  )
}

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function hexToUint8(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

export interface EncryptedScript {
  encrypted_code: string
  iv: string
  auth_tag: string
}

export async function encryptScript(luaCode: string): Promise<EncryptedScript> {
  const key = await deriveKey(getEncryptionKey())
  const enc = new TextEncoder()
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const cipherBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer, tagLength: 128 },
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

export async function decryptScript(enc: EncryptedScript): Promise<string> {
  const key = await deriveKey(getEncryptionKey())
  const iv = hexToUint8(enc.iv)
  const ciphertext = hexToUint8(enc.encrypted_code)
  const authTag = hexToUint8(enc.auth_tag)

  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer, tagLength: 128 },
    key,
    combined as unknown as ArrayBuffer
  )

  return new TextDecoder().decode(plainBuf)
}
