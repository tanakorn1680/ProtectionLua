'use client'

import { useState, useRef, FormEvent } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'
import { useRouter } from 'next/navigation'

interface License {
  id: string
  license_key: string
  name: string | null
  status: string
}

export default function ProtectorPage() {
  const adminFetch = useAdminFetch()
  const router = useRouter()

  const [file, setFile] = useState<File | null>(null)
  const [licenses, setLicenses] = useState<License[]>([])
  const [licenseId, setLicenseId] = useState('')
  const [loadingLicenses, setLoadingLicenses] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [licensesLoaded, setLicensesLoaded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    setError('')
    if (!f) { setFile(null); return }
    if (!f.name.endsWith('.lua')) {
      setError('อนุญาตเฉพาะไฟล์ .lua')
      setFile(null)
      return
    }
    if (f.size > 512 * 1024) {
      setError('ไฟล์ใหญ่เกิน 512 KB')
      setFile(null)
      return
    }
    setFile(f)
    // load licenses on first file select
    if (!licensesLoaded) loadLicenses()
  }

  async function loadLicenses() {
    setLoadingLicenses(true)
    setLicensesLoaded(true)
    try {
      const res = await adminFetch('/api/admin/licenses?limit=50&status=active')
      const json = await res.json()
      const now = new Date()
      const active = (json.data ?? []).filter((l: License & { expires_at?: string }) =>
        l.status === 'active' && (!l.expires_at || new Date(l.expires_at) > now)
      )
      setLicenses(active)
      if (active.length > 0) setLicenseId(active[0].id)
    } catch {
      setError('โหลด License ไม่สำเร็จ')
    } finally {
      setLoadingLicenses(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!file) { setError('กรุณาเลือกไฟล์'); return }
    if (!licenseId) { setError('กรุณาเลือก License'); return }

    setError('')
    setProcessing(true)

    try {
      const form = new FormData()
      form.append('file', file)
      form.append('license_id', licenseId)

      const token = await getToken()
      const res = await fetch('/api/admin/protected', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })

      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error ?? 'เกิดข้อผิดพลาด')
        return
      }

      // redirect to protected scripts list
      router.push('/admin/protected')
    } catch {
      setError('เกิดข้อผิดพลาด ลองใหม่')
    } finally {
      setProcessing(false)
    }
  }

  // get token directly from Supabase
  async function getToken(): Promise<string> {
    const { getSupabaseClient } = await import('@/lib/supabase/client')
    const sb = getSupabaseClient()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? ''
  }

  const canSubmit = !!file && !!licenseId && !processing

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h1 className="text-xl font-semibold text-white">Lua Protector</h1>
        <p className="text-sm text-gray-500 mt-0.5">อัปโหลด Script และสร้าง Loader อัตโนมัติ</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* File drop zone */}
        <div
          className={`card p-6 border-2 border-dashed transition-colors cursor-pointer ${
            file
              ? 'border-accent/40 bg-accent/5'
              : 'border-surface-border hover:border-accent/30'
          }`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".lua"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{file.name}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {file.size < 1024
                    ? `${file.size} B`
                    : file.size < 1024 * 1024
                      ? `${(file.size / 1024).toFixed(1)} KB`
                      : `${(file.size / 1024 / 1024).toFixed(1)} MB`
                  }
                </div>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-300 mt-1"
                  onClick={e => { e.stopPropagation(); setFile(null); setLicenses([]); setLicensesLoaded(false) }}
                >
                  เปลี่ยนไฟล์
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <svg className="w-8 h-8 text-gray-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <div className="text-sm text-gray-400">แตะเพื่อเลือกไฟล์ .lua</div>
              <div className="text-xs text-gray-600 mt-0.5">ขนาดสูงสุด 512 KB</div>
            </div>
          )}
        </div>

        {/* License selector */}
        {file && (
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">License</label>
            {loadingLicenses ? (
              <div className="input-field text-gray-600">กำลังโหลด...</div>
            ) : licenses.length === 0 ? (
              <div className="card p-3 text-sm text-amber-400 bg-amber-500/10 border-amber-500/20">
                ไม่พบ License ที่ใช้งานได้ กรุณาสร้าง License ก่อน
              </div>
            ) : (
              <select
                value={licenseId}
                onChange={e => setLicenseId(e.target.value)}
                className="input-field"
              >
                {licenses.map(l => (
                  <option key={l.id} value={l.id}>
                    {l.license_key}{l.name ? ` — ${l.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || licenses.length === 0}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          {processing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              กำลังสร้าง Protected Payload...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              สร้าง Loader
            </>
          )}
        </button>
      </form>

      {/* Info card */}
      <div className="card p-4 space-y-2">
        <div className="text-xs font-medium text-gray-400">ขั้นตอนการทำงาน</div>
        {[
          'อัปโหลด .lua → เก็บใน Private Storage',
          'เข้ารหัส AES-256-GCM + HMAC ฝั่ง Server',
          'สร้าง Loader.lua (ไม่มี Key ใดๆ)',
          'ดาวน์โหลด Loader และนำไปใช้งาน',
        ].map((step, i) => (
          <div key={i} className="flex items-start gap-2 text-xs text-gray-500">
            <span className="text-accent font-mono mt-0.5">{i + 1}.</span>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
