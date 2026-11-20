'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { apiFetch, logout } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { useRealtime, useRealtimeStatus, REALTIME_ENABLED } from '@/hooks/use-realtime'
import { isSoundEnabled, playChime, setSoundEnabled } from '@/hooks/use-sound'
import { ROLE_LABELS } from '@/lib/grants'
import { formatIDR, jakartaDayIndex, nowJakartaMinutes, parseTimeHM } from '@/lib/format'
import type { CashStatusDTO, PublicSettingsDTO, StockItemDTO } from '@/lib/types'
import { CommandPalette } from './command-palette'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  ClipboardList,
  Package,
  Boxes,
  Users,
  BarChart3,
  FileSpreadsheet,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  WifiOff,
  Search,
  Moon,
  Sun,
  Wallet,
  FlaskConical,
  PanelLeftClose,
  PanelLeftOpen,
  Volume2,
  VolumeX,
  TriangleAlert,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/pos', label: 'Kasir', icon: ShoppingCart, roles: ['ADMIN', 'CASHIER'] },
  { href: '/kitchen', label: 'Dapur', icon: ChefHat, roles: ['ADMIN', 'CASHIER', 'BARISTA'], cashierViewOnly: true },
  { href: '/orders', label: 'Pesanan', icon: ClipboardList, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/products', label: 'Produk', icon: Package, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/stock', label: 'Stok', icon: Boxes, roles: ['ADMIN', 'CASHIER', 'BARISTA'] },
  { href: '/reports', label: 'Laporan', icon: BarChart3, roles: ['ADMIN', 'CASHIER'] },
  { href: '/data', label: 'Data & Excel', icon: FileSpreadsheet, roles: ['ADMIN', 'CASHIER'] },
  { href: '/users', label: 'Pengguna', icon: Users, roles: ['ADMIN'] },
  { href: '/settings', label: 'Pengaturan', icon: Settings, roles: ['ADMIN'] },
  { href: '/activity', label: 'Aktivitas', icon: ScrollText, roles: ['ADMIN'] },
]

/** localStorage key for the desktop sidebar rail state (per device). */
const SIDEBAR_COLLAPSED_KEY = 'sekelas-sidebar-collapsed'
/** sessionStorage dismissal key — includes the Jakarta date so it resets daily. */
const LOW_STOCK_DISMISS_KEY = 'sekelas-lowstock-dismissed'

function Logo({ className }: { className?: string }) {
  return (
    <img
      src="/logo.png"
      alt="Logo Sekelas Cafe"
      className={cn('w-auto object-contain', className)}
      draggable={false}
    />
  )
}

function SidebarContent({
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  const { user } = useSession()
  const role = user?.role

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          'flex items-center gap-3 pb-4 pt-5',
          collapsed ? 'justify-center px-2' : 'px-5'
        )}
      >
        <Logo className="h-11" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-lg font-semibold leading-tight text-cream">Sekelas</p>
            <p className="text-[11px] uppercase tracking-[0.2em] text-caramel-light">Cafe · SMKN 1</p>
          </div>
        )}
      </div>
      <nav
        className={cn(
          'scrollbar-warm flex-1 space-y-1 overflow-y-auto pb-4',
          collapsed ? 'px-2' : 'px-3'
        )}
        aria-label="Navigasi utama"
      >
        {NAV.filter((item) => role && item.roles.includes(role)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                'flex min-h-[44px] items-center rounded-lg py-2.5 text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                active
                  ? 'bg-caramel text-espresso-deep shadow-sm'
                  : 'text-cream/80 hover:bg-espresso-soft hover:text-cream'
              )}
              aria-current={active ? 'page' : undefined}
            >
              <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {item.cashierViewOnly && role === 'CASHIER' && (
                    <span className="rounded bg-espresso px-1.5 py-0.5 text-[10px] font-semibold text-caramel-light">
                      LIHAT
                    </span>
                  )}
                </>
              )}
            </Link>
          )
        })}
      </nav>
      {onToggleCollapsed && (
        <div className={cn('border-t border-espresso-soft py-2', collapsed ? 'px-2' : 'px-3')}>
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Perlebar menu samping' : 'Persempit menu samping'}
            title={collapsed ? 'Perlebar menu samping' : 'Persempit menu samping'}
            className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg text-xs font-medium text-cream/60 transition-colors hover:bg-espresso-soft hover:text-cream"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4.5 w-4.5" aria-hidden />
            ) : (
              <>
                <PanelLeftClose className="h-4.5 w-4.5" aria-hidden />
                <span>Persempit</span>
              </>
            )}
          </button>
        </div>
      )}
      {!collapsed && (
        <div className="border-t border-espresso-soft px-5 py-4 text-[11px] leading-relaxed text-cream/50">
          Kafe siswa SMKN 1 Boyolangu
          <br />
          Sen–Jum · 07.00–14.00 WIB
        </div>
      )}
    </div>
  )
}

