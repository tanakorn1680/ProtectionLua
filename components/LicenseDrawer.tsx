'use client'

import { useState } from 'react'
import { withEffectiveStatus } from '@/lib/license'
import { StatusBadge } from './StatusBadge'
import type { License } from '@/lib/types'

interface LicenseDrawerProps {
  license: License | null
  onClose: () => void
  onEdit: (license: License) => void
  onResetDevice: (license: License) => void
  onStatusChange: (license: License, status: 'active' | 'disabled' | 'banned') => void
  onDelete: (license: License) => void
}

function Row({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm text-gray-200 break-all ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </span>
    </div>
  )
}

export function LicenseDrawer({
  license,
  onClose,
  onEdit,
  onResetDevice,
  onStatusChange,
  onDelete,
}: LicenseDrawerProps) {
  const [copied, setCopied] = useState(false)

  if (!license) return null

  const computed = withEffectiveStatus(license)

  function copyKey() {
    navigator.clipboard.writeText(license!.license_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function fmt(dt: string | null) {
    if (!dt) return null
    return new Date(dt).toLocaleString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-surface-card border border-surface-border rounded-t-2xl sm:rounded-xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border sticky top-0 bg-surface-card">
          <div className="flex items-center gap-2">
            <StatusBadge status={computed.effective_status} />
            {license.device_binding_enabled && (
              <span className="badge text-blue-400 bg-blue-500/10 border-blue-500/20">Device Bind</span>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* License Key */}
          <div className="card p-3 flex items-center justify-between gap-3">
            <span className="font-mono text-sm text-white tracking-wider flex-1 break-all">
              {license.license_key}
            </span>
            <button onClick={copyKey} className="flex-shrink-0 text-gray-400 hover:text-accent transition-colors">
              {copied ? (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              )}
            </button>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-3">
            <Row label="ชื่อ" value={license.name} />
            <Row label="วันหมดอายุ" value={fmt(license.expires_at)} />
            <Row label="Device ID" value={license.device_id} mono />
            <Row label="IP ล่าสุด" value={license.last_ip} mono />
            <Row label="ใช้งานล่าสุด" value={fmt(license.last_seen)} />
            <Row label="สร้างเมื่อ" value={fmt(license.created_at)} />
          </div>

          {license.note && (
            <div className="card p-3">
              <span className="text-xs text-gray-500 block mb-1">หมายเหตุ</span>
              <span className="text-sm text-gray-300">{license.note}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2 pt-1">
            <button onClick={() => onEdit(license)} className="btn-ghost w-full justify-start gap-2 flex items-center">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
              </svg>
              แก้ไขข้อมูล
            </button>

            {license.device_id && (
              <button onClick={() => onResetDevice(license)} className="btn-ghost w-full justify-start gap-2 flex items-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3" />
                </svg>
                Reset Device
              </button>
            )}

            {license.status !== 'disabled' && (
              <button
                onClick={() => onStatusChange(license, 'disabled')}
                className="btn-ghost w-full justify-start gap-2 flex items-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                ปิดใช้งาน
              </button>
            )}

            {license.status !== 'active' && (
              <button
                onClick={() => onStatusChange(license, 'active')}
                className="btn-ghost w-full justify-start gap-2 flex items-center text-green-400 hover:text-green-300"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                เปิดใช้งาน
              </button>
            )}

            {license.status !== 'banned' && (
              <button
                onClick={() => onStatusChange(license, 'banned')}
                className="btn-danger w-full justify-start gap-2 flex items-center"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                แบน License
              </button>
            )}

            <button
              onClick={() => onDelete(license)}
              className="w-full text-left flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 transition-colors border border-transparent hover:border-red-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              ลบ License
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
