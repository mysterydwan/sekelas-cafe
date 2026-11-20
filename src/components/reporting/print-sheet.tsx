'use client'

// Print-optimized sheet (hidden on screen, visible via @media print — global .print-area CSS).
import { formatDateTime } from '@/lib/format'

export function PrintSheet({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="print-area hidden print:block" aria-hidden>
      <div className="mx-auto max-w-3xl bg-white p-6 text-black">
        <div className="border-b-2 border-black pb-3">
          <p className="font-bold uppercase tracking-wide">Sekelas Cafe — SMKN 1 Boyolangu</p>
          <p className="mt-1 text-lg font-bold">{title}</p>
          {subtitle && <p className="text-sm">{subtitle}</p>}
          <p className="mt-1 text-xs">Dicetak: {formatDateTime(new Date())}</p>
        </div>
        <div className="mt-4 text-sm">{children}</div>
      </div>
    </div>
  )
}

/** Simple mono print table used inside PrintSheet. */
export function PrintTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr>
          {headers.map((h) => (
            <th key={h} className="border border-black px-1.5 py-1 text-left font-semibold">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} className="border border-black px-1.5 py-1 font-mono tabular-nums">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