function ShiftChip() {
  const { data: cash } = useQuery({
    queryKey: ['pos-cash-chip'],
    queryFn: () => apiFetch<CashStatusDTO>('/api/pos/cash'),
    refetchInterval: 60_000,
  })
  if (!cash) return null
  return (
    <Link
      href="/pos"
      className={cn(
        'hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors sm:flex',
        cash.hasFloat
          ? 'border-success/40 bg-success/10 text-success hover:bg-success/20'
          : 'border-caramel/50 bg-caramel/10 text-warning hover:bg-caramel/20'
      )}
      title="Status laci kas hari ini"
    >
      <Wallet className="h-3.5 w-3.5" aria-hidden />
      {cash.hasFloat
        ? cash.expectedCash != null
          ? `Laci ${formatIDR(cash.expectedCash)}`
          : 'Laci dibuka'
        : 'Atur modal awal'}
    </Link>
  )
}

function OpenClosedChip() {
  const { data: hours } = useQuery({
    queryKey: ['open-closed-chip'],
    queryFn: () => apiFetch<PublicSettingsDTO>('/api/public/settings').then((s) => s.hours),
    refetchInterval: 120_000,
  })
  if (!hours) return null
  const today = hours.days[jakartaDayIndex()]
  if (!today) return null
  const now = nowJakartaMinutes()
  const open = !today.closed && now >= parseTimeHM(today.open) && now < parseTimeHM(today.close)
  return (
    <span
      className={cn(
        'hidden items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium md:flex',
        open
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-destructive/40 bg-destructive/10 text-destructive'
      )}
      title="Status buka kafe (Sen–Jum 07.00–14.00)"
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', open ? 'bg-success' : 'bg-destructive')} aria-hidden />
      {open ? 'BUKA' : 'TUTUP'}
    </span>
  )
}

/** Amber strip on every staff page while a training session is active. */
function TrainingBanner({ onExit }: { onExit: () => Promise<void> }) {
  const [exiting, setExiting] = useState(false)
  const handleExit = async () => {
    if (exiting) return
    setExiting(true)
    try {
      await onExit()
    } finally {
      setExiting(false)
    }
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-y border-warning/40 bg-warning/15 px-3 py-1.5 text-center text-xs font-medium text-warning"
    >
      <FlaskConical className="size-3.5 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold uppercase tracking-wider">Mode Latihan</span>
        {' — '}
        data tidak tersimpan ke laporan
      </span>
      <button
        type="button"
        onClick={() => void handleExit()}
        disabled={exiting}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warning/50 bg-warning/10 px-3 text-[11px] font-semibold transition-colors hover:bg-warning/20 disabled:opacity-60"
      >
        <LogOut className="size-3" aria-hidden />
        {exiting ? 'Keluar…' : 'Keluar Latihan'}
      </button>
    </div>
  )
}

/** Small realtime status dot — hidden entirely when WS is compiled out. */
function ConnectionDot() {
  const { connected } = useRealtimeStatus()
  return (
    <span
      title={connected ? 'Realtime tersambung' : 'Realtime terputus'}
      className="hidden h-9 items-center justify-center rounded-full border border-border bg-background px-2.5 sm:flex"
    >
      <span
        className={cn('size-2 rounded-full', connected ? 'bg-success' : 'bg-muted-foreground/50')}
        aria-hidden
      />
      <span className="sr-only">{connected ? 'Realtime tersambung' : 'Realtime terputus'}</span>
    </span>
  )
}

/** Global notification-sound toggle — persisted per device via use-sound. */
function SoundToggle() {
  const [sound, setSound] = useState(true)

  // Sync from localStorage after mount (SSR-safe, no hydration flash)
  useEffect(() => {
    const initial = setTimeout(() => setSound(isSoundEnabled()), 0)
    return () => clearTimeout(initial)
  }, [])

  const toggle = () => {
    const next = !sound
    setSound(next)
    setSoundEnabled(next)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={sound ? 'Matikan suara notifikasi' : 'Nyalakan suara notifikasi'}
      title={sound ? 'Matikan suara notifikasi' : 'Nyalakan suara notifikasi'}
      className="relative min-h-[40px] min-w-[40px]"
    >
      {sound ? (
        <Volume2 className="h-4 w-4" aria-hidden />
      ) : (
        <VolumeX className="h-4 w-4" aria-hidden />
      )}
    </Button>
  )
}

/** "YYYY-MM-DD" for the Asia/Jakarta business date. */
function jakartaDateKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })
}

function lowStockDismissKey(): string {
  return `${LOW_STOCK_DISMISS_KEY}-${jakartaDateKey()}`
}

/**
 * Dismissible low-stock banner above the topbar. Fetches the low-only list
 * once on mount (cheap), refetches on every `stock:low` WS event (with a
 * chime), and re-arms itself even after dismissal when a NEW event fires.
 * Dismissal is per-session and per-business-day.
 */
