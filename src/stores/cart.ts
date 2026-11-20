// Storefront cart — zustand + persist (localStorage 'sekelas-cart', SPEC §3.1).
// Cart is a DRAFT only: money is always recomputed server-side at order creation.
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { OrderType } from '@/lib/types'

export interface CartOption {
  id: string
  groupId: string
  groupName: string
  label: string
  priceDelta: number
}

export interface CartLine {
  lineId: string
  productId: string
  productName: string
  imageUrl: string | null
  basePrice: number
  qty: number
  options: CartOption[]
  note: string
}

interface CartState {
  lines: CartLine[]
  serviceType: OrderType
  tableLabel: string
  customerName: string
  customerPhone: string
  deliveryLocation: string
  note: string
  addLine: (line: Omit<CartLine, 'lineId'>) => void
  setQty: (lineId: string, qty: number) => void
  setLineNote: (lineId: string, note: string) => void
  updateLine: (lineId: string, patch: Omit<CartLine, 'lineId' | 'productId' | 'productName' | 'imageUrl'>) => void
  removeLine: (lineId: string) => void
  restoreLine: (line: CartLine, index: number) => void
  setServiceType: (type: OrderType) => void
  setField: (
    field: 'tableLabel' | 'customerName' | 'customerPhone' | 'deliveryLocation' | 'note',
    value: string
  ) => void
  clearAll: () => void
}

/** Merge key: same product + same options + same note => one line. */
function lineKey(l: { productId: string; options: { id: string }[]; note: string }): string {
  return l.productId + '|' + [...l.options].map((o) => o.id).sort().join(',') + '|' + (l.note ?? '')
}

function localUuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'l-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      serviceType: 'TAKE_AWAY',
      tableLabel: '',
      customerName: '',
      customerPhone: '',
      deliveryLocation: '',
      note: '',

      addLine: (line) =>
        set((s) => {
          const idx = s.lines.findIndex((l) => lineKey(l) === lineKey(line))
          if (idx >= 0) {
            const lines = [...s.lines]
            lines[idx] = { ...lines[idx], qty: Math.min(99, lines[idx].qty + line.qty) }
            return { lines }
          }
          return { lines: [...s.lines, { ...line, lineId: localUuid() }] }
        }),

      setQty: (lineId, qty) =>
        set((s) => ({
          lines: s.lines.map((l) =>
            l.lineId === lineId ? { ...l, qty: Math.max(1, Math.min(99, Math.round(qty))) } : l
          ),
        })),

      setLineNote: (lineId, note) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.lineId === lineId ? { ...l, note: note.slice(0, 200) } : l)),
        })),

      /** Inline edit from the cart: patch a line's options/qty/note. If the
       *  patched selection now matches a DIFFERENT line (same product+options+
       *  note), merge into it instead of keeping duplicates. */
      updateLine: (lineId, patch) =>
        set((s) => {
          const idx = s.lines.findIndex((l) => l.lineId === lineId)
          if (idx < 0) return s
          const current = s.lines[idx]
          const patched: CartLine = {
            ...current,
            ...patch,
            qty: Math.max(1, Math.min(99, Math.round(patch.qty ?? current.qty))),
          }
          const twinIdx = s.lines.findIndex(
            (l) => l.lineId !== lineId && lineKey(l) === lineKey(patched)
          )
          if (twinIdx >= 0) {
            // merge into the twin (keep the twin's position, sum quantities)
            const twinId = s.lines[twinIdx].lineId
            const lines = s.lines
              .filter((l) => l.lineId !== lineId)
              .map((l) =>
                l.lineId === twinId ? { ...l, qty: Math.min(99, l.qty + patched.qty) } : l
              )
            return { lines }
          }
          const lines = [...s.lines]
          lines[idx] = patched
          return { lines }
        }),

      removeLine: (lineId) => set((s) => ({ lines: s.lines.filter((l) => l.lineId !== lineId) })),

      restoreLine: (line, index) =>
        set((s) => {
          if (s.lines.some((l) => l.lineId === line.lineId)) return s
          const lines = [...s.lines]
          lines.splice(Math.max(0, Math.min(index, lines.length)), 0, line)
          return { lines }
        }),

      setServiceType: (type) => set({ serviceType: type }),

      setField: (field, value) => set({ [field]: value.slice(0, 300) } as Partial<CartState>),

      clearAll: () =>
        set({
          lines: [],
          serviceType: 'TAKE_AWAY',
          tableLabel: '',
          customerName: '',
          customerPhone: '',
          deliveryLocation: '',
          note: '',
        }),
    }),
    {
      name: 'sekelas-cart',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      // SSR-safe: rehydrate after mount (see storefront page) to avoid
      // server/client HTML mismatch on the cart bar.
      skipHydration: true,
    }
  )
)

// ---------- Derived helpers (pure) ----------

export function lineUnitPrice(l: Pick<CartLine, 'basePrice' | 'options'>): number {
  return l.basePrice + l.options.reduce((s, o) => s + o.priceDelta, 0)
}

export function lineTotal(l: CartLine): number {
  return lineUnitPrice(l) * l.qty
}

export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + lineTotal(l), 0)
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((s, l) => s + l.qty, 0)
}
