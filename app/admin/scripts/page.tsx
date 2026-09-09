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

export default function ScriptsPage() {
  const adminFetch = useAdminFetch()

  const [scripts, setScripts] = useState<ScriptRecord[]>([])
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [selectedLicenseId, setSelectedLicenseId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [scriptsRes, licensesRes] = await Promise.all([
        adminFetch('/api/admin/scripts'),
        adminFetch('/api/admin/licenses?limit=200'),
      ])
      const scriptsJson = await scriptsRes.json()
      const licensesJson = await licensesRes.json()
      setScripts(scriptsJson.data ?? [])
      setLicenses(licensesJson.data ?? [])
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
      if (file && file.name.endsWith('.lua')) {
        setSelectedFile(file)
        setError('')
      } else {
        setError('รองรับเฉพาะไฟล์ .lua เท่านั้น')
      }
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
    setSuccess('')

    if (!selectedLicenseId) { setError('กรุณาเลือก License ก่อน'); return }
    if (!selectedFile) { setError('กรุณาเลือกไฟล์ .lua'); return }

    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('license_id', selectedLicenseId)

      const res = await adminFetch('/api/admin/scripts', {
        method: 'POST',
        body: form,
      })

      const json = await res.json()
      if (!json.success) throw new Error(json.error || 'Upload failed')

      setSuccess(`✅ อัพโหลดสำเร็จ: ${selectedFile.name} (v${json.script.version})`)
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

  async function handleDelete(id: string, filename: string) {
    if (!confirm(`ลบ script "${filename}" จริงหรือไม่?\nผู้ใช้ License นี้จะโหลด script ไม่ได้`)) return

    try {
      const res = await adminFetch(`/api/admin/scripts/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      setSuccess(`ลบ script "${filename}" แล้ว`)
      fetchData()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
    }
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-white">จัดการ Scripts</h1>

      {/* Upload Card */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300">อัพโหลด Script</h2>

        {/* License Selector */}
        <div>
          <label className="block text-xs text-zinc-400 mb-1">เลือก License</label>
          <select
            value={selectedLicenseId}
            onChange={e => setSelectedLicenseId(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="">-- เลือก License --</option>
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
            ${dragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-600 hover:border-zinc-400'}
            ${selectedFile ? 'border-green-500 bg-green-500/10' : ''}
          `}
        >
          {selectedFile ? (
            <div className="space-y-1">
              <p className="text-green-400 font-medium text-sm">📄 {selectedFile.name}</p>
              <p className="text-zinc-500 text-xs">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              <p className="text-zinc-500 text-xs">คลิกเพื่อเปลี่ยนไฟล์</p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-2xl">📁</p>
              <p className="text-zinc-300 text-sm">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
              <p className="text-zinc-500 text-xs">รองรับ .lua เท่านั้น (สูงสุด 512KB)</p>
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

        {/* Error / Success */}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">{success}</p>}

        {/* Upload Button */}
        <button
          onClick={handleUpload}
          disabled={uploading || !selectedFile || !selectedLicenseId}
          className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {uploading ? 'กำลังเข้ารหัสและอัพโหลด...' : 'เข้ารหัส + อัพโหลด Script'}
        </button>

        <p className="text-xs text-zinc-500 text-center">
          🔒 โค้ดจะถูกเข้ารหัส AES-256-GCM ก่อนเก็บใน DB ทันที
        </p>
      </div>

      {/* Scripts Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300">Scripts ที่อัพโหลดแล้ว</h2>
          <span className="text-xs text-zinc-500">{scripts.length} รายการ</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-zinc-500 text-sm">กำลังโหลด...</div>
        ) : scripts.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm">ยังไม่มี Script</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {scripts.map(s => (
              <div key={s.id} className="px-4 py-3 flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm text-white font-medium truncate">{s.filename}</p>
                  <p className="text-xs text-zinc-400 truncate">
                    License: <span className="text-zinc-300">{s.licenses?.license_key}</span>
                    {s.licenses?.name ? ` — ${s.licenses.name}` : ''}
                  </p>
                  <p className="text-xs text-zinc-500">
                    v{s.version} · อัพเดตล่าสุด {formatDate(s.updated_at)}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(s.id, s.filename)}
                  className="flex-shrink-0 text-xs text-red-400 hover:text-red-300 border border-red-900 hover:border-red-700 rounded-lg px-2 py-1 transition-colors"
                >
                  ลบ
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
