// ==========================================
// Protector types — appended to existing types
// ==========================================

export interface ProtectedScript {
  id: string
  protection_id: string
  admin_id: string | null
  original_filename: string
  source_storage_path: string
  payload_storage_path: string | null
  license_id: string | null
  status: 'active' | 'disabled'
  created_at: string
  updated_at: string
  last_used_at: string | null
  // joined
  license?: {
    license_key: string
    name: string | null
    status: string
  }
}

export type ProtectionLogEventType =
  | 'loader_started'
  | 'license_success'
  | 'license_failed'
  | 'session_created'
  | 'payload_requested'
  | 'payload_delivered'
  | 'payload_denied'
  | 'device_mismatch'
  | 'expired'
  | 'disabled'
  | 'session_revoked'

export interface ProtectionLog {
  id: string
  protection_id: string | null
  license_id: string | null
  device_id: string | null
  event_type: ProtectionLogEventType
  ip: string | null
  detail: string | null
  created_at: string
}

export interface RuntimeSession {
  id: string
  protection_id: string
  license_id: string
  device_id: string | null
  token_hash: string
  expires_at: string
  created_at: string
  last_seen_at: string | null
  revoked_at: string | null
}

// API: POST /api/runtime/session request body (from Loader)
export interface RuntimeSessionRequest {
  protection_id: string
  license: string      // license_key
  device_id?: string
}

// API: POST /api/runtime/session success response
export interface RuntimeSessionResponse {
  success: true
  session_token: string   // short-lived JWT
  expires_at: string
}

// API: POST /api/runtime/payload request body
export interface RuntimePayloadRequest {
  protection_id: string
  session_token: string
}

// API: POST /api/runtime/payload success response
// ส่งกลับเฉพาะ "execution chunks" ไม่ใช่ source
export interface RuntimePayloadResponse {
  success: true
  // chunks: encrypted+signed binary in base64
  // Loader จะ decode แล้วประมวลผลตาม algorithm version
  chunks: string[]
  algo: number          // algorithm version
  iv: string           // per-delivery IV
  tag: string          // HMAC tag for integrity
}

export interface RuntimeErrorResponse {
  success: false
  reason: string
}
