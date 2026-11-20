'use client'

import { useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import type { RealtimeEvents } from '@/lib/types'

let socket: Socket | null = null
const listeners = new Map<string, Set<(payload: never) => void>>()
const statusListeners = new Set<(connected: boolean) => void>()

/**
 * Realtime endpoint. Default: the sandbox gateway proxy. On hosts without a
 * socket.io service (e.g. serverless deploys) leave NEXT_PUBLIC_REALTIME_URL
 * unset-or-empty → the app skips WS entirely and every surface falls back to
 * its polling interval (SPEC: offline tolerance).
 */
export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL || '/?XTransformPort=3030'
export const REALTIME_ENABLED = REALTIME_URL.trim() !== ''

function getSocket(): Socket {
  if (!socket) {
    socket = io(REALTIME_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
      autoConnect: false,
    })
    let hadConnection = false
    socket.on('connect', () => {
      hadConnection = true
      statusListeners.forEach((fn) => fn(true))
    })
    socket.on('disconnect', () => statusListeners.forEach((fn) => fn(false)))
    socket.onAny((event: string, payload: unknown) => {
      listeners.get(event)?.forEach((fn) => fn(payload as never))
    })
    // silent-refetch-on-recovery (SPEC §3.2): after a drop, one global event
    // tells data pages to refresh — polling stays as the safety net.
    socket.io.on('reconnect', () => {
      if (hadConnection) window.dispatchEvent(new Event('sekelas:ws-reconnected'))
    })
  }
  return socket
}

/**
 * Subscribe to realtime events. Handler receives the typed payload.
 * Falls back gracefully — callers ALSO poll with refetchInterval (SPEC: offline tolerance).
 */
export function useRealtime<K extends keyof RealtimeEvents>(
  events: K[],
  handler: (event: K, payload: RealtimeEvents[K]) => void
) {
  const handlerRef = useRef(handler)
  const eventsKey = events.join(',')

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!REALTIME_ENABLED) return
    const s = getSocket()
    const keys = eventsKey.split(',').filter(Boolean) as K[]
    const fns = keys.map((event) => {
      const fn = (payload: never) => handlerRef.current(event, payload as RealtimeEvents[K])
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(fn)
      return { event, fn }
    })
    // ensure connection attempt when someone subscribes
    if (!s.connected) s.connect()
    return () => {
      fns.forEach(({ event, fn }) => {
        listeners.get(event)?.delete(fn)
        if (listeners.get(event)?.size === 0) listeners.delete(event)
      })
    }
  }, [eventsKey])
}

export function useRealtimeStatus(): { connected: boolean; reconnecting: boolean } {
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)

  useEffect(() => {
    if (!REALTIME_ENABLED) return
    const s = getSocket()
    const sync = (value: boolean) => setConnected(value)
    const onReconnecting = () => setReconnecting(true)
    const onConnect = () => {
      setReconnecting(false)
      setConnected(true)
    }
    // initial sync deferred out of the effect body (async callback pattern)
    const initial = setTimeout(() => setConnected(s.connected), 0)
    statusListeners.add(sync)
    if (!s.connected) s.connect()
    s.io.on('reconnect_attempt', onReconnecting)
    s.io.on('reconnect', onConnect)
    return () => {
      clearTimeout(initial)
      statusListeners.delete(sync)
      s.io.off('reconnect_attempt', onReconnecting)
      s.io.off('reconnect', onConnect)
    }
  }, [])

  return { connected, reconnecting }
}
