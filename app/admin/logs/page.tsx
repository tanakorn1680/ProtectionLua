'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'
import type { LicenseLog, LogEventType } from '@/lib/types'

const EVENT_LABELS: Record<LogEventType, string> = {
  check_success: 'ผ่าน',
  invalid_license: 'ไม่พบ License',
  disabled: 'ถูกปิด',
  banned: 'ถูกแบน',
  expired: 'หมดอายุ',
  device_mismatch: 'Device ไม่ตรง',
  device_bound: 'ผูก Device',
  device_reset: 'Reset Device',
}

const EVENT_COLORS: Record<LogEventType, string> = {
  check_success: 'text-green-400 bg-green-500/10 border-green-500/20',
  invalid_license: 'text-red-400 bg-red-500/10 border-red-500/20',
  disabled: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  banned: 'text-red-400 bg-red-500/10 border-red-500/20',
  expired: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  device_mismatch: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  device_bound: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  device_reset: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
}

const EVENT_FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'check_success', label: 'ผ่าน' },
  { value: 'invalid_license', label: 'ไม่พบ' },
  { value: 'device_mismatch', label: 'Device ไม่ตรง' },
  { value: 'banned', label: 'แบน' },
  { value: 'expired', label: 'หมดอายุ' },
]

export default function LogsPage() {
  const adminFetch = useAdminFetch()
  const [logs, setLogs] = useState<LicenseLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [eventFilter, setEventFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const LIMIT = 50

  const fetchLogs = useCallback(async (p = 1, ef = eventFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        event_type: ef,
      })
      const res = await adminFetch(`/api/admin/logs?${params}`)
      const json = await res.json()
      setLogs(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [adminFetch, eventFilter])

  useEffect(() => {
    fetchLogs(page)
  }, [page, eventFilter]) // eslint-disable-line

  function handleFilter(val: string) {
    setEventFilter(val)
    setPage(1)
  }

  function fmt(dt: string) {
    return new Date(dt).toLocaleString('th-TH', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">ประวัติการใช้งาน</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} รายการ</p>
        </div>
        <select
          value={eventFilter}
          onChange={e => handleFilter(e.target.value)}
          className="input-field w-36 text-xs"
        >
          {EVENT_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      <div className="card divide-y divide-surface-border overflow-hidden">
        {loading ? (
          [...Array(8)].map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-surface-hover rounded w-32" />
                <div className="h-3 bg-surface-hover rounded w-48" />
              </div>
              <div className="h-5 bg-surface-hover rounded w-16" />
            </div>
          ))
        ) : logs.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">
            ยังไม่มีประวัติการใช้งาน
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="px-4 py-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-mono text-xs text-gray-300 truncate">{log.license_key}</div>
                <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{fmt(log.created_at)}</span>
                  {log.ip && <span className="font-mono">{log.ip}</span>}
                  {log.device_id && (
                    <span className="font-mono truncate max-w-[120px]" title={log.device_id}>
                      {log.device_id.slice(0, 16)}…
                    </span>
                  )}
                </div>
              </div>
              <span className={`badge flex-shrink-0 ${EVENT_COLORS[log.event_type]}`}>
                {EVENT_LABELS[log.event_type]}
              </span>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
          >
            ก่อนหน้า
          </button>
          <span className="text-sm text-gray-500">หน้า {page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
          >
            ถัดไป
          </button>
        </div>
      )}
    </div>
  )
}
