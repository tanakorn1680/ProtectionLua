'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from './supabase/client'
import type { Session } from '@supabase/supabase-js'

interface AdminContextValue {
  session: Session | null
  loading: boolean
  signOut: () => Promise<void>
  getToken: () => string | null
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabaseClient()

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (!data.session) router.push('/login')
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      if (!s) router.push('/login')
    })

    return () => subscription.unsubscribe()
  }, [router])

  const signOut = useCallback(async () => {
    const supabase = getSupabaseClient()
    await supabase.auth.signOut()
    router.push('/login')
  }, [router])

  const getToken = useCallback(() => {
    return session?.access_token ?? null
  }, [session])

  return (
    <AdminContext.Provider value={{ session, loading, signOut, getToken }}>
      {children}
    </AdminContext.Provider>
  )
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}

export function useAdminFetch() {
  const { getToken, signOut } = useAdmin()

  return useCallback(async (url: string, options?: RequestInit) => {
    const token = getToken()
    if (!token) {
      await signOut()
      throw new Error('Not authenticated')
    }

    // ถ้าส่ง FormData อย่าใส่ Content-Type ให้ browser จัดการเอง
    const isFormData = options?.body instanceof FormData
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    }
    if (!isFormData) {
      headers['Content-Type'] = 'application/json'
    }
    // merge headers จาก options (ถ้ามี)
    if (options?.headers) {
      Object.assign(headers, options.headers)
    }

    const res = await fetch(url, {
      ...options,
      headers,
    })

    if (res.status === 401) {
      await signOut()
      throw new Error('Session expired')
    }

    return res
  }, [getToken, signOut])
}
