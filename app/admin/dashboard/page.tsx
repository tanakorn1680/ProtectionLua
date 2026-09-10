'use client'

import { useEffect, useState } from 'react'
import { useAdminFetch } from '@/lib/AdminContext'
import type { DashboardStats } from '@/lib/types'

interface StatCardProps {
  label: string
  value: number | string
  color?: string
  icon: React.ReactNode
}

function StatCard({ label, value, color, icon }: StatCardProps) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-400">{label}</span>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${color ?? 'bg-gray-500/10'}`}>
          {icon}
        </div>
      </div>
      <div className="text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}

export default function DashboardPage() {
  const adminFetch = useAdminFetch()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch('/api/admin/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [adminFetch])

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">ภาพรวม</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 bg-surface-hover rounded w-20 mb-4" />
              <div className="h-7 bg-surface-hover rounded w-12" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">ภาพรวม</h1>
        <p className="text-sm text-gray-500 mt-0.5">สถิติ License ทั้งหมดในระบบ</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard
          label="License ทั้งหมด"
          value={stats?.total ?? 0}
          color="bg-blue-500/10"
          icon={
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
            </svg>
          }
        />
        <StatCard
          label="ใช้งานได้"
          value={stats?.active ?? 0}
          color="bg-green-500/10"
          icon={
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="ปิดใช้งาน"
          value={stats?.disabled ?? 0}
          color="bg-gray-500/10"
          icon={
            <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          }
        />
        <StatCard
          label="หมดอายุ"
          value={stats?.expired ?? 0}
          color="bg-amber-500/10"
          icon={
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="ถูกแบน"
          value={stats?.banned ?? 0}
          color="bg-red-500/10"
          icon={
            <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          }
        />
        <StatCard
          label="ตรวจสอบ 24 ชม."
          value={stats?.recent_checks ?? 0}
          color="bg-purple-500/10"
          icon={
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          }
        />
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-medium text-gray-300 mb-3">ข้อมูลด่วน</h2>
        <div className="space-y-2 text-sm text-gray-400">
          <div className="flex justify-between">
            <span>อัตราการใช้งาน</span>
            <span className="text-white font-mono">
              {stats && stats.total > 0
                ? `${Math.round((stats.active / stats.total) * 100)}%`
                : '–'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>License ที่มีปัญหา</span>
            <span className="text-white font-mono">
              {stats ? stats.disabled + stats.banned + stats.expired : 0}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
