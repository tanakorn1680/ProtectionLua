'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'
import { withEffectiveStatus } from '@/lib/license'
import { StatusBadge } from '@/components/StatusBadge'
import { LicenseModal } from '@/components/LicenseModal'
import { LicenseDrawer } from '@/components/LicenseDrawer'
import type { License, LicenseWithStatus } from '@/lib/types'

const STATUS_FILTERS = [
  { value: '', label: 'ทั้งหมด' },
  { value: 'active', label: 'ใช้งานได้' },
  { value: 'disabled', label: 'ปิดใช้งาน' },
  { value: 'banned', label: 'แบน' },
]

export default function LicensesPage() {
  const adminFetch = useAdminFetch()

  const [licenses, setLicenses] = useState<LicenseWithStatus[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const [selectedLicense, setSelectedLicense] = useState<License | null>(null)
  const [editingLicense, setEditingLicense] = useState<License | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const searchRef = useRef<ReturnType<typeof setTimeout>>()
  const LIMIT = 20

  const fetchLicenses = useCallback(async (p = 1, s = search, sf = statusFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(LIMIT),
        search: s,
        status: sf,
      })
      const res = await adminFetch(`/api/admin/licenses?${params}`)
      const json = await res.json()
      setLicenses((json.data ?? []).map(withEffectiveStatus))
      setTotal(json.total ?? 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [adminFetch, search, statusFilter])

  useEffect(() => {
    fetchLicenses(page)
  }, [page, statusFilter]) // eslint-disable-line

  // Debounce search
  function handleSearch(val: string) {
    setSearch(val)
    clearTimeout(searchRef.current)
    searchRef.current = setTimeout(() => {
      setPage(1)
      fetchLicenses(1, val, statusFilter)
    }, 400)
  }

  function handleStatusFilter(val: string) {
    setStatusFilter(val)
    setPage(1)
  }

  async function handleCreate(data: Partial<License> & { license_key?: string }) {
    const res = await adminFetch('/api/admin/licenses', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const j = await res.json()
      throw new Error(j.error ?? 'สร้างไม่สำเร็จ')
    }
    await fetchLicenses(1)
    setPage(1)
  }

  async function handleUpdate(id: string, data: Record<string, unknown>) {
    const res = await adminFetch(`/api/admin/licenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const j = await res.json()
      throw new Error(j.error ?? 'อัปเดตไม่สำเร็จ')
    }
    await fetchLicenses(page)
    setSelectedLicense(null)
    setEditingLicense(null)
  }

  async function handleDelete(license: License) {
    if (!confirm(`ลบ License ${license.license_key}?`)) return
    await adminFetch(`/api/admin/licenses/${license.id}`, { method: 'DELETE' })
    await fetchLicenses(page)
    setSelectedLicense(null)
  }

  async function handleResetDevice(license: License) {
    if (!confirm('Reset Device ID?')) return
    await handleUpdate(license.id, { reset_device: true })
  }

  async function handleStatusChange(license: License, status: 'active' | 'disabled' | 'banned') {
    await handleUpdate(license.id, { status })
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">License</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} รายการ</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          สร้างใหม่
        </button>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="ค้นหา License key, ชื่อ..."
            className="input-field pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => handleStatusFilter(e.target.value)}
          className="input-field w-32"
        >
          {STATUS_FILTERS.map(f => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {/* License list */}
      <div className="card divide-y divide-surface-border overflow-hidden">
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} className="px-4 py-3 animate-pulse flex items-center gap-3">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-surface-hover rounded w-40" />
                <div className="h-3 bg-surface-hover rounded w-24" />
              </div>
              <div className="h-5 bg-surface-hover rounded w-16" />
            </div>
          ))
        ) : licenses.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">
            {search || statusFilter ? 'ไม่พบ License ที่ตรงเงื่อนไข' : 'ยังไม่มี License ในระบบ'}
          </div>
        ) : (
          licenses.map(lic => (
            <button
              key={lic.id}
              onClick={() => setSelectedLicense(lic)}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="font-mono text-sm text-white truncate">{lic.license_key}</div>
                <div className="text-xs text-gray-500 mt-0.5 truncate">
                  {lic.name ?? 'ไม่มีชื่อ'}
                  {lic.device_id && (
                    <span className="ml-2 text-blue-400/70">• มี Device</span>
                  )}
                </div>
              </div>
              <div className="flex-shrink-0">
                <StatusBadge status={lic.effective_status} />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => p - 1)}
            disabled={page === 1}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
          >
            ก่อนหน้า
          </button>
          <span className="text-sm text-gray-500">
            หน้า {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => p + 1)}
            disabled={page === totalPages}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30"
          >
            ถัดไป
          </button>
        </div>
      )}

      {/* Modals */}
      <LicenseModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={handleCreate}
      />

      <LicenseModal
        open={!!editingLicense}
        license={editingLicense}
        onClose={() => setEditingLicense(null)}
        onSave={data => handleUpdate(editingLicense!.id, data)}
      />

      <LicenseDrawer
        license={selectedLicense}
        onClose={() => setSelectedLicense(null)}
        onEdit={lic => {
          setSelectedLicense(null)
          setEditingLicense(lic)
        }}
        onResetDevice={handleResetDevice}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />
    </div>
  )
}
