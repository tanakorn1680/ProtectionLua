export type LicenseStatus = 'active' | 'disabled' | 'banned' | 'expired'

export interface License {
  id: string
  license_key: string
  name: string | null
  note: string | null
  status: 'active' | 'disabled' | 'banned'
  expires_at: string | null
  device_id: string | null
  device_binding_enabled: boolean
  created_at: string
  updated_at: string
  last_seen: string | null
  last_ip: string | null
}

// computed status considering expiry
export interface LicenseWithStatus extends License {
  effective_status: LicenseStatus
}

export type LogEventType =
  | 'check_success'
  | 'invalid_license'
  | 'disabled'
  | 'banned'
  | 'expired'
  | 'device_mismatch'
  | 'device_bound'
  | 'device_reset'

export interface LicenseLog {
  id: string
  license_id: string | null
  license_key: string
  event_type: LogEventType
  device_id: string | null
  ip: string | null
  created_at: string
}

export interface Profile {
  id: string
  email: string
  role: 'admin' | 'viewer'
  created_at: string
}

export interface SystemSettings {
  system_name: string
  default_device_binding: boolean
  token_expire_minutes: number
}

// API check response types
export interface CheckSuccessResponse {
  success: true
  allowed: true
  status: LicenseStatus
  expires_at: string | null
  token: string
}

export interface CheckFailResponse {
  success: false
  allowed: false
  reason:
    | 'invalid_license'
    | 'disabled'
    | 'banned'
    | 'expired'
    | 'device_mismatch'
    | 'invalid_request'
}

export type CheckResponse = CheckSuccessResponse | CheckFailResponse

export interface DashboardStats {
  total: number
  active: number
  disabled: number
  expired: number
  banned: number
  recent_checks: number
}
