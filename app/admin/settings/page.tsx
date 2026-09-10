'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'

interface Settings {
  system_name: string
  default_device_binding: string
  token_expire_minutes: string
}

export default function SettingsPage() {
  const adminFetch = useAdminFetch()

  const [settings, setSettings] = useState<Settings>({
    system_name: 'License Manager',
    default_device_binding: 'true',
    token_expire_minutes: '60',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminFetch('/api/admin/settings')
      .then(r => r.json())
      .then(json => {
        if (json.data) setSettings(json.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [adminFetch])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const res = await adminFetch('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          system_name: settings.system_name,
          default_device_binding: settings.default_device_binding === 'true',
          token_expire_minutes: parseInt(settings.token_expire_minutes, 10),
        }),
      })
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">ตั้งค่า</h1>
        <div className="card p-5 animate-pulse space-y-4">
          <div className="h-4 bg-surface-hover rounded w-24" />
          <div className="h-10 bg-surface-hover rounded" />
          <div className="h-10 bg-surface-hover rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h1 className="text-xl font-semibold text-white">ตั้งค่า</h1>
        <p className="text-sm text-gray-500 mt-0.5">ค่า Default ของระบบ</p>
      </div>

      <form onSubmit={handleSubmit} className="card p-5 space-y-5">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">ชื่อระบบ</label>
          <input
            type="text"
            value={settings.system_name}
            onChange={e => setSettings(s => ({ ...s, system_name: e.target.value }))}
            className="input-field"
            required
            maxLength={100}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Device Binding (ค่า Default)</label>
          <div className="flex gap-3">
            {[
              { value: 'true', label: 'เปิด' },
              { value: 'false', label: 'ปิด' },
            ].map(opt => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value={opt.value}
                  checked={settings.default_device_binding === opt.value}
                  onChange={e => setSettings(s => ({ ...s, default_device_binding: e.target.value }))}
                  className="accent-accent"
                />
                <span className="text-sm text-gray-300">{opt.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-600 mt-1">
            ใช้เป็นค่าเริ่มต้นเมื่อสร้าง License ใหม่
          </p>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1.5">
            อายุ Temporary Token (นาที)
          </label>
          <input
            type="number"
            value={settings.token_expire_minutes}
            onChange={e => setSettings(s => ({ ...s, token_expire_minutes: e.target.value }))}
            className="input-field"
            min="1"
            max="1440"
            required
          />
          <p className="text-xs text-gray-600 mt-1">
            Token ที่สร้างหลัง License ผ่านการตรวจสอบ (1–1440 นาที)
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className={`btn-primary w-full ${saved ? 'bg-green-600 hover:bg-green-600' : ''}`}
        >
          {saved ? 'บันทึกแล้ว' : saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
      </form>

      {/* API Endpoint info */}
      <div className="card p-5 space-y-3">
        <h2 className="text-sm font-medium text-gray-300">API Endpoint</h2>
        <div className="bg-surface rounded-lg p-3 font-mono text-xs text-gray-300 space-y-1">
          <div><span className="text-accent">POST</span> /api/license/check</div>
        </div>
        <div className="bg-surface rounded-lg p-3 font-mono text-xs text-gray-500 space-y-1">
          <div className="text-gray-400">{'{'}</div>
          <div className="pl-4"><span className="text-blue-300">&quot;license&quot;</span>: <span className="text-green-300">&quot;XXXX-XXXX-XXXX-XXXX&quot;</span>,</div>
          <div className="pl-4"><span className="text-blue-300">&quot;device_id&quot;</span>: <span className="text-green-300">&quot;DEVICE_ID&quot;</span></div>
          <div className="text-gray-400">{'}'}</div>
        </div>
      </div>
    </div>
  )
}
