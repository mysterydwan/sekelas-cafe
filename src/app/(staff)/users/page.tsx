'use client'

// /users — Users & Roles (SPEC §3.14, Admin only): staff table + editor drawer.
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KeyRound, Pencil, Plus, RotateCcw, Search, SearchX, UserRound, Users } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { formatDateTime } from '@/lib/format'
import { ROLE_GRANTS, ROLE_LABELS } from '@/lib/grants'
import type { Role } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSession } from '@/hooks/use-session'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader, EmptyState, TableSkeleton } from '@/components/staff/primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { UserEditor } from '@/components/management/user-editor'
import { useDebouncedValue, type UserDTO } from '@/components/management/shared'

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'bg-espresso text-cream border-espresso',
  CASHIER: 'bg-caramel/20 text-espresso border-caramel/60',
  BARISTA: 'bg-success/15 text-success border-success/40',
}

export default function UsersPage() {
  return (
    <PageGuard page="/users">
      <UsersInner />
    </PageGuard>
  )
}

function UsersInner() {
  const { user: me } = useSession()
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const [roleFilter, setRoleFilter] = useState('all')
  const [editing, setEditing] = useState<{ user: UserDTO | null; nonce: number } | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const q = useQuery({
    queryKey: ['users'],
    queryFn: () => apiFetch<{ users: UserDTO[] }>('/api/users'),
  })
  const users = q.data?.users ?? []

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      if (!u.name.toLowerCase().includes(s) && !u.username.toLowerCase().includes(s)) return false
    }
    return true
  })

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Pengguna & Peran"
        description="Akun staf, izin akses per tindakan, PIN, dan mode latihan."
        actions={
          <Button
            className="h-11 bg-espresso text-cream hover:bg-espresso-soft"
            onClick={() => setEditing({ user: null, nonce: Date.now() })}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Pengguna
          </Button>
        }
      />

      <p className="rounded-xl border border-dashed bg-cream/50 p-3 text-sm text-muted-foreground">
        Hapus permanen tidak tersedia — riwayat transaksi harus tetap teratribusi. Nonaktifkan akun
        untuk menghentikan akses; username tidak bisa diubah.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau username… (tekan /)"
            aria-label="Cari pengguna"
            className="h-11 pl-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="h-11 w-40" aria-label="Filter peran">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua peran</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="CASHIER">Kasir</SelectItem>
            <SelectItem value="BARISTA">Barista</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {q.isLoading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : q.isError ? (
        <p className="text-sm text-destructive" role="alert">
          Gagal memuat pengguna —{' '}
          <button className="underline" onClick={() => q.refetch()}>
            coba muat ulang
          </button>
        </p>
      ) : filtered.length === 0 ? (
        users.length === 0 ? (
          <EmptyState
            icon={<Users className="h-10 w-10" aria-hidden />}
            title="Belum ada pengguna"
            description="Tambahkan akun staf pertama."
            action={
              <Button className="bg-espresso text-cream hover:bg-espresso-soft" onClick={() => setEditing({ user: null, nonce: Date.now() })}>
                <Plus className="mr-2 h-4 w-4" aria-hidden /> Tambah Pengguna
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<SearchX className="h-10 w-10" aria-hidden />}
            title="Tidak ada pengguna yang cocok"
            description="Coba kata kunci lain atau reset filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setRoleFilter('all')
                }}
              >
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden /> Reset Filter
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Peran</TableHead>
                <TableHead>Izin</TableHead>
                <TableHead className="hidden text-center sm:table-cell">Status</TableHead>
                <TableHead className="hidden text-center md:table-cell">PIN</TableHead>
                <TableHead className="hidden lg:table-cell">Login terakhir</TableHead>
                <TableHead className="w-10 text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id} className={cn(!u.isActive && 'opacity-55')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cream text-espresso" aria-hidden>
                        <UserRound className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium">
                          {u.name}
                          {u.id === me?.id && <span className="ml-1.5 text-xs text-muted-foreground">(kamu)</span>}
                        </p>
                        {u.isTraining && (
                          <Badge variant="outline" className="mt-0.5 border-warning/50 bg-caramel/10 text-warning">
                            Akun latihan
                          </Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={ROLE_BADGE[u.role]}>
                      {ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {u.grants === null ? (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        bawaan ({ROLE_GRANTS[u.role].length})
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-caramel/50 bg-caramel/15 text-espresso">
                        {u.grants.length} override
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-center sm:table-cell">
                    {u.isActive ? (
                      <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                        Aktif
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                        Nonaktif
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-center md:table-cell">
                    {u.hasPin ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success">
                        <KeyRound className="h-3.5 w-3.5" aria-hidden /> Terpasang
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                    {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'belum pernah'}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-11 w-11"
                      onClick={() => setEditing({ user: u, nonce: Date.now() })}
                      aria-label={`Edit ${u.name}`}
                    >
                      <Pencil className="h-4 w-4" aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {editing && (
        <UserEditor
          key={editing.nonce}
          user={editing.user}
          users={users}
          onClosed={() => setEditing(null)}
          onSaved={() => q.refetch()}
        />
      )}
    </div>
  )
}
