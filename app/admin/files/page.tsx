'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminFetch } from '@/lib/AdminContext'
import type { ProtectedFile, ProtectionStatus, ProtectionLevel } from '@/lib/types'

const STATUS_BADGE: Record<ProtectionStatus, { label: string; cls: string }> = {
  uploaded: { label: 'อัปโหลดแล้ว', cls: 'border-blue-500/30 text-blue-400 bg-blue-500/10' },
  processing: { label: 'กำลังประมวลผล', cls: 'border-yellow-500/30 text-yellow-400 bg-yellow-500/10' },
  completed: { label: 'สำเร็จ', cls: 'border-green-500/30 text-green-400 bg-green-500/10' },
  failed: { label: 'ผิดพลาด', cls: 'border-red-500/30 text-red-400 bg-red-500/10' },
}

const LEVEL_BADGE: Record<ProtectionLevel, { label: string; cls: string }> = {
  basic: { label: 'Basic', cls: 'border-blue-500/20 text-blue-300 bg-blue-500/5' },
  standard: { label: 'Standard', cls: 'border-accent/20 text-accent bg-accent/5' },
  strong: { label: 'Strong', cls: 'border-purple-500/20 text-purple-300 bg-purple-500/5' },
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function FilesPage() {
  const adminFetch = useAdminFetch()
  const router = useRouter()

  const [files, setFiles] = useState<ProtectedFile[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const limit = 20

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      if (levelFilter) params.set('level', levelFilter)

      const res = await adminFetch(`/api/admin/protected-files?${params}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'โหลดข้อมูลล้มเหลว')
      setFiles(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [adminFetch, page, search, statusFilter, levelFilter])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  // reset to page 1 when filters change
  useEffect(() => { setPage(1) }, [search, statusFilter, levelFilter])

  async function handleDelete(file: ProtectedFile) {
    if (!confirm(`ลบไฟล์ "${file.original_filename}" จริงหรือไม่?\nไฟล์ที่ป้องกันแล้วจะถูกลบออกจากระบบ`)) return
    setDeletingId(file.id)
    try {
      const res = await adminFetch(`/api/admin/protected-files/${file.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      fetchFiles()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ลบล้มเหลว')
    } finally {
      setDeletingId(null)
    }
  }

  function handleDownload(file: ProtectedFile) {
    setDownloadingId(file.id)
    window.location.href = `/api/admin/protected-files/${file.id}/download`
    setTimeout(() => setDownloadingId(null), 2000)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">ไฟล์ที่ป้องกันแล้ว</h1>
          <p className="text-sm text-gray-500 mt-0.5">ประวัติการป้องกันไฟล์ทั้งหมด</p>
        </div>
        <button
          onClick={() => router.push('/admin/protect')}
          className="btn-primary flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span className="hidden sm:inline">ป้องกันไฟล์ใหม่</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อไฟล์..."
            className="input-field pl-9"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="input-field sm:w-36"
        >
          <option value="">สถานะทั้งหมด</option>
          <option value="completed">สำเร็จ</option>
          <option value="processing">กำลังประมวลผล</option>
          <option value="failed">ผิดพลาด</option>
        </select>
        <select
          value={levelFilter}
          onChange={e => setLevelFilter(e.target.value)}
          className="input-field sm:w-36"
        >
          <option value="">ระดับทั้งหมด</option>
          <option value="basic">Basic</option>
          <option value="standard">Standard</option>
          <option value="strong">Strong</option>
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <span className="text-sm font-medium text-white">รายการทั้งหมด</span>
          <span className="text-xs text-gray-500">{total} ไฟล์</span>
        </div>

        {loading ? (
          <div className="divide-y divide-surface-border">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="px-4 py-4 animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-hover" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-surface-hover rounded w-48" />
                  <div className="h-3 bg-surface-hover rounded w-32" />
                </div>
                <div className="h-6 w-16 bg-surface-hover rounded" />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-12 h-12 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">ยังไม่มีไฟล์ที่ป้องกัน</p>
            <button
              onClick={() => router.push('/admin/protect')}
              className="mt-3 text-xs text-accent hover:text-accent-hover transition-colors"
            >
              เริ่มป้องกันไฟล์แรก →
            </button>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {files.map(file => {
              const statusInfo = STATUS_BADGE[file.status]
              const levelInfo = LEVEL_BADGE[file.protection_level]
              const isDeleting = deletingId === file.id
              const isDownloading = downloadingId === file.id

              return (
                <div key={file.id} className="px-4 py-3.5 flex items-start gap-3 hover:bg-surface-hover/50 transition-colors">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-surface-hover border border-surface-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="text-sm font-medium text-white truncate max-w-[200px] sm:max-w-none">
                        {file.original_filename}
                      </p>
                      <span className={`badge ${statusInfo.cls}`}>{statusInfo.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className={`badge text-[10px] ${levelInfo.cls}`}>{levelInfo.label}</span>
                      {file.license_mode === 'require_validation' && (
                        <span className="badge border-purple-500/20 text-purple-400 bg-purple-500/5 text-[10px]">
                          License
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatSize(file.original_size)}
                        {file.protected_size && (
                          <span className="text-gray-600"> → {formatSize(file.protected_size)}</span>
                        )}
                      </span>
                      <span className="text-xs text-gray-600">{formatDate(file.created_at)}</span>
                    </div>
                    {file.error_message && (
                      <p className="text-xs text-red-400 mt-1 truncate">⚠ {file.error_message}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {file.status === 'completed' && (
                      <button
                        onClick={() => handleDownload(file)}
                        disabled={isDownloading}
                        title="ดาวน์โหลด"
                        className="w-8 h-8 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/20 flex items-center justify-center transition-colors disabled:opacity-50"
                      >
                        <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(file)}
                      disabled={isDeleting}
                      title="ลบ"
                      className="w-8 h-8 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <div className="w-3 h-3 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-surface-border flex items-center justify-between">
            <span className="text-xs text-gray-500">
              หน้า {page}/{totalPages} · {total} รายการ
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ← ก่อนหน้า
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-ghost px-3 py-1.5 text-xs disabled:opacity-40"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
