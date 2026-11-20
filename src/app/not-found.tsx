'use client'

// 404 — branded dead end. Staff sessions additionally get a shortcut to their
// role's home page (skeleton-free graceful check — the CTA simply appears
// once the session resolves).
import Link from 'next/link'
import { Coffee, Home, LayoutDashboard } from 'lucide-react'
import { useSession } from '@/hooks/use-session'
import { homeForRole } from '@/lib/grants'

export default function NotFound() {
  const { user } = useSession()

  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <main className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-6 rounded-3xl bg-espresso-deep p-6" aria-hidden>
          <Coffee className="h-12 w-12 text-caramel-light" />
        </div>
        <p className="font-mono text-sm font-semibold uppercase tracking-[0.3em] text-caramel">404</p>
        <h1 className="mt-3 font-display text-3xl font-semibold text-espresso-deep">
          Halaman tidak ditemukan
        </h1>
        <p className="mt-3 max-w-md text-sm text-espresso-deep/70">
          Kayaknya kamu nyasar — halaman ini tidak ada atau sudah dipindahkan. Yuk balik ke kedai.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-espresso px-6 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-espresso-soft"
          >
            <Home className="h-4 w-4" aria-hidden />
            Kembali ke Beranda
          </Link>
          {user && (
            <Link
              href={homeForRole(user.role)}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-espresso/30 bg-background px-6 py-2.5 text-sm font-semibold text-espresso-deep transition-colors hover:border-caramel hover:text-caramel"
            >
              <LayoutDashboard className="h-4 w-4" aria-hidden />
              Ke Dasbor
            </Link>
          )}
        </div>
      </main>
    </div>
  )
}
