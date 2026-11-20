'use client'

// Shared client-side types + small utilities for the master-data pages (Agent C).

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { formatIDR } from '@/lib/format'
import type { StockItemDTO, StockMovementDTO, UserDTO } from '@/lib/types'

// ---------- API row types ----------

export interface VariantOptionRow {
  id: string
  label: string
  priceDelta: number
  isDefault: boolean
  sortOrder: number
}

export interface VariantGroupRow {
  id: string
  name: string
  selectionType: 'SINGLE' | 'MULTI'
  isRequired: boolean
  minSelect: number
  maxSelect: number
  sortOrder: number
  options: VariantOptionRow[]
}

export interface ProductRow {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  basePrice: number
  unitCost: number | null
  isActive: boolean
  isAvailable: boolean
  sortOrder: number
  category: { id: string; name: string }
  orderCount: number
  variantGroups: VariantGroupRow[]
}

export interface CategoryRow {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  productCount: number
}

export interface ProductsResponse {
  products: ProductRow[]
  categories: CategoryRow[]
}

export type { StockItemDTO, StockMovementDTO, UserDTO }

export interface MovementsResponse {
  rows: StockMovementDTO[]
  total: number
  page: number
  pageSize: number
}

export interface RecipeLine {
  stockItemId: string
  qtyPerUnit: number
  sku?: string
  name?: string
  unit?: string
}

// ---------- Movement type labels ----------

export const MOVEMENT_LABELS: Record<string, string> = {
  RESTOCK_IN: 'Masuk Stok',
  SALE_DEDUCT: 'Terjual',
  WASTE: 'Limbah',
  MANUAL_OUT: 'Keluar Manual',
  ADJUSTMENT: 'Penyesuaian',
  COUNT_VARIANCE: 'Selisih Opname',
}

export const MOVEMENT_TYPE_OPTIONS = [
  'RESTOCK_IN',
  'WASTE',
  'MANUAL_OUT',
  'ADJUSTMENT',
  'COUNT_VARIANCE',
  'SALE_DEDUCT',
] as const

export const WASTE_REASONS = ['Tumpah', 'Kedaluwarsa', 'Rusak', 'Salah pesan', 'Lainnya']

export const STOCK_UNITS = ['gr', 'ml', 'pcs', 'cup', 'btl'] as const

// ---------- Debounce ----------

/** Debounced mirror of a changing value (search boxes). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** Debounced callback (draft autosave). */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delay = 800) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  }, [fn])
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  return (...args: A) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => ref.current(...args), delay)
  }
}

// ---------- Money input (Rp integer, formatted when idle) ----------

export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  allowNegative = false,
  ariaLabel,
  id,
}: {
  value: number | null
  onChange: (v: number | null) => void
  placeholder?: string
  className?: string
  allowNegative?: boolean
  ariaLabel?: string
  id?: string
}) {
  const [raw, setRaw] = useState<string | null>(null)
  const display =
    raw !== null
      ? raw
      : value === null || value === undefined
        ? ''
        : allowNegative && value < 0
          ? '-' + formatIDR(Math.abs(value))
          : formatIDR(value)
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        Rp
      </span>
      <Input
        id={id}
        aria-label={ariaLabel}
        inputMode="numeric"
        autoComplete="off"
        className="pl-9 font-mono tabular-nums"
        placeholder={placeholder ?? '0'}
        value={display}
        onFocus={() => setRaw(value === null || value === undefined ? '' : String(value))}
        onBlur={() => setRaw(null)}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '')
          if (digits === '') {
            onChange(null)
            setRaw('')
            return
          }
          const n = parseInt(digits, 10)
          const signed = allowNegative && e.target.value.trim().startsWith('-') ? -n : n
          onChange(signed)
          setRaw(String(signed))
        }}
      />
    </div>
  )
}

// ---------- Printing (self-contained print views; no cross-agent imports) ----------

/**
 * Open a print dialog with self-contained HTML. Used by count sheets,
 * role cheat sheets, and receipt test prints — each caller passes its own
 * simple markup so we never import other agents' print components.
 */
export function printHtml(title: string, bodyHtml: string, opts: { widthMm?: number } = {}) {
  const w = window.open('', '_blank', 'width=460,height=680')
  if (!w) return false
  const widthCss = opts.widthMm ? `@page { size: ${opts.widthMm}mm auto; } body { width: ${opts.widthMm}mm; }` : ''
  w.document.write(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${title}</title>` +
      `<style>
        * { box-sizing: border-box; }
        body { font-family: 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif; color: #201712; margin: 0; padding: 12px; ${widthCss} }
        h1,h2,h3 { margin: 0 0 6px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border-bottom: 1px solid #e8decf; padding: 5px 4px; text-align: left; }
        th { border-bottom: 2px solid #3f2a1d; }
        .mono { font-family: 'Courier New', monospace; }
        .right { text-align: right; }
        .center { text-align: center; }
        .muted { color: #857467; }
        .receipt { font-family: 'Courier New', monospace; font-size: 12px; }
        .receipt .line { border-top: 1px dashed #857467; margin: 8px 0; }
        @media print { body { padding: 0; } }
      </style></head><body>${bodyHtml}` +
      `<script>window.onload = function(){ setTimeout(function(){ window.print(); }, 120); }<\/script>` +
      `</body></html>`
  )
  w.document.close()
  return true
}

// ---------- CSV export ----------

/** Download rows as an Excel-friendly CSV (UTF-8 BOM). */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v === null || v === undefined ? '' : String(v)
    return '"' + s.replace(/"/g, '""') + '"'
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ---------- WhatsApp phone normalization ----------

export function waLink(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  const local = cleaned.startsWith('+62') ? '62' + cleaned.slice(3) : cleaned.startsWith('0') ? '62' + cleaned.slice(1) : cleaned
  return `https://wa.me/${local}`
}

// ---------- Draft (localStorage) helpers ----------

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full / private mode — drafts are best-effort */
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// ---------- Misc ----------

export function formatQty(n: number): string {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)
}

export function signedQty(n: number): string {
  return (n > 0 ? '+' : '') + formatQty(n)
}

/** Initial-letter product thumb placeholder (caramel gradient). */
export function ProductThumb({
  imageUrl,
  name,
  className,
}: {
  imageUrl: string | null
  name: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-caramel-pale to-caramel text-espresso-deep',
        className
      )}
      aria-hidden
    >
      {imageUrl ? (
         
        <img src={imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span className="font-display text-lg font-semibold">{name.trim().charAt(0).toUpperCase() || '?'}</span>
      )}
    </span>
  )
}
