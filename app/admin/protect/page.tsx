'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAdminFetch } from '@/lib/AdminContext'
import type { ProtectionLevel, LicenseMode } from '@/lib/types'

interface License {
  id: string
  license_key: string
  name: string | null
  status: string
}

type Step = 'upload' | 'configure' | 'processing' | 'completed' | 'failed'

const LEVEL_INFO: Record<
  ProtectionLevel,
  { label: string; desc: string; color: string; features: string[] }
> = {
  basic: {
    label: 'Basic',
    color: 'border-blue-500/40 bg-blue-500/5',
    desc: 'การป้องกันเบื้องต้น เหมาะสำหรับไฟล์ทั่วไป',
    features: ['เปลี่ยนชื่อ Local Variables', 'เพิ่ม Header ป้องกัน', 'String Encoding พื้นฐาน'],
  },
  standard: {
    label: 'Standard',
    color: 'border-accent/40 bg-accent/5',
    desc: 'การป้องกันระดับกลาง เหมาะสำหรับงานเชิงพาณิชย์',
    features: [
      'รวม Basic ทั้งหมด',
      'String Encryption',
      'Control Flow Transformation',
      'Integrity Check',
      'Junk Code Injection',
    ],
  },
  strong: {
    label: 'Strong',
    color: 'border-purple-500/40 bg-purple-500/5',
    desc: 'การป้องกันสูงสุด รองรับ License Validation',
    features: [
      'รวม Standard ทั้งหมด',
      'Numeric Encoding',
      'License Validation Layer',
      'API Integration',
      'ตรวจสอบสิทธิ์ก่อนรัน',
    ],
  },
}

