'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'
import type { ProtectedScript } from '@/lib/types/protector'

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
      status === 'active'
        ? 'text-green-400 bg-green-500/10 border-green-500/20'
        : 'text-gray-400 bg-gray-500/10 border-gray-500/20'
    }`}>
      {status === 'active' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
    </span>
  )
}

function fmt(dt: string | null) {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('th-TH', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ProtectedPage() {
  const adminFetch = useAdminFetch()
  const [scripts, setScripts] = useState<ProtectedScript[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [selected, setSelected] = useState<ProtectedScript | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<ProtectedScript | null>(null)
  const [deleteSource, setDeleteSource] = useState(false)

  const LIMIT = 20

  const fetchScripts = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
      const res = await adminFetch(`/api/admin/protected/list?${params}`)
      const json = await res.json()
      setScripts(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [adminFetch])

  useEffect(() => { fetchScripts(page) }, [page]) // eslint-disable-line

  async function downloadLoader(script: ProtectedScript) {
    setActionId(script.id)
    try {
      const token = await getToken()
      const res = await fetch(`/api/admin/protected/${script.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { alert('ดาวน์โหลดไม่สำเร็จ'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = script.original_filename.replace(/\.lua$/, '') + '-Loader.lua'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setActionId(null)
    }
  }

  async function handleAction(id: string, body: Record<string, unknown>) {
    setActionId(id)
    try {
      const res = await adminFetch(`/api/admin/protected/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json()
        alert(j.error ?? 'เกิดข้อผิดพลาด')
        return
      }
      await fetchScripts(page)
      setSelected(null)
    } finally {
      setActionId(null)
    }
  }

  async function handleDelete() {
    if (!deleteConfirm) return
    setActionId(deleteConfirm.id)
    try {
      const token = await getToken()
      const res = await fetch(
        `/api/admin/protected/${deleteConfirm.id}?delete_source=${deleteSource}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      )
      if (!res.ok) { alert('ลบไม่สำเร็จ'); return }
      setDeleteConfirm(null)
      setSelected(null)
      await fetchScripts(page)
    } finally {
      setActionId(null)
    }
  }

  async function getToken(): Promise<string> {
    const { getSupabaseClient } = await import('@/lib/supabase/client')
    const sb = getSupabaseClient()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? ''
  }

  const totalPages = Math.ceil(total / LIMIT)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Protected Scripts</h1>
          <p className="text-sm text-gray-500 mt-0.5">{total} รายการ</p>
        </div>
        <a href="/admin/protector" className="btn-primary text-sm flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Protect ใหม่
        </a>
      </div>

      <div className="card divide-y divide-surface-border overflow-hidden">
        {loading ? (
          [...Array(4)].map((_, i) => (
            <div key={i} className="px-4 py-4 animate-pulse space-y-2">
              <div className="h-4 bg-surface-hover rounded w-40" />
              <div className="h-3 bg-surface-hover rounded w-24" />
            </div>
          ))
        ) : scripts.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-500 text-sm">
            ยังไม่มี Protected Scripts
          </div>
        ) : (
          scripts.map(script => (
            <button
              key={script.id}
              onClick={() => setSelected(script)}
              className="w-full px-4 py-3.5 flex items-center gap-3 hover:bg-surface-hover transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{script.original_filename}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                  <span className="font-mono">{script.protection_id}</span>
                  {script.license && (
                    <span className="truncate max-w-[100px]">
                      · {script.license.license_key}
                    </span>
                  )}
                </div>
              </div>
              <StatusBadge status={script.status} />
            </button>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">ก่อนหน้า</button>
          <span className="text-sm text-gray-500">หน้า {page} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}
            className="btn-ghost text-xs px-3 py-1.5 disabled:opacity-30">ถัดไป</button>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border sticky top-0 bg-surface-card">
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="card p-3 space-y-2.5">
                {[
                  ['ไฟล์', selected.original_filename],
                  ['Protection ID', selected.protection_id],
                  ['License', selected.license?.license_key ?? '—'],
                  ['สร้างเมื่อ', fmt(selected.created_at)],
                  ['ใช้งานล่าสุด', fmt(selected.last_used_at)],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 text-sm">
                    <span className="text-gray-500 flex-shrink-0">{label}</span>
                    <span className="text-gray-200 text-right font-mono text-xs break-all">{value}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {/* Download Loader */}
                <button
                  onClick={() => downloadLoader(selected)}
                  disabled={actionId === selected.id}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  ดาวน์โหลด Loader.lua
                </button>

                {/* Regenerate */}
                <button
                  onClick={() => {
                    if (confirm('Regenerate Loader? Loader เดิมจะหยุดทำงาน')) {
                      handleAction(selected.id, { action: 'regenerate' })
                    }
                  }}
                  disabled={actionId === selected.id}
                  className="btn-ghost w-full flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                  </svg>
                  Regenerate Loader
                </button>

                {/* Toggle status */}
                {selected.status === 'active' ? (
                  <button
                    onClick={() => handleAction(selected.id, { status: 'disabled' })}
                    disabled={actionId === selected.id}
                    className="btn-ghost w-full flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    ปิดใช้งาน
                  </button>
                ) : (
                  <button
                    onClick={() => handleAction(selected.id, { status: 'active' })}
                    disabled={actionId === selected.id}
                    className="btn-ghost w-full flex items-center justify-center gap-2 text-green-400 hover:text-green-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    เปิดใช้งาน
                  </button>
                )}

                {/* Delete */}
                <button
                  onClick={() => { setDeleteConfirm(selected); setDeleteSource(false) }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                  </svg>
                  ลบ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-surface-card border border-surface-border rounded-xl w-full max-w-sm p-5 space-y-4">
            <h3 className="text-base font-semibold text-white">ยืนยันการลบ</h3>
            <p className="text-sm text-gray-400">
              ลบ <span className="text-white font-medium">{deleteConfirm.original_filename}</span>?
              <br />Loader ที่แจกไปจะหยุดทำงานทันที
            </p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteSource}
                onChange={e => setDeleteSource(e.target.checked)}
                className="accent-red-500"
              />
              <span className="text-sm text-red-400">ลบ Source ต้นฉบับด้วย (ไม่สามารถกู้คืนได้)</span>
            </label>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn-ghost flex-1">ยกเลิก</button>
              <button
                onClick={handleDelete}
                disabled={!!actionId}
                className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {actionId ? 'กำลังลบ...' : 'ลบ'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
