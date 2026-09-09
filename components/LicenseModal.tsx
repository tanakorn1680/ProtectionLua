'use client'

import { useState, useEffect, FormEvent } from 'react'
import type { License } from '@/lib/types'

interface LicenseModalProps {
  open: boolean
  license?: License | null
  onClose: () => void
  onSave: (data: Partial<License> & { license_key?: string }) => Promise<void>
}

export function LicenseModal({ open, license, onClose, onSave }: LicenseModalProps) {
  const isEdit = !!license

  const [form, setForm] = useState({
    license_key: '',
    name: '',
    note: '',
    expires_at: '',
    device_binding_enabled: true,
    status: 'active' as 'active' | 'disabled' | 'banned',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (license) {
      setForm({
        license_key: license.license_key,
        name: license.name ?? '',
        note: license.note ?? '',
        expires_at: license.expires_at
          ? new Date(license.expires_at).toISOString().slice(0, 16)
          : '',
        device_binding_enabled: license.device_binding_enabled,
        status: license.status,
      })
    } else {
      setForm({
        license_key: '',
        name: '',
        note: '',
        expires_at: '',
        device_binding_enabled: true,
        status: 'active',
      })
    }
    setError('')
  }, [license, open])

  if (!open) return null

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await onSave({
        license_key: form.license_key.trim() || undefined,
        name: form.name.trim() || undefined,
        note: form.note.trim() || undefined,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
        device_binding_enabled: form.device_binding_enabled,
        status: form.status,
      })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border sticky top-0 bg-surface-card">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'แก้ไข License' : 'สร้าง License ใหม่'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                License Key <span className="text-gray-600">(เว้นว่างเพื่อสุ่มอัตโนมัติ)</span>
              </label>
              <input
                type="text"
                value={form.license_key}
                onChange={e => setForm(f => ({ ...f, license_key: e.target.value.toUpperCase() }))}
                className="input-field font-mono text-xs"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                pattern="[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}|"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">ชื่อ / ผู้ใช้</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-field"
              placeholder="ชื่อลูกค้าหรือผู้ใช้"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">หมายเหตุ</label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="input-field resize-none h-20"
              placeholder="บันทึกเพิ่มเติม..."
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1.5">วันหมดอายุ <span className="text-gray-600">(เว้นว่างถ้าไม่มีวันหมดอายุ)</span></label>
            <input
              type="datetime-local"
              value={form.expires_at}
              onChange={e => setForm(f => ({ ...f, expires_at: e.target.value }))}
              className="input-field"
            />
          </div>

          {isEdit && (
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">สถานะ</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as typeof f.status }))}
                className="input-field"
              >
                <option value="active">ใช้งานได้</option>
                <option value="disabled">ปิดใช้งาน</option>
                <option value="banned">แบน</option>
              </select>
            </div>
          )}

          <div className="flex items-center justify-between py-1">
            <div>
              <div className="text-sm text-gray-300">Device Binding</div>
              <div className="text-xs text-gray-500">ผูก License กับอุปกรณ์</div>
            </div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, device_binding_enabled: !f.device_binding_enabled }))}
              className={`relative w-10 h-5.5 rounded-full transition-colors flex-shrink-0 ${
                form.device_binding_enabled ? 'bg-accent' : 'bg-gray-600'
              }`}
              style={{ height: '22px', width: '40px' }}
            >
              <span
                className={`absolute top-0.5 w-[18px] h-[18px] bg-white rounded-full shadow transition-transform ${
                  form.device_binding_enabled ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-ghost flex-1">
              ยกเลิก
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'สร้าง'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
