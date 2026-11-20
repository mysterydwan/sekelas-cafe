'use client'

// User editor drawer (SPEC §3.14): account fields + per-grant overrides
// grouped by domain, PIN/password admin-set, Salin Peran, cheat-sheet print.
import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, KeyRound, Loader2, Printer, RotateCcw, UserCog, Users } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import {
  GRANT_GROUPS,
  GRANT_LABELS,
  ROLE_GRANTS,
  ROLE_LABELS,
  effectiveGrants,
  type Grant,
} from '@/lib/grants'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { printHtml, type UserDTO } from './shared'

const ROLES: Role[] = ['ADMIN', 'CASHIER', 'BARISTA']

export function UserEditor({
  user, // null = create
  users,
  onClosed,
  onSaved,
}: {
  user: UserDTO | null
  users: UserDTO[]
  onClosed: () => void
  onSaved: () => void
}) {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState(user?.name ?? '')
  const [username, setUsername] = useState(user?.username ?? '')
  const [role, setRole] = useState<Role>(user?.role ?? 'CASHIER')
  const [grants, setGrants] = useState<string[] | null>(user?.grants ?? null)
  const [password, setPassword] = useState('')
  const [pinText, setPinText] = useState('')
  const [clearPin, setClearPin] = useState(false)
  const [isActive, setIsActive] = useState(user?.isActive ?? true)
  const [isTraining, setIsTraining] = useState(user?.isTraining ?? false)
  const [copyFrom, setCopyFrom] = useState('')
  const [serverError, setServerError] = useState<string | null>(null)

  const close = () => {
    setOpen(false)
    setTimeout(onClosed, 260)
  }

  const effective = useMemo(() => (grants !== null ? grants : ROLE_GRANTS[role]), [grants, role])
  const overrideCount = grants !== null ? grants.length : 0

  // client-side last-admin guard preview (server enforces too)
  const otherActiveAdmins = users.filter((u) => u.role === 'ADMIN' && u.isActive && u.id !== user?.id).length
  const isLastActiveAdmin = user?.role === 'ADMIN' && user.isActive && otherActiveAdmins === 0
  const guardBlocked = isLastActiveAdmin && (!isActive || role !== 'ADMIN')

  const usernameTaken = useMemo(
    () => !!username.trim() && users.some((u) => u.username === username.trim().toLowerCase() && u.id !== user?.id),
    [username, users, user]
  )

  const toggleGrant = (g: Grant) => {
    setGrants((cur) => {
      const base = cur !== null ? cur : [...ROLE_GRANTS[role]]
      return base.includes(g) ? base.filter((x) => x !== g) : [...base, g]
    })
  }

  const printCheatSheet = () => {
    const list = (gs: string[]) =>
      gs.length === 0
        ? '<p class="muted">—</p>'
        : `<ul>${gs.map((g) => `<li>${GRANT_LABELS[g as Grant] ?? g}</li>`).join('')}</ul>`
    const body = `
      <h1>${name || user?.name || 'Pengguna'}</h1>
      <p><span class="mono">${user?.username ?? username}</span> · Peran: <strong>${ROLE_LABELS[role]}</strong>
      ${grants !== null ? ' · izin ditimpa khusus' : ' · izin bawaan peran'}${isTraining ? ' · akun latihan' : ''}</p>
      <div class="line"></div>
      ${GRANT_GROUPS.map(
        (grp) => `
        <h2>${grp.domain}</h2>
        ${list(grp.grants.filter((g) => effective.includes(g)))}
      `
      ).join('')}
      <p class="muted" style="margin-top:10px">Lembar ringkasan peran — Sekelas Cafe, dicetak ${new Date().toLocaleDateString('id-ID')}.</p>
    `
    if (!printHtml('Ringkasan Peran', body)) toast.error('Izinkan pop-up untuk mencetak')
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (user) {
        const body: Record<string, unknown> = {}
        if (name.trim() !== user.name) body.name = name.trim()
        if (role !== user.role) body.role = role
        if (password) body.password = password
        if (clearPin) body.pin = null
        else if (pinText) body.pin = pinText
        if (isActive !== user.isActive) body.isActive = isActive
        if (isTraining !== user.isTraining) body.isTraining = isTraining
        if (JSON.stringify(grants) !== JSON.stringify(user.grants)) body.grants = grants
        return apiFetch(`/api/users/${user.id}`, { method: 'PATCH', body: JSON.stringify(body) })
      }
      return apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim().toLowerCase(),
          password,
          role,
          pin: pinText || null,
          grants,
          isTraining,
        }),
      })
    },
    onSuccess: () => {
      toast.success(user ? `Akun "${name.trim()}" diperbarui` : `Akun "${name.trim()}" dibuat`)
      onSaved()
      close()
    },
    onError: (e: Error) => {
      setServerError(e.message)
      toast.error(e.message)
    },
  })

  const submit = () => {
    setServerError(null)
    if (!name.trim()) return setServerError('Nama wajib diisi')
    if (!user) {
      if (username.trim().length < 3) return setServerError('Username minimal 3 karakter')
      if (usernameTaken) return setServerError(`Username "${username.trim()}" sudah dipakai`)
      if (password.length < 4) return setServerError('Password minimal 4 karakter')
    }
    if (pinText && !/^\d{4,6}$/.test(pinText)) return setServerError('PIN harus 4–6 digit')
    if (guardBlocked) {
      return setServerError(
        isLastActiveAdmin && role !== 'ADMIN'
          ? 'Admin aktif terakhir tidak bisa diturunkan perannya'
          : 'Admin aktif terakhir tidak bisa dinonaktifkan'
      )
    }
    saveMutation.mutate()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl scrollbar-warm"
      >
        <SheetHeader className="sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur md:px-6">
          <SheetTitle className="flex items-center gap-2 font-display">
            <UserCog className="h-5 w-5 text-caramel" aria-hidden />
            {user ? `Edit: ${user.name}` : 'Pengguna Baru'}
          </SheetTitle>
          <SheetDescription className="sr-only">Formulir akun staf beserta izin akses.</SheetDescription>
          <div className="flex items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-11" onClick={printCheatSheet}>
              <Printer className="mr-1 h-4 w-4" aria-hidden /> Lembar Peran
            </Button>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" className="h-11" onClick={close}>
                Tutup
              </Button>
              <Button
                size="sm"
                className="h-11 bg-espresso px-5 text-cream hover:bg-espresso-soft"
                onClick={submit}
                disabled={saveMutation.isPending || guardBlocked}
              >
                {saveMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />}
                Simpan
              </Button>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-6 px-4 py-4 md:px-6">
          {/* account */}
          <section className="space-y-4" aria-label="Data akun">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="u-name">Nama</Label>
                <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Rani Pratiwi" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="u-username">Username</Label>
                {user ? (
                  <div className="flex h-11 items-center rounded-xl border bg-cream/50 px-3">
                    <span className="font-mono text-sm">{user.username}</span>
                  </div>
                ) : (
                  <>
                    <Input
                      id="u-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value.toLowerCase())}
                      placeholder="huruf kecil, tanpa spasi"
                      className="font-mono"
                      aria-invalid={usernameTaken}
                      aria-describedby={usernameTaken ? 'u-username-error' : undefined}
                    />
                    {usernameTaken && (
                      <p id="u-username-error" className="text-xs font-medium text-destructive" role="alert">
                        Username sudah dipakai — pilih yang lain.
                      </p>
                    )}
                  </>
                )}
                {user && <p className="text-xs text-muted-foreground">Username tetap agar riwayat tetap teratribusi.</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Peran</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger className="h-11 w-full" aria-label="Peran">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="rounded-xl bg-cream/60 p-2.5">
                  <p className="text-xs font-semibold text-muted-foreground">Izin bawaan {ROLE_LABELS[role]}:</p>
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {ROLE_GRANTS[role].map((g) => (
                      <li key={g}>{GRANT_LABELS[g as Grant] ?? g}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="u-password">
                    {user ? 'Password baru' : 'Password'}
                  </Label>
                  <Input
                    id="u-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={user ? 'kosongkan bila tidak diubah' : 'minimal 4 karakter'}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    {user
                      ? 'Disetel admin — tidak ada alur email/lupa password.'
                      : 'Admin menyetel langsung — tidak ada alur email.'}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-pin" className="flex items-center gap-1.5">
                    <KeyRound className="h-3.5 w-3.5" aria-hidden /> PIN login cepat (opsional)
                  </Label>
                  <Input
                    id="u-pin"
                    inputMode="numeric"
                    maxLength={6}
                    value={clearPin ? '' : pinText}
                    onChange={(e) => {
                      setPinText(e.target.value.replace(/[^\d]/g, ''))
                      setClearPin(false)
                    }}
                    placeholder="4–6 digit"
                    className="font-mono tracking-widest"
                    disabled={clearPin}
                  />
                  {user?.hasPin && (
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        PIN terpasang
                      </Badge>
                      <button
                        type="button"
                        className="text-destructive underline"
                        onClick={() => {
                          setClearPin((c) => !c)
                          if (!clearPin) setPinText('')
                        }}
                      >
                        {clearPin ? 'Batal hapus PIN' : 'Hapus PIN'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="text-sm font-medium">
                  Akun aktif
                  <span className="block text-xs font-normal text-muted-foreground">bisa masuk & bekerja</span>
                </span>
                <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Akun aktif" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="text-sm font-medium">
                  Mode latihan
                  <span className="block text-xs font-normal text-muted-foreground">
                    pesanan latihan dikecualikan dari laporan & stok
                  </span>
                </span>
                <Switch checked={isTraining} onCheckedChange={setIsTraining} aria-label="Mode latihan" />
              </label>
            </div>

            {isLastActiveAdmin && (
              <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-caramel/10 p-3 text-sm text-warning" role="alert">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                Ini admin aktif terakhir — tidak bisa dinonaktifkan atau diturunkan perannya. Buat
                admin lain dulu.
              </p>
            )}
          </section>

          <Separator />

          {/* grants */}
          <section className="space-y-3" aria-label="Izin akses">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-semibold">Izin Akses</h3>
                <p className="text-xs text-muted-foreground">
                  {grants === null
                    ? 'Mengikuti bawaan peran — nyalakan/ matikan satu izin untuk menimpa.'
                    : `Timpa khusus aktif — ${overrideCount} izin diberikan.`}
                </p>
              </div>
              <div className="flex gap-2">
                {grants !== null && (
                  <Button variant="outline" size="sm" className="h-11" onClick={() => setGrants(null)}>
                    <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Gunakan bawaan peran
                  </Button>
                )}
                {grants === null && <Badge variant="outline" className="border-caramel/40 bg-cream text-espresso">bawaan</Badge>}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {GRANT_GROUPS.map((grp) => (
                <div key={grp.domain} className="rounded-xl border p-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {grp.domain}
                  </p>
                  <div className="space-y-1">
                    {grp.grants.map((g) => (
                      <label
                        key={g}
                        className={cn(
                          'flex cursor-pointer items-start justify-between gap-2 rounded-lg p-2 text-sm transition-colors hover:bg-cream/60',
                          !effective.includes(g) && 'opacity-70'
                        )}
                      >
                        <span>
                          {GRANT_LABELS[g]}
                          <span className="block font-mono text-[10px] text-muted-foreground">{g}</span>
                        </span>
                        <Switch
                          checked={effective.includes(g)}
                          onCheckedChange={() => toggleGrant(g)}
                          aria-label={GRANT_LABELS[g]}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Salin Peran */}
            <div className="rounded-xl border border-dashed border-caramel/50 bg-cream/40 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Users className="h-4 w-4 text-caramel" aria-hidden /> Salin peran dari pengguna lain
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Untuk onboarding kohort baru — duplikasi set izin pengguna lama dalam sekali klik.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Select value={copyFrom || undefined} onValueChange={setCopyFrom}>
                  <SelectTrigger className="h-11 w-full sm:w-64" aria-label="Pilih pengguna sumber">
                    <SelectValue placeholder="Pilih pengguna…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {users
                      .filter((u) => u.id !== user?.id)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name} ({ROLE_LABELS[u.role]})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  className="h-11"
                  disabled={!copyFrom}
                  onClick={() => {
                    const src = users.find((u) => u.id === copyFrom)
                    if (!src) return
                    setGrants(effectiveGrants(src))
                    toast.success(`Izin disalin dari ${src.name}`)
                  }}
                >
                  Salin Peran
                </Button>
              </div>
            </div>
          </section>

          <p className="rounded-xl border border-dashed bg-cream/50 p-3 text-xs text-muted-foreground">
            Hapus permanen tidak tersedia — riwayat transaksi harus tetap teratribusi. Nonaktifkan
            akun untuk menghentikan akses.
          </p>

          {serverError && (
            <p className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive" role="alert">
              {serverError}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
