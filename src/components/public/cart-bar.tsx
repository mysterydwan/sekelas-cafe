'use client'

// Fixed bottom cart bar — appears once the cart has items (SPEC §3.1).
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { formatIDR } from '@/lib/format'
import { useI18n } from '@/lib/i18n'

export function CartBar({
  count,
  total,
  onOpen,
}: {
  count: number
  total: number
  onOpen: () => void
}) {
  const { t } = useI18n()
  if (count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${t('cart.title')} — ${count}, ${t('cart.total')} ${formatIDR(total)}`}
        className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-2xl bg-espresso-deep px-5 py-3.5 text-[#FBF7F0] shadow-xl shadow-espresso-deep/30 transition-transform active:scale-[0.99]"
      >
        <span className="flex items-center gap-3">
          <span className="relative">
            <ShoppingBag className="size-5" />
            <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-caramel px-1 font-mono text-[11px] font-bold tabular-nums text-espresso-deep">
              {count}
            </span>
          </span>
          <span className="text-sm font-medium">{t('cart.title')}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-semibold tabular-nums text-[#E7C078]">
            {formatIDR(total)}
          </span>
          <ChevronRight className="size-4 text-[#F0E7DA]/60" />
        </span>
      </button>
    </div>
  )
}
