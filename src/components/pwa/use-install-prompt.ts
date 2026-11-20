'use client'

// useInstallPrompt — captures the browser's deferred install prompt so the
// UI can offer an "Install app" action (progressive enhancement only).
// All browser APIs are touched inside useEffect, so this is SSR-safe.

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Minimal local typing for the non-standard `beforeinstallprompt` event.
 * Deliberately structural — no dependency on @types or `any`.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface InstallPromptResult {
  /** True while a deferred install prompt is available to show. */
  canInstall: boolean
  /** Shows the native install dialog; resolves to true when accepted. */
  promptInstall: () => Promise<boolean>
}

export function useInstallPrompt(): InstallPromptResult {
  const [canInstall, setCanInstall] = useState(false)
  // The event must be stored (not just a flag) — `prompt()` can only be
  // invoked on the original captured instance, and only once.
  const promptEvent = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      promptEvent.current = event as BeforeInstallPromptEvent
      setCanInstall(true)
    }

    const onAppInstalled = () => {
      promptEvent.current = null
      setCanInstall(false)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<boolean> => {
    const event = promptEvent.current
    if (!event) return false

    try {
      await event.prompt()
      const { outcome } = await event.userChoice
      return outcome === 'accepted'
    } catch {
      return false
    } finally {
      // The captured event is single-use — reset regardless of the outcome.
      promptEvent.current = null
      setCanInstall(false)
    }
  }, [])

  return { canInstall, promptInstall }
}
