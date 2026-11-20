'use client'

// Sound conventions (SPEC §1.5): all toggleable, defaults on for kitchen,
// every sound paired with a visual — never sound-only signals.

type ChimeKind = 'new-order' | 'ready' | 'low-stock'

const STORAGE_KEY = 'sekelas-sound-enabled'
const VOLUME_KEY = 'sekelas-sound-volume'

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  return localStorage.getItem(STORAGE_KEY) !== 'off'
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
}

/** Master volume 0–1 (persisted per device); tones scale their gain. */
export function getSoundVolume(): number {
  if (typeof window === 'undefined') return 1
  const v = Number(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1
}

export function setSoundVolume(v: number) {
  if (typeof window === 'undefined') return
  localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))))
}

let ctx: AudioContext | null = null

function audioCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function tone(freq: number, startAt: number, duration: number, gain = 0.12) {
  const c = audioCtx()
  if (!c) return
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  const vol = getSoundVolume()
  if (vol <= 0) return
  const scaled = gain * vol
  g.gain.setValueAtTime(0, c.currentTime + startAt)
  g.gain.linearRampToValueAtTime(scaled, c.currentTime + startAt + 0.02)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startAt + duration)
  osc.connect(g).connect(c.destination)
  osc.start(c.currentTime + startAt)
  osc.stop(c.currentTime + startAt + duration + 0.05)
}

/** Play a chime. No-op when sound disabled per device. */
export function playChime(kind: ChimeKind) {
  if (!isSoundEnabled()) return
  try {
    switch (kind) {
      case 'new-order':
        // rising dual tone
        tone(659, 0, 0.18)
        tone(880, 0.16, 0.28)
        break
      case 'ready':
        // warm triad
        tone(523, 0, 0.16)
        tone(659, 0.12, 0.16)
        tone(784, 0.24, 0.32)
        break
      case 'low-stock':
        // soft double ping
        tone(440, 0, 0.14)
        tone(440, 0.22, 0.14)
        break
    }
  } catch {
    // audio unavailable — the paired visual still signals
  }
}
