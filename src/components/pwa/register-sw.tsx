'use client'

// Registers the Sekelas Cafe service worker (/sw.js) after the window has
// fully loaded, so SW boot never competes with first paint.
//
// Dev-safety: the service worker is deliberately conservative under
// `next dev` (Turbopack) —
//   - navigations are network-first (15s timeout), so HMR and freshly served
//     HTML are never blocked by a stale cached document;
//   - /_next/static/ goes network-first too (instant via the HTTP cache in
//     production, always-fresh in dev where chunk URLs are stable);
//   - only brand assets (icons, logo) use cache-first — content never changes;
//   - /api/* is never cached, keeping POS data fresh.
// Registration errors (non-secure contexts, unsupported browsers, dev
// quirks) are swallowed on purpose — the app must work with or without
// the service worker. PWA is a progressive enhancement.
//
// Updates: when a new worker takes control (e.g. after a deploy), it is
// activated immediately (SKIP_WAITING) and the page reloads ONCE so users
// are never stranded on half-old/half-new code.

import { useEffect } from 'react'

export function RegisterSW() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

    let reloaded = false
    const onControllerChange = () => {
      if (reloaded) return
      reloaded = true
      window.location.reload()
    }

    const register = () => {
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // A waiting worker means an updated sw.js is ready — activate it now.
          if (registration.waiting) {
            registration.waiting.postMessage('SKIP_WAITING')
          }
          registration.addEventListener('updatefound', () => {
            const installing = registration.installing
            installing?.addEventListener('statechange', () => {
              if (installing.state === 'installed' && registration.waiting) {
                registration.waiting.postMessage('SKIP_WAITING')
              }
            })
          })
        })
        .catch(() => {
          // Silently ignore — the app remains fully usable without the SW.
        })
    }

    // Wait for window load unless it has already fired.
    if (document.readyState === 'complete') {
      register()
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      }
    }

    window.addEventListener('load', register, { once: true })
    return () => {
      window.removeEventListener('load', register)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
    }
  }, [])

  return null
}

export default RegisterSW