function LowStockBanner() {
  const { user } = useSession()
  const [items, setItems] = useState<StockItemDTO[]>([])
  const [dismissed, setDismissed] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ items: StockItemDTO[]; totalValue: number }>(
        '/api/stock/items?lowOnly=1'
      )
      setItems(res.items)
    } catch {
      /* banner simply stays hidden on auth/network errors */
    }
  }, [])

  useEffect(() => {
    if (!user) return
    const initial = setTimeout(() => {
      try {
        setDismissed(window.sessionStorage.getItem(lowStockDismissKey()) === '1')
      } catch {
        /* private mode */
      }
      void load()
    }, 0)
    return () => clearTimeout(initial)
  }, [user, load])

  useRealtime(['stock:low'], () => {
    playChime('low-stock')
    // a NEW event re-arms the banner even after an earlier dismissal
    try {
      window.sessionStorage.removeItem(lowStockDismissKey())
    } catch {
      /* private mode */
    }
    setDismissed(false)
    void load()
  })

  if (dismissed || items.length === 0) return null

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(lowStockDismissKey(), '1')
    } catch {
      /* private mode */
    }
    setDismissed(true)
  }

  const names = items.slice(0, 2).map((i) => i.name).join(', ')

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-y border-warning/40 bg-warning/15 px-3 py-1.5 text-center text-xs font-medium text-warning"
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <Link href="/stock" className="underline underline-offset-2 hover:no-underline">
        Stok rendah: {items.length} bahan — {names}
        {items.length > 2 ? '…' : ''}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Tutup peringatan stok rendah"
        className="flex size-7 items-center justify-center rounded-full transition-colors hover:bg-warning/20"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}

function ConnectionBanner() {
  const { connected, reconnecting } = useRealtimeStatus()
  if (!REALTIME_ENABLED || connected) return null
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-caramel px-4 py-1.5 text-center text-xs font-medium text-espresso-deep"
    >
      <WifiOff className="h-3.5 w-3.5 animate-pulse" aria-hidden />
      {reconnecting ? 'Menyambung ulang — menampilkan data terakhir…' : 'Koneksi terputus — menampilkan data terakhir…'}
    </div>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, refresh } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const { theme, setTheme } = useTheme()

  // Restore the persisted rail state (client-only)
  useEffect(() => {
    const initial = setTimeout(() => {
      try {
        setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1')
      } catch {
        /* private mode */
      }
    }, 0)
    return () => clearTimeout(initial)
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        /* private mode */
      }
      return next
    })
  }

  const currentTitle = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + '/'))?.label ?? ''

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      toast.error('Gagal keluar — periksa koneksi lalu coba lagi')
      return
    }
    await refresh()
    router.push('/login')
  }

  return (
    <div className="flex min-h-screen bg-cream/60 dark:bg-background">
      {/* Desktop sidebar — collapses to an icon-only rail (persisted per device) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden bg-espresso-deep transition-[width] duration-200 lg:block',
          collapsed ? 'w-14' : 'w-60'
        )}
      >
        <SidebarContent collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>
      <div
        className={cn(
          'hidden transition-[width] duration-200 lg:block',
          collapsed ? 'lg:w-14' : 'lg:w-60'
        )}
        aria-hidden
      />

      <div className="flex min-h-screen w-full flex-col">
        {user?.isTraining && <TrainingBanner onExit={handleLogout} />}
        <LowStockBanner />
        <ConnectionBanner />
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-card/95 px-3 py-2.5 backdrop-blur sm:px-4">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu navigasi">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 border-espresso-soft bg-espresso-deep p-0">
              <SheetTitle className="sr-only">Navigasi</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex items-center gap-2 lg:hidden">
            <Logo className="h-7" />
          </div>
          <h2 className="hidden truncate font-display text-lg font-semibold lg:block">{currentTitle}</h2>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <OpenClosedChip />
            <ShiftChip />
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex min-h-[40px] items-center gap-2 rounded-lg border bg-background px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-caramel hover:text-foreground"
              aria-label="Buka palet perintah"
            >
              <Search className="h-3.5 w-3.5" aria-hidden />
              <kbd className="hidden font-mono text-[10px] sm:inline">Ctrl K</kbd>
            </button>
            {REALTIME_ENABLED && <ConnectionDot />}
            <SoundToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Ganti tema terah/gelap"
              className="relative min-h-[40px] min-w-[40px]"
            >
              <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" aria-hidden />
              <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" aria-hidden />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-h-[40px] items-center gap-2 rounded-full border px-2 py-1 transition-colors hover:border-caramel"
                  aria-label="Menu pengguna"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-espresso text-xs font-bold text-caramel-light">
                    {user?.name?.slice(0, 1).toUpperCase() ?? '?'}
                  </span>
                  <span className="hidden text-left sm:block">
                    <span className="block text-xs font-semibold leading-tight">{user?.name}</span>
                    <span className="block text-[10px] leading-tight text-muted-foreground">
                      {user ? ROLE_LABELS[user.role] : ''}
                    </span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">
                  {user?.username} · {user ? ROLE_LABELS[user.role] : ''}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" aria-hidden /> Keluar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        {/* Mobile bottom tab bar (SPEC §1.5) */}
        <nav
          className="sticky bottom-0 z-30 flex border-t bg-card/95 backdrop-blur lg:hidden"
          aria-label="Navigasi bawah"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {NAV.filter((item) => user && item.roles.includes(user.role))
            .slice(0, 5)
            .map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium',
                    active ? 'text-caramel' : 'text-muted-foreground'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <item.icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              )
            })}
        </nav>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}

export { NAV }
