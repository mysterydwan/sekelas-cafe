'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from '@/hooks/use-session'
import { canAccessPage, homeForRole, PAGE_ROLES } from '@/lib/grants'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Coffee, ShieldAlert } from 'lucide-react'

/** Friendly labels for the 403 quick-links (page → label). */
const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Dasbor',
  '/pos': 'Kasir',
  '/kitchen': 'Dapur',
  '/orders': 'Pesanan',
  '/products': 'Produk',
  '/stock': 'Stok',
  '/reports': 'Laporan',
  '/data': 'Data & Excel',
  '/users': 'Pengguna',
  '/settings': 'Pengaturan',
  '/activity': 'Aktivitas',
}

/** Renders 403 view when role lacks page access; skeleton while session loads. */
export function PageGuard({
  page,
  children,
}: {
  page: keyof typeof PAGE_ROLES
  children: React.ReactNode
}) {
  const { user, loading } = useSession()

  if (loading) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!user) {
    return (
      <EmptyPanel
        title="Sesi berakhir"
        description="Masuk kembali untuk melanjutkan."
        icon={<ShieldAlert className="h-10 w-10 text-caramel" aria-hidden />}
      >
        {/* useSearchParams needs a Suspense boundary during prerender */}
        <Suspense fallback={null}>
          <LoginCta />
        </Suspense>
      </EmptyPanel>
    )
  }

  if (!canAccessPage(page, user.role)) {
    const allowed = PAGE_ROLES[page] ?? []
    // The user's own permitted pages — quick links out of the dead end
    const permitted = Object.keys(PAGE_ROLES).filter((href) =>
      PAGE_ROLES[href].includes(user.role)
    )
    const home = homeForRole(user.role)
    return (
      <EmptyPanel
        title={`Halaman ini khusus ${allowed.join(' / ')}`}
        description="Kamu tidak punya akses ke halaman ini. Coba halaman lain di menu samping."
        cta={{ label: `Kembali ke ${PAGE_LABELS[home] ?? 'Beranda'}`, href: home }}
        icon={<ShieldAlert className="h-10 w-10 text-caramel" aria-hidden />}
      >
        {permitted.length > 0 && (
          <div className="mt-8">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Halaman yang bisa kamu buka
            </p>
            <div className="mt-3 flex max-w-lg flex-wrap justify-center gap-2">
              {permitted.map((href) => (
                <Link
                  key={href}
                  href={href}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-caramel hover:text-caramel"
                >
                  {PAGE_LABELS[href] ?? href}
                </Link>
              ))}
            </div>
          </div>
        )}
      </EmptyPanel>
    )
  }

  return <>{children}</>
}

/** Login CTA that preserves the attempted URL via ?next= (SPEC §3.17). */
function LoginCta() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const target = pathname + (search ? `?${search}` : '')
  return (
    <Button asChild className="mt-6 bg-espresso text-cream hover:bg-espresso-soft">
      <Link href={`/login?next=${encodeURIComponent(target)}`}>Masuk</Link>
    </Button>
  )
}

export function EmptyPanel({
  title,
  description,
  cta,
  icon,
  children,
}: {
  title: string
  description: string
  cta?: { label: string; href: string }
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 rounded-full bg-cream p-5 text-espresso" aria-hidden>
        {icon ?? <Coffee className="h-10 w-10" />}
      </div>
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-muted-foreground">{description}</p>
      {cta && (
        <Button asChild className="mt-6 bg-espresso text-cream hover:bg-espresso-soft">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
      {children}
    </div>
  )
}
