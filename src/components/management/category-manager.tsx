'use client'

// Category manager dialog (SPEC §3.10): inline CRUD, delete guarded while
// active products exist (server 409 surfaced inline with the count).
// Mounted per-open by the parent (key remount) — local rows seed from props.
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Plus, Tags, Trash2 } from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { CategoryRow } from './shared'

export function CategoryManager({
  categories,
  onClosed,
  onChanged,
}: {
  categories: CategoryRow[]
  onClosed: () => void
  onChanged: () => void
}) {
  const [open, setOpen] = useState(true)
  // local editable mirror; commits fire per-row on blur / toggle / delete
  const [rows, setRows] = useState<CategoryRow[]>(categories)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('')
  const [newSort, setNewSort] = useState('0')

  const close = () => {
    setOpen(false)
    setTimeout(onClosed, 220)
  }
  const patchRow = (id: string, p: Partial<CategoryRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)))

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch(`/api/categories/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => onChanged(),
    onError: (e: Error, { id }) => setErrors((er) => ({ ...er, [id]: e.message })),
  })

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<CategoryRow>('/api/categories', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (created: { id: string; name: string; sortOrder: number; isActive: boolean }) => {
      setRows((rs) => [...rs, { ...created, productCount: 0 }])
      setNewName('')
      setNewSort('0')
      onChanged()
      toast.success('Kategori ditambahkan')
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string; soft?: boolean; deleted?: boolean }>(`/api/categories/${id}`, { method: 'DELETE' }),
    onSuccess: (data: { id: string; soft?: boolean; deleted?: boolean }, id) => {
      if (data?.soft) {
        // still referenced by inactive products — deactivated, not removed
        patchRow(id, { isActive: false })
        toast.success('Kategori dinonaktifkan — masih dipakai produk nonaktif')
      } else {
        setRows((rs) => rs.filter((r) => r.id !== id))
        toast.success('Kategori dihapus')
      }
      setErrors((er) => {
        const copy = { ...er }
        delete copy[id]
        return copy
      })
      onChanged()
    },
    onError: (e: Error, id) => setErrors((er) => ({ ...er, [id]: e.message })),
  })

  const commitName = (row: CategoryRow) => {
    const name = row.name.trim()
    if (!name || name === categories.find((c) => c.id === row.id)?.name) return
    updateMutation.mutate({ id: row.id, body: { name } })
  }
  const commitSort = (row: CategoryRow) => {
    const sortOrder = Number.isFinite(row.sortOrder) ? row.sortOrder : 0
    if (sortOrder === categories.find((c) => c.id === row.id)?.sortOrder) return
    updateMutation.mutate({ id: row.id, body: { sortOrder } })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg scrollbar-warm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Tags className="h-5 w-5 text-caramel" aria-hidden /> Kelola Kategori
          </DialogTitle>
          <DialogDescription>
            Urutan kecil tampil lebih dulu di menu. Kategori dengan produk aktif tidak bisa dihapus.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="list" aria-label="Daftar kategori">
          {rows.length === 0 && (
            <p className="rounded-xl border border-dashed bg-cream/50 p-4 text-sm text-muted-foreground">
              Belum ada kategori.
            </p>
          )}
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border p-3" role="listitem">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={row.name}
                  aria-label="Nama kategori"
                  onChange={(e) => patchRow(row.id, { name: e.target.value })}
                  onBlur={() => commitName(row)}
                  className="h-11 min-w-32 flex-1"
                />
                <Input
                  type="number"
                  value={row.sortOrder}
                  aria-label="Urutan kategori"
                  onChange={(e) => patchRow(row.id, { sortOrder: parseInt(e.target.value || '0', 10) || 0 })}
                  onBlur={() => commitSort(row)}
                  className="h-11 w-20"
                />
                <label className="flex h-11 items-center gap-2 rounded-xl border px-3">
                  <Switch
                    checked={row.isActive}
                    onCheckedChange={(v) => {
                      patchRow(row.id, { isActive: v })
                      updateMutation.mutate({ id: row.id, body: { isActive: v } })
                    }}
                    aria-label={`Kategori ${row.name} aktif`}
                  />
                  <span className="hidden text-xs text-muted-foreground sm:inline">aktif</span>
                </label>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10"
                  disabled={deleteMutation.isPending && deleteMutation.variables === row.id}
                  onClick={() => {
                    setErrors((er) => ({ ...er, [row.id]: '' }))
                    deleteMutation.mutate(row.id)
                  }}
                  aria-label={`Hapus kategori ${row.name}`}
                >
                  {deleteMutation.isPending && deleteMutation.variables === row.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden />
                  )}
                </Button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="border-caramel/30 bg-cream text-espresso">
                  {row.productCount} produk aktif
                </Badge>
                {!row.isActive && (
                  <Badge variant="outline" className="border-border bg-muted text-muted-foreground">
                    Nonaktif
                  </Badge>
                )}
                {errors[row.id] && (
                  <p className="text-xs font-medium text-destructive" role="alert">{errors[row.id]}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-dashed border-caramel/50 bg-cream/40 p-3">
          <p className="mb-2 text-sm font-semibold">Tambah kategori</p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="cth. Makanan Ringan"
              aria-label="Nama kategori baru"
              className="h-11 min-w-32 flex-1"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newName.trim()) {
                  createMutation.mutate({ name: newName.trim(), sortOrder: parseInt(newSort || '0', 10) || 0 })
                }
              }}
            />
            <Input
              type="number"
              value={newSort}
              onChange={(e) => setNewSort(e.target.value)}
              aria-label="Urutan kategori baru"
              className="h-11 w-20"
            />
            <Button
              className="h-11 bg-espresso px-4 text-cream hover:bg-espresso-soft"
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() =>
                createMutation.mutate({ name: newName.trim(), sortOrder: parseInt(newSort || '0', 10) || 0 })
              }
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Plus className="mr-1 h-4 w-4" aria-hidden />
              )}
              Tambah
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
