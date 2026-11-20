'use client'

// /login — staff login (SPEC §3.4): username+password or PIN pad for shared
// tablets, rate-limit countdown, role redirect (ADMIN→dashboard, CASHIER→pos,
// BARISTA→kitchen), practice mode entry, demo credentials hint.
// Standalone page — no staff shell.

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Coffee, Eye, EyeOff, KeyRound, Loader2, Lock, LogIn, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { apiFetch, ApiError } from '@/lib/client'
import { canAccessPage, homeForRole } from '@/lib/grants'
import { useSession } from '@/hooks/use-session'
import type { PublicSettingsDTO, SessionUser } from '@/lib/types'
import { PinPad } from '@/components/staff/login/pin-pad'
import { cn } from '@/lib/utils'

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading, refresh } = useSession()

  const [mode, setMode] = useState<'PASSWORD' | 'PIN'>('PASSWORD')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  const { data: settings } = useQuery({
    queryKey: ['login-settings'],
    queryFn: () => apiFetch<PublicSettingsDTO>('/api/public/settings'),
    staleTime: 60_000,
  })
  const practiceMode = settings?.system?.practiceMode ?? false

  // already logged in → go home (or permitted deep link)
  useEffect(() => {
    if (!loading && user) {
      const next = searchParams.get('next')
      router.replace(next && canAccessPage(next, user.role) ? next : homeForRole(user.role))
    }
  }, [loading, user, router, searchParams])

  // rate-limit countdown
  useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearInterval(t)
  }, [cooldown])

  // session-expiry notice (SPEC §3.17): set by the 401 interceptor right
  // before redirecting here — the attempted URL is preserved in ?next=
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem('sekelas-session-expired') === '1') {
        window.sessionStorage.removeItem('sekelas-session-expired')
        toast.info('Sesi berakhir — silakan masuk kembali')
      }
    } catch {
      /* private mode */
    }
  }, [])

  const submit = useCallback(
    async (asPractice = false) => {
      if (pending || cooldown > 0) return
      if (!username.trim()) {
        setError('Isi username dulu')
        return
      }
      const secret = mode === 'PIN' ? pin : password
      if (!secret) {
        setError(mode === 'PIN' ? 'Masukkan PIN dulu' : 'Isi password dulu')
        return
      }
      setPending(true)
      setError('')
      try {
        const user2 = await apiFetch<SessionUser>('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            username: username.trim(),
            password: secret,
            mode: mode === 'PIN' ? 'PIN' : 'PASSWORD',
          }),
        })
        await refresh()
        const next = searchParams.get('next')
        const target = next && canAccessPage(next, user2.role) ? next : homeForRole(user2.role)
        if (asPractice || practiceMode) {
          toast.warning('MODE LATIHAN aktif — hati-hati, ini bukan data sungguhan', { duration: 6000 })
        }
        toast.success(`Selamat datang, ${user2.name}!`)
        router.replace(target)
      } catch (e) {
        if (e instanceof ApiError && e.status === 429) {
          const m = e.message.match(/(\d+)\s*detik/)
          setCooldown(m ? parseInt(m[1], 10) : 30)
          setError(e.message)
        } else {
          setError(e instanceof Error ? e.message : 'Gagal masuk — coba lagi')
        }
      } finally {
        setPending(false)
      }
    },
    [pending, cooldown, username, password, pin, mode, refresh, router, searchParams, practiceMode]
  )

  // Enter submits
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  const busy = pending || cooldown > 0 || loading

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-cream px-4 py-10">
      <main className="w-full max-w-sm">
        {/* Brand */}
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="Logo Sekelas Cafe" className="mx-auto h-16 w-auto object-contain" draggable={false} />
          <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight">Sekelas Cafe</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sistem Operasional Kafe</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          {/* Mode toggle */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-cream-deep p-1 dark:bg-secondary" role="tablist" aria-label="Cara masuk">
            {(
              [
                { id: 'PASSWORD', label: 'Password', icon: Lock },
                { id: 'PIN', label: 'PIN Cepat', icon: KeyRound },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => {
                  setMode(m.id)
                  setError('')
                }}
                className={cn(
                  'flex min-h-[44px] items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all',
                  mode === m.id ? 'bg-card shadow-sm text-espresso dark:text-cream' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <m.icon className="h-4 w-4" aria-hidden />
                {m.label}
              </button>
            ))}
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  id="username"
                  className="min-h-[48px] pl-9"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="mis. kasir1"
                  autoComplete="username"
                  autoFocus
                  onKeyDown={onKeyDown}
                />
              </div>
            </div>

            {mode === 'PASSWORD' ? (
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="min-h-[48px] pl-9 pr-11"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="password kamu"
                    autoComplete="current-password"
                    onKeyDown={onKeyDown}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Lihat password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>PIN (4–6 digit)</Label>
                <PinPad pin={pin} onChange={setPin} onFull={() => void submit()} />
              </div>
            )}

            <AnimatePresence>
              {(error || cooldown > 0) && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
                  role="alert"
                  aria-live="assertive"
                >
                  {cooldown > 0 ? `Terlalu banyak percobaan — coba lagi dalam ${cooldown}s` : error}
                </motion.p>
              )}
            </AnimatePresence>

            <Button
              type="submit"
              disabled={busy}
              className="min-h-[48px] w-full bg-espresso text-cream hover:bg-espresso-soft"
            >
              {pending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Memeriksa…
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" aria-hidden /> Masuk
                </>
              )}
            </Button>

            {practiceMode && (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => void submit(true)}
                className="min-h-[48px] w-full border-caramel/60 text-warning hover:bg-caramel/10"
              >
                <Coffee className="mr-2 h-4 w-4" aria-hidden /> Masuk Mode Latihan
              </Button>
            )}
          </form>
        </div>

        {/* Demo credentials hint */}
        <Collapsible className="mt-4">
          <CollapsibleTrigger className="flex min-h-[44px] w-full items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            Akun demo <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 rounded-xl border border-dashed bg-cream/60 p-4 text-xs leading-relaxed text-muted-foreground dark:bg-secondary/40">
              <p className="font-semibold text-foreground">Akun demo</p>
              <p className="mt-1">
                <span className="font-mono">admin</span> · <span className="font-mono">kasir1</span> ·{' '}
                <span className="font-mono">barista1</span>
              </p>
              <p>
                Password: <span className="font-mono">password123</span> — PIN:{' '}
                <span className="font-mono">1234 / 1111 / 2222</span>
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Kafe siswa SMKN 1 Boyolangu · Sen–Jum 07.00–14.00
        </p>
      </main>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  )
}
