'use client'

// PIN quick-login keypad for shared tablets (SPEC §3.4):
// big 3×4 buttons, haptic-style press feedback, PIN dots display.

import { Delete } from 'lucide-react'
import { cn } from '@/lib/utils'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'del']

export function PinPad({
  pin,
  onChange,
  onFull,
  maxLength = 6,
}: {
  pin: string
  onChange: (next: string) => void
  onFull?: () => void
  maxLength?: number
}) {
  const press = (k: string) => {
    if (k === 'clear') return onChange('')
    if (k === 'del') return onChange(pin.slice(0, -1))
    if (pin.length >= maxLength) return
    const next = pin + k
    onChange(next)
    if (next.length === maxLength) onFull?.()
  }

  return (
    <div className="space-y-3">
      <div
        className="flex justify-center gap-3"
        role="status"
        aria-label={`PIN terisi ${pin.length} dari maksimal ${maxLength} digit`}
      >
        {Array.from({ length: maxLength }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-3.5 w-3.5 rounded-full border-2 transition-all',
              i < pin.length ? 'border-caramel bg-caramel' : 'border-border bg-transparent'
            )}
            aria-hidden
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Hapus satu digit' : k === 'clear' ? 'Bersihkan PIN' : k}
            className="flex min-h-[56px] items-center justify-center rounded-xl border bg-card text-2xl font-semibold tabular-nums shadow-sm transition-all hover:border-caramel active:scale-90 active:bg-cream dark:active:bg-secondary"
          >
            {k === 'del' ? <Delete className="h-6 w-6" aria-hidden /> : k === 'clear' ? 'C' : k}
          </button>
        ))}
      </div>
    </div>
  )
}
