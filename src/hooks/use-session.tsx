'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { fetchMe } from '@/lib/client'
import { hasGrant } from '@/lib/grants'
import type { SessionUser } from '@/lib/types'

interface SessionContextValue {
  user: SessionUser | null
  loading: boolean
  refresh: () => Promise<void>
  can: (grant: string) => boolean
}

const SessionContext = createContext<SessionContextValue>({
  user: null,
  loading: true,
  refresh: async () => {},
  can: () => false,
})

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const me = await fetchMe()
    setUser(me)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchMe().then((me) => {
      if (cancelled) return
      setUser(me)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const can = useCallback((grant: string) => hasGrant(user, grant), [user])

  return (
    <SessionContext.Provider value={{ user, loading, refresh, can }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  return useContext(SessionContext)
}
