'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useCommandState } from 'cmdk'
import { toast } from 'sonner'
import {
  BarChart3,
  Boxes,
  ChefHat,
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Moon,
  Package,
  PackageSearch,
  Printer,
  ScrollText,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { isSoundEnabled, setSoundEnabled } from '@/hooks/use-sound'
import { ROLE_LABELS } from '@/lib/grants'
import { apiFetch } from '@/lib/client'
import { todayJakarta } from '@/lib/format'
import { printReceipt } from '@/components/staff/receipt'
import type { OrderDTO, OrderListResult, Role, SettingsDTO } from '@/lib/types'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'

const PAGE_ACTIONS = [
  { href: '/dashboard', label: 'Buka Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/pos', label: 'Pesanan Baru (Kasir)', icon: ShoppingCart, roles: ['ADMIN', 'CASHIER'] },
  { href: '/kitchen', label: 'Buka Dapur (KDS)', icon: ChefHat, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/orders', label: 'Cari Pesanan', icon: ClipboardList, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/products', label: 'Kelola Produk', icon: Package, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/stock', label: 'Catat Stok / Limbah', icon: Boxes, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/reports', label: 'Lihat Laporan', icon: BarChart3, roles: ['ADMIN', 'CASHIER'] },
  { href: '/data', label: 'Laporan X / Z & Excel', icon: FileSpreadsheet, roles: ['ADMIN', 'CASHIER'] },
  { href: '/users', label: 'Kelola Pengguna', icon: Users, roles: ['ADMIN'] },
  { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['ADMIN'] },
  { href: '/activity', label: 'Log Aktivitas', icon: ScrollText, roles: ['ADMIN'] },
]

/** Order codes look like SKC-012 — letters/digits/dash with at least one digit. */
function looksLikeOrderCode(q: string): boolean {
  return /^[A-Za-z0-9-]{2,}$/.test(q) && /\d/.test(q)
}

/**
 * Lives inside the cmdk tree and mirrors the live search query into a ref the
 * palette actions can read at select-time (cmdk keeps the query internal).
 */
function SearchQuerySink({ onQuery }: { onQuery: (q: string) => void }) {
  const search = useCommandState((state) => state.search)
  useEffect(() => {
    onQuery(search)
  }, [search, onQuery])
  return null
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { user } = useSession()
  const { theme, setTheme } = useTheme()

  const searchQueryRef = useRef('')
  const handleQuery = useCallback((q: string) => {
    searchQueryRef.current = q
  }, [])

  const [soundOn, setSoundOn] = useState(true)
  const [reprinting, setReprinting] = useState(false)

  useEffect(() => {
    if (open) {
      setSoundOn(isSoundEnabled())
      setReprinting(false)
    }
  }, [open])

  // Global Cmd/Ctrl+K (SPEC shortcuts)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [open, onOpenChange])

  const role = user?.role
  const pages = PAGE_ACTIONS.filter((p) => role && p.roles.includes(role))

  const go = (href: string) => {
    router.push(href)
    onOpenChange(false)
  }

  // ---- quick actions (SPEC §1.5) ----

  const searchByCode = () => {
    const q = searchQueryRef.current.trim()
    if (looksLikeOrderCode(q)) go(`/orders?search=${encodeURIComponent(q.toUpperCase())}`)
    else go('/orders') // orders page focuses its search field on mount
  }

  const toggleSound = () => {
    const next = !isSoundEnabled()
    setSoundEnabled(next)
    setSoundOn(next)
    onOpenChange(false)
    toast.success(next ? 'Suara dinyalakan' : 'Suara dimatikan')
  }

  const reprintLastReceipt = useCallback(async (): Promise<void> => {
    setReprinting(true)
    try {
      const list = await apiFetch<OrderListResult>(`/api/orders?from=${todayJakarta()}&pageSize=1`)
      const latest = list.rows[0]
      if (!latest) {
        toast.info('Tidak ada pesanan hari ini')
        return
      }
      const [order, settings] = await Promise.all([
        apiFetch<OrderDTO>(`/api/orders/${latest.id}`),
        apiFetch<SettingsDTO>('/api/settings'),
      ])
      printReceipt(order, settings.receipts)
      try {
        await apiFetch(`/api/orders/${latest.id}/reprint`, {
          method: 'POST',
          body: JSON.stringify({ template: 'RECEIPT' }),
        })
      } catch {
        /* audit-log failure must never block printing */
      }
      toast.success(`Mencetak struk ${order.code}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal mencetak struk terakhir')
    } finally {
      setReprinting(false)
    }
  }, [])

  const showQuick = (roles: Role[]) => role !== undefined && roles.includes(role)

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Ketik perintah atau tujuan…" />
      <SearchQuerySink onQuery={handleQuery} />
      <CommandList className="scrollbar-warm">
        <CommandEmpty>Tidak ada hasil.</CommandEmpty>
        <CommandGroup heading="Navigasi">
          {pages.map((p) => (
            <CommandItem
              key={p.href}
              value={p.label}
              onSelect={() => go(p.href)}
            >
              <p.icon className="mr-2 h-4 w-4" aria-hidden />
              {p.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Aksi Cepat">
          {showQuick(['ADMIN', 'CASHIER', 'BARISTA']) && (
            <>
              <CommandItem value="cari pesanan cari kode pesanan" onSelect={searchByCode}>
                <Search className="mr-2 h-4 w-4" aria-hidden />
                Cari pesanan lewat kode
                <span className="ml-auto text-xs text-muted-foreground">/orders</span>
              </CommandItem>
              <CommandItem
                value="cetak ulang struk terakhir"
                disabled={reprinting}
                onSelect={() => {
                  void reprintLastReceipt().then(() => onOpenChange(false))
                }}
              >
                <Printer className="mr-2 h-4 w-4" aria-hidden />
                {reprinting ? 'Mencetak struk terakhir…' : 'Cetak ulang struk terakhir'}
              </CommandItem>
            </>
          )}
          {showQuick(['ADMIN', 'CASHIER']) && (
            <CommandItem value="laporan x hari ini" onSelect={() => go('/data?x=1')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
              Laporan X (hari ini)
            </CommandItem>
          )}
          {showQuick(['ADMIN', 'CASHIER', 'BARISTA']) && (
            <CommandItem value="ubah status habis tersedia produk" onSelect={() => go('/products')}>
              <PackageSearch className="mr-2 h-4 w-4" aria-hidden />
              Ubah status habis/tersedia produk
            </CommandItem>
          )}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tampilan">
          <CommandItem
            value="toggle tema gelap terang"
            onSelect={() => {
              setTheme(theme === 'dark' ? 'light' : 'dark')
              onOpenChange(false)
            }}
          >
            {theme === 'dark' ? <Sun className="mr-2 h-4 w-4" aria-hidden /> : <Moon className="mr-2 h-4 w-4" aria-hidden />}
            {theme === 'dark' ? 'Tema Terang' : 'Tema Gelap'}
          </CommandItem>
          <CommandItem
            value="suara nyala matikan nyalakan notifikasi"
            onSelect={toggleSound}
          >
            {soundOn ? <Volume2 className="mr-2 h-4 w-4" aria-hidden /> : <VolumeX className="mr-2 h-4 w-4" aria-hidden />}
            {soundOn ? 'Suara: matikan' : 'Suara: nyalakan'}
          </CommandItem>
        </CommandGroup>
        {user && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Sesi">
              <CommandItem value="sesi info">
                <span className="mr-2 text-xs font-bold text-caramel">{user.name.slice(0, 1)}</span>
                {user.name} · {ROLE_LABELS[user.role]}
              </CommandItem>
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
