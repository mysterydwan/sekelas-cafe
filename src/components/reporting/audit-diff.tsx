'use client'

// Field-level before/after diff renderer for audit log entries.
import { cn } from '@/lib/utils'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function fmtValue(v: unknown): string {
  if (v === null) return 'null'
  if (typeof v === 'string') return v
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  if (!isRecord(before) && !isRecord(after)) {
    if (before === null && after === null) {
      return <p className="text-sm text-muted-foreground">Tidak ada detail sebelum/sesudah.</p>
    }
    return (
      <div className="space-y-2 text-sm">
        {before !== null && (
          <p>
            <span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">Sebelum</span>
            <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{fmtValue(before)}</code>
          </p>
        )}
        {after !== null && (
          <p>
            <span className="mr-2 text-xs font-semibold uppercase text-muted-foreground">Sesudah</span>
            <code className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{fmtValue(after)}</code>
          </p>
        )}
      </div>
    )
  }

  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort()

  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto] gap-2 border-b pb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <span>Kolom</span>
        <span>Nilai</span>
      </div>
      {keys.map((key) => {
        const bv = isRecord(before) && key in before ? before[key] : undefined
        const av = isRecord(after) && key in after ? after[key] : undefined
        const added = !isRecord(before) || !(key in before)
        const removed = !isRecord(after) || !(key in after)
        const changed = !added && !removed && JSON.stringify(bv) !== JSON.stringify(av)
        return (
          <div
            key={key}
            className={cn(
              'grid grid-cols-[1fr_auto] items-baseline gap-2 rounded-md px-1.5 py-1 text-sm',
              added && 'bg-success/10',
              removed && 'bg-destructive/10',
              changed && 'bg-warning/10'
            )}
          >
            <span className={cn('font-medium', removed && 'line-through opacity-70')}>{key}</span>
            <span className="text-right font-mono text-xs">
              {added && <span className="font-semibold text-success">+ {fmtValue(av)}</span>}
              {removed && <span className="font-semibold text-destructive">− {fmtValue(bv)}</span>}
              {changed && (
                <span>
                  <span className="text-muted-foreground line-through">{fmtValue(bv)}</span>
                  <span className="mx-1">→</span>
                  <span className="font-semibold text-warning">{fmtValue(av)}</span>
                </span>
              )}
              {!added && !removed && !changed && <span className="text-muted-foreground">{fmtValue(av)}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}
