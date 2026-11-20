'use client'

// Amber banner shown while the browser is offline or the realtime socket is
// down (SPEC §1.5 realtime loss). Browser-offline takes precedence — the WS
// status can briefly still read "connected" after the network drops, and the
// 'online' event simply hides the banner while the socket reconnects itself.
import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { REALTIME_ENABLED, useRealtimeStatus } from '@/hooks/use-realtime'
import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function ConnectionBanner({ className }: { className?: string }) {
  const { t } = useI18n()
  const { connected, reconnecting } = useRealtimeStatus()
  const [browserOnline, setBrowserOnline] = useState(true)

  // navigator.onLine — initial state + online/offline events
  useEffect(() => {
    const initial = setTimeout(() => setBrowserOnline(window.navigator.onLine), 0)
    const goOnline = () => setBrowserOnline(true)
    const goOffline = () => setBrowserOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      clearTimeout(initial)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (browserOnline && (!REALTIME_ENABLED || connected)) return null
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-center text-xs font-medium text-warning',
        className
      )}
    >
      <WifiOff className="size-3.5" />
      {!browserOnline
        ? t('conn.browserOffline')
        : reconnecting
          ? t('conn.reconnecting')
          : t('conn.offline')}
    </div>
  )
}
