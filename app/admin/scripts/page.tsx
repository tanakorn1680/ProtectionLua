'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'

interface ScriptRecord {
  id: string
  filename: string
  version: number
  created_at: string
  updated_at: string
  license_id: string
  licenses: {
    license_key: string
    name: string | null
    status: string
  }
}

interface License {
  id: string
  license_key: string
  name: string | null
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('th-TH', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

/** trigger browser download จาก string content */
function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function ScriptsPage() {
  const adminFetch = useAdminFetch()

  const [scripts, setScripts] = useState<ScriptRecord[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // form
  const [selectedLicenseId, setSelectedLicenseId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // loader popup หลัง upload
  const [loaderPopup, setLoaderPopup] = useState<{ filename: string; content: string } | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [scriptsRes, licensesRes] = await Promise.all([
        adminFetch('/api/admin/scripts'),
        adminFetch('/api/admin/licenses?limit=200'),
      ])
      const sj = await scriptsRes.json()
      const lj = await licensesRes.json()
      setScripts(sj.data ?? [])
      setLicenses(lj.data ?? [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [adminFetch])

  useEffect(() => { fetchData() }, [fetchData])

  // Drag & Drop
  useEffect(() => {
    const div = dropRef.current
    if (!div) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = () => setDragging(false)
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      if (file?.name.endsWith('.lua')) { setSelectedFile(file); setError('') }
      else setError('รองรับเฉพาะไฟล์ .lua เท่านั้น')
    }
    div.addEventListener('dragover', onDragOver)
    div.addEventListener('dragleave', onDragLeave)
    div.addEventListener('drop', onDrop)
    return () => {
      div.removeEventListener('dragover', onDragOver)
      div.removeEventListener('dragleave', onDragLeave)
      div.removeEventListener('drop', onDrop)
    }
  }, [])

  async function handleUpload() {
    setError('')
    if (!selectedLicenseId) { setError('กรุณาเลือก License ก่อน'); return }
    if (!selectedFile) { setError('กรุณาเลือกไฟล์ .lua'); return }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('license_id', selectedLicenseId)

      const res = await adminFetch('/api/admin/scripts', { method: 'POST', body: form })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'อัปโหลดล้มเหลว')

      // แสดง loader popup ทันที
      setLoaderPopup(json.loader)
      setSelectedFile(null)
      setSelectedLicenseId('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    } finally {
      setUploading(false)
    }
  }

  async function handleDownloadLoader(scriptId: string) {
    setDownloadingId(scriptId)
    try {
      const res = await adminFetch(`/api/admin/scripts/${scriptId}`)
      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'โหลดล้มเหลว')
      downloadText(json.loader.filename, json.loader.content)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ดาวน์โหลด Loader ล้มเหลว')
    } finally {
      setDownloadingId(null)
    }
  }

  async function handleDelete(id: string, filename: string) {
    if (!confirm(`ลบ script "${filename}" จริงหรือไม่?\nผู้ใช้ License นี้จะโหลด script ไม่ได้ทันที`)) return
    setDeletingId(id)
    try {
      const res = await adminFetch(`/api/admin/scripts/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      fetchData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'ลบล้มเหลว')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Scripts</h1>
        <p className="text-sm text-gray-500 mt-0.5">อัปโหลด .lua → ระบบเข้ารหัสเก็บไว้ → ดาวน์โหลด Loader ให้ผู้ใช้</p>
      </div>

      {/* Upload Card */}
      <div className="card p-4 space-y-4">
        <h2 className="text-sm font-medium text-white">อัปโหลด Script ใหม่</h2>

        <div>
          <label className="block text-xs text-gray-400 mb-1">License</label>
          <select
            value={selectedLicenseId}
            onChange={e => setSelectedLicenseId(e.target.value)}
            className="input-field"
          >
            <option value="">— เลือก License —</option>
            {licenses.map(l => (
              <option key={l.id} value={l.id}>
                {l.license_key}{l.name ? ` — ${l.name}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Drop Zone */}
        <div
          ref={dropRef}
          onClick={() => fileInputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
            ${dragging ? 'border-accent bg-accent/5' : 'border-surface-border hover:border-gray-500'}
            ${selectedFile ? 'border-green-500/50 bg-green-500/5' : ''}
          `}
        >
          {selectedFile ? (
            <div className="space-y-1">
              <p className="text-green-400 font-medium text-sm">📄 {selectedFile.name}</p>
              <p className="text-gray-500 text-xs">{(selectedFile.size / 1024).toFixed(1)} KB · คลิกเพื่อเปลี่ยน</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-2xl">📁</p>
              <p className="text-gray-300 text-sm">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
              <p className="text-gray-600 text-xs">.lua เท่านั้น · สูงสุด 512 KB</p>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".lua"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setSelectedFile(f); setError('') }
            }}
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            {error}
          </p>
        )}

        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !selectedLicenseId}
          className="btn-primary w-full disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              กำลังเข้ารหัสและบันทึก...
            </span>
          ) : 'อัปโหลด Script → รับ Loader'}
        </button>

        <p className="text-xs text-gray-600 text-center">
          🔒 เข้ารหัส AES-256-GCM ก่อนเก็บ · Script จริงไม่ออกจาก Server
        </p>
      </div>

      {/* Scripts List */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border flex items-center justify-between">
          <span className="text-sm font-medium text-white">Scripts ทั้งหมด</span>
          <span className="text-xs text-gray-500">{scripts.length} รายการ</span>
        </div>

        {loading ? (
          <div className="divide-y divide-surface-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="px-4 py-4 animate-pulse flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-surface-hover flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-surface-hover rounded w-40" />
                  <div className="h-3 bg-surface-hover rounded w-56" />
                </div>
              </div>
            ))}
          </div>
        ) : scripts.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-2xl mb-2">📭</p>
            <p className="text-sm text-gray-500">ยังไม่มี Script — อัปโหลดด้านบนได้เลย</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border">
            {scripts.map(s => {
              const isDownloading = downloadingId === s.id
              const isDeleting = deletingId === s.id
              const statusColor =
                s.licenses?.status === 'active' ? 'text-green-400' :
                s.licenses?.status === 'banned'  ? 'text-red-400' : 'text-gray-400'

              return (
                <div key={s.id} className="px-4 py-3.5 flex items-start gap-3 hover:bg-surface-hover/50 transition-colors">
                  {/* Icon */}
                  <div className="w-9 h-9 rounded-lg bg-surface-hover border border-surface-border flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                    </svg>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.filename}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">
                      License: <span className="text-gray-300">{s.licenses?.license_key}</span>
                      {s.licenses?.name ? ` — ${s.licenses.name}` : ''}
                      <span className={`ml-2 ${statusColor}`}>({s.licenses?.status})</span>
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5">
                      v{s.version} · {formatDate(s.updated_at)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Download Loader */}
                    <button
                      onClick={() => handleDownloadLoader(s.id)}
                      disabled={isDownloading}
                      title="ดาวน์โหลด Loader"
                      className="w-8 h-8 rounded-lg bg-accent/10 hover:bg-accent/20 border border-accent/20 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <span className="w-3.5 h-3.5 border border-accent/40 border-t-accent rounded-full animate-spin" />
                      ) : (
                        <svg className="w-3.5 h-3.5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      )}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(s.id, s.filename)}
                      disabled={isDeleting}
                      title="ลบ Script"
                      className="w-8 h-8 rounded-lg bg-red-500/5 hover:bg-red-500/10 border border-red-500/10 hover:border-red-500/20 flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <span className="w-3.5 h-3.5 border border-red-400/40 border-t-red-400 rounded-full animate-spin" />
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
      </div>

      {/* Loader Popup หลัง upload สำเร็จ */}
      {loaderPopup && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">อัปโหลดสำเร็จ</p>
                  <p className="text-xs text-gray-500">ดาวน์โหลด Loader เพื่อแจกให้ผู้ใช้</p>
                </div>
              </div>

              {/* Filename */}
              <div className="bg-surface rounded-lg border border-surface-border px-3 py-2">
                <p className="text-xs text-gray-500 mb-0.5">ไฟล์ Loader</p>
                <p className="text-sm text-white font-mono truncate">{loaderPopup.filename}</p>
              </div>

              <p className="text-xs text-gray-500">
                ⚠️ Loader ฝัง License Key ไว้แล้ว — แจกให้ผู้ใช้ไฟล์นี้เท่านั้น ไม่ต้องตั้งค่าอะไรเพิ่ม
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    downloadText(loaderPopup.filename, loaderPopup.content)
                    setLoaderPopup(null)
                  }}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  ดาวน์โหลด Loader
                </button>
                <button
                  onClick={() => setLoaderPopup(null)}
                  className="btn-ghost px-4"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