function StepIndicator({ current }: { current: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'upload', label: 'อัปโหลด' },
    { key: 'configure', label: 'ตั้งค่า' },
    { key: 'processing', label: 'ประมวลผล' },
    { key: 'completed', label: 'เสร็จสิ้น' },
  ]
  const order = ['upload', 'configure', 'processing', 'completed', 'failed']
  const currentIdx = order.indexOf(current)

  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((s, i) => {
        const idx = order.indexOf(s.key)
        const done = currentIdx > idx
        const active = currentIdx === idx
        const isFailed = current === 'failed' && s.key === 'processing'
        return (
          <div key={s.key} className="flex items-center flex-1">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium border transition-all ${
                  isFailed
                    ? 'border-red-500 bg-red-500/10 text-red-400'
                    : done
                    ? 'border-accent bg-accent/20 text-accent'
                    : active
                    ? 'border-accent bg-accent text-white'
                    : 'border-surface-border bg-surface text-gray-600'
                }`}
              >
                {isFailed ? '✕' : done ? '✓' : i + 1}
              </div>
              <span
                className={`text-[10px] hidden sm:block whitespace-nowrap ${
                  active ? 'text-accent' : done ? 'text-gray-400' : 'text-gray-600'
                }`}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`flex-1 h-px mx-1 transition-colors ${
                  done ? 'bg-accent/40' : 'bg-surface-border'
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ProtectPage() {
  const adminFetch = useAdminFetch()
  const router = useRouter()

  const [step, setStep] = useState<Step>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState('')

  const [level, setLevel] = useState<ProtectionLevel>('standard')
  const [licenseMode, setLicenseMode] = useState<LicenseMode>('none')
  const [licenseId, setLicenseId] = useState('')
  const [licenses, setLicenses] = useState<License[]>([])
  const [loadingLicenses, setLoadingLicenses] = useState(false)

  const [processing, setProcessing] = useState(false)
  const [resultId, setResultId] = useState('')
  const [resultFilename, setResultFilename] = useState('')
  const [resultSize, setResultSize] = useState(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [downloading, setDownloading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  // โหลด licenses สำหรับ Strong mode
  const loadLicenses = useCallback(async () => {
    setLoadingLicenses(true)
    try {
      const res = await adminFetch('/api/admin/licenses?limit=200&status=active')
      const json = await res.json()
      setLicenses(json.data ?? [])
    } catch {
      setLicenses([])
    } finally {
      setLoadingLicenses(false)
    }
  }, [adminFetch])

  useEffect(() => {
    if (level === 'strong') loadLicenses()
  }, [level, loadLicenses])

  // Drag & drop
  useEffect(() => {
    const div = dropRef.current
    if (!div) return
    const onDragOver = (e: DragEvent) => { e.preventDefault(); setDragging(true) }
    const onDragLeave = (e: DragEvent) => {
      if (!div.contains(e.relatedTarget as Node)) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer?.files[0]
      handleFileSelect(file)
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

  function handleFileSelect(file: File | undefined | null) {
    setFileError('')
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.lua')) {
      setFileError('รองรับเฉพาะไฟล์ .lua เท่านั้น')
      return
    }
    if (file.size > 512 * 1024) {
      setFileError('ไฟล์ใหญ่เกินไป (สูงสุด 512KB)')
      return
    }
    setSelectedFile(file)
    setStep('configure')
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  function formatDate(d: Date): string {
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  }

  async function handleProtect() {
    if (!selectedFile) return
    setProcessing(true)
    setStep('processing')
    setErrorMsg('')

    try {
      const form = new FormData()
      form.append('file', selectedFile)
      form.append('level', level)
      form.append('license_mode', licenseMode)
      if (licenseMode === 'require_validation' && licenseId) {
        form.append('license_id', licenseId)
      }

      const res = await adminFetch('/api/admin/protect', {
        method: 'POST',
        body: form,
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? 'เกิดข้อผิดพลาดในการประมวลผล')
      }

      setResultId(json.id)
      setResultFilename(json.filename)
      setResultSize(json.size)
      setStep('completed')
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : 'เกิดข้อผิดพลาด')
      setStep('failed')
    } finally {
      setProcessing(false)
    }
  }

  async function handleDownload() {
    if (!resultId) return
    setDownloading(true)
    try {
      window.location.href = `/api/admin/protected-files/${resultId}/download`
    } finally {
      setTimeout(() => setDownloading(false), 2000)
    }
  }

  function handleReset() {
    setStep('upload')
    setSelectedFile(null)
    setFileError('')
    setLevel('standard')
    setLicenseMode('none')
    setLicenseId('')
    setResultId('')
    setResultFilename('')
    setResultSize(0)
    setErrorMsg('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">ป้องกันไฟล์ Lua</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          เพิ่มความยากในการวิเคราะห์และแก้ไขไฟล์ด้วยระบบ Protection
        </p>
      </div>

      <StepIndicator current={step} />

      {/* Disclaimer */}
      <div className="card p-3 border-yellow-500/20 bg-yellow-500/5 flex gap-3">
        <svg className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
        <p className="text-xs text-yellow-300/80">
          การป้องกันมีเป้าหมายเพื่อ<strong className="text-yellow-300">เพิ่มความยาก</strong>ในการวิเคราะห์และแก้ไขไฟล์
          ไม่ใช่การป้องกัน Reverse Engineering ได้ 100%
        </p>
      </div>

      {/* STEP: Upload */}
      {(step === 'upload' || (step === 'configure' && selectedFile)) && (
        <div className="card p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-white">1. อัปโหลดไฟล์ Lua</h2>
            {selectedFile && (
              <button
                onClick={() => {
                  setSelectedFile(null)
                  setStep('upload')
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                เปลี่ยนไฟล์
              </button>
            )}
          </div>

          {!selectedFile ? (
            <div
              ref={dropRef}
              onClick={() => fileInputRef.current?.click()}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                ${dragging
                  ? 'border-accent bg-accent/10 scale-[1.01]'
                  : 'border-surface-border hover:border-gray-500 hover:bg-surface-hover'
                }
              `}
            >
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-surface-hover border border-surface-border flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-white font-medium">ลากไฟล์มาวาง หรือคลิกเพื่อเลือก</p>
                  <p className="text-xs text-gray-500 mt-1">รองรับเฉพาะ .lua (สูงสุด 512KB)</p>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lua"
                className="hidden"
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-hover border border-surface-border">
              <div className="w-9 h-9 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {formatSize(selectedFile.size)} · {formatDate(new Date())}
                </p>
              </div>
              <span className="badge border-green-500/30 text-green-400 bg-green-500/10 text-[10px]">
                พร้อม
              </span>
            </div>
          )}

          {fileError && (
            <div className="flex items-center gap-2 text-red-400 text-sm">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {fileError}
            </div>
          )}
        </div>
      )}

      {/* STEP: Configure */}
      {step === 'configure' && selectedFile && (
        <div className="space-y-4">
          {/* Protection Level */}
          <div className="card p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-medium text-white">2. ระดับการป้องกัน</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(Object.keys(LEVEL_INFO) as ProtectionLevel[]).map(l => {
                const info = LEVEL_INFO[l]
                const active = level === l
                return (
                  <button
                    key={l}
                    onClick={() => setLevel(l)}
                    className={`text-left p-3 rounded-xl border-2 transition-all ${
                      active ? info.color + ' border-opacity-100' : 'border-surface-border hover:border-gray-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${active ? 'text-white' : 'text-gray-300'}`}>
                        {info.label}
                      </span>
                      {active && (
                        <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mb-2">{info.desc}</p>
                    <ul className="space-y-0.5">
                      {info.features.map(f => (
                        <li key={f} className="text-[10px] text-gray-400 flex items-center gap-1.5">
                          <span className="text-green-500">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  </button>
                )
              })}
            </div>
          </div>

          {/* License Integration */}
          <div className="card p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-medium text-white">3. การเชื่อมต่อ License</h2>

            <div className="space-y-2">
              {/* No License */}
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                licenseMode === 'none' ? 'border-accent/40 bg-accent/5' : 'border-surface-border hover:border-gray-500'
              }`}>
                <input
                  type="radio"
                  name="licenseMode"
                  value="none"
                  checked={licenseMode === 'none'}
                  onChange={() => { setLicenseMode('none'); setLicenseId('') }}
                  className="mt-0.5 accent-accent"
                />
                <div>
                  <p className="text-sm font-medium text-white">ไม่ผูก License</p>
                  <p className="text-xs text-gray-500">ไฟล์ที่ป้องกันสามารถรันได้โดยไม่ต้องตรวจสอบ License</p>
                </div>
              </label>

              {/* Require License */}
              <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                licenseMode === 'require_validation'
                  ? 'border-accent/40 bg-accent/5'
                  : level !== 'strong'
                  ? 'border-surface-border opacity-50 cursor-not-allowed'
                  : 'border-surface-border hover:border-gray-500'
              }`}>
                <input
                  type="radio"
                  name="licenseMode"
                  value="require_validation"
                  checked={licenseMode === 'require_validation'}
                  onChange={() => setLicenseMode('require_validation')}
                  disabled={level !== 'strong'}
                  className="mt-0.5 accent-accent"
                />
                <div>
                  <p className="text-sm font-medium text-white">
                    ต้องตรวจสอบ License
                    {level !== 'strong' && (
                      <span className="ml-2 text-[10px] text-yellow-500 font-normal">(ต้องใช้ Strong level)</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    ไฟล์จะ call API ตรวจสอบ License ก่อนทำงานทุกครั้ง
                  </p>
                </div>
              </label>
            </div>

            {/* License selector */}
            {licenseMode === 'require_validation' && (
              <div className="mt-3 space-y-2">
                <label className="text-xs text-gray-400">เลือก License ที่จะผูก (ถ้าไม่เลือก = รับ License ที่ valid ทั้งหมด)</label>
                <select
                  value={licenseId}
                  onChange={e => setLicenseId(e.target.value)}
                  className="input-field"
                  disabled={loadingLicenses}
                >
                  <option value="">— รับ License ทุกตัวที่ valid —</option>
                  {licenses.map(l => (
                    <option key={l.id} value={l.id}>
                      {l.license_key}{l.name ? ` — ${l.name}` : ''}
                    </option>
                  ))}
                </select>
                {loadingLicenses && (
                  <p className="text-xs text-gray-500">กำลังโหลด License...</p>
                )}
              </div>
            )}
          </div>

          {/* Protect Button */}
          <button
            onClick={handleProtect}
            disabled={processing}
            className="btn-primary w-full py-3 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            เริ่มป้องกันไฟล์
          </button>
        </div>
      )}

      {/* STEP: Processing */}
      {step === 'processing' && (
        <div className="card p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-surface-border" />
            <div className="absolute inset-0 w-16 h-16 rounded-full border-4 border-t-accent animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-6 h-6 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <p className="text-white font-medium">กำลังประมวลผล...</p>
            <p className="text-sm text-gray-500 mt-1">
              {selectedFile?.name} · {LEVEL_INFO[level].label}
            </p>
          </div>
          <div className="w-full max-w-xs space-y-1.5">
            {['ตรวจสอบไฟล์', 'Apply Protection', 'Upload to Storage', 'บันทึกผลลัพธ์'].map((s, i) => (
              <div key={s} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-full bg-accent/20 border border-accent/40 flex-shrink-0 animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                <span className="text-gray-400">{s}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* STEP: Completed */}
      {step === 'completed' && (
        <div className="card p-6 sm:p-8 flex flex-col items-center gap-5">
          <div className="w-16 h-16 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-white font-semibold text-lg">ป้องกันไฟล์สำเร็จ</p>
            <p className="text-sm text-gray-400 mt-1">{resultFilename}</p>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span className="badge border-accent/30 text-accent bg-accent/10 text-[10px]">
                {LEVEL_INFO[level].label}
              </span>
              <span className="text-xs text-gray-500">{formatSize(resultSize)}</span>
              {licenseMode === 'require_validation' && (
                <span className="badge border-purple-500/30 text-purple-400 bg-purple-500/10 text-[10px]">
                  License Required
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="btn-primary flex items-center justify-center gap-2 px-6"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              {downloading ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลดไฟล์'}
            </button>
            <button
              onClick={() => router.push('/admin/files')}
              className="btn-ghost flex items-center justify-center gap-2 px-6"
            >
              ดูไฟล์ทั้งหมด
            </button>
          </div>

          <button
            onClick={handleReset}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            ป้องกันไฟล์ใหม่
          </button>
        </div>
      )}

      {/* STEP: Failed */}
      {step === 'failed' && (
        <div className="card p-6 sm:p-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-white font-semibold">เกิดข้อผิดพลาด</p>
            <p className="text-sm text-red-400 mt-1">{errorMsg}</p>
          </div>
          <button onClick={handleReset} className="btn-primary px-6">
            ลองใหม่
          </button>
        </div>
      )}
    </div>
  )
}
