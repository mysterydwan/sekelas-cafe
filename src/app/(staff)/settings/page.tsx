'use client'

// /settings — Settings (SPEC §3.15, Admin only): 7 tab sections over SettingsDTO.
// The page owns dirty-tracking + save; each section is a controlled form slice.
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Boxes,
  Clock,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShoppingBag,
  Store,
  Wallet,
} from 'lucide-react'
import { apiFetch } from '@/lib/client'
import { useSession } from '@/hooks/use-session'
import { PageGuard } from '@/components/staff/page-guard'
import { PageHeader } from '@/components/staff/primitives'
import type { SettingsDTO } from '@/lib/types'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  HoursSection,
  OrderingSection,
  PaymentsSection,
  ProfileSection,
  ReceiptsSection,
  StockSection,
  SystemSection,
} from '@/components/management/settings-sections'

type SectionKey = 'profile' | 'hours' | 'ordering' | 'payments' | 'receipts' | 'stock' | 'system'

const TABS: { key: SectionKey; label: string; icon: typeof Store }[] = [
  { key: 'profile', label: 'Profil', icon: Store },
  { key: 'hours', label: 'Jam Buka', icon: Clock },
  { key: 'ordering', label: 'Pesanan', icon: ShoppingBag },
  { key: 'payments', label: 'Pembayaran', icon: Wallet },
  { key: 'receipts', label: 'Struk', icon: ReceiptText },
  { key: 'stock', label: 'Stok', icon: Boxes },
  { key: 'system', label: 'Sistem', icon: Settings2 },
]

export default function SettingsPage() {
  return (
    <PageGuard page="/settings">
      <SettingsInner />
    </PageGuard>
  )
}

function SettingsInner() {
  const qc = useQueryClient()
  const { can } = useSession()
  const [tab, setTab] = useState<SectionKey>('profile')
  const [draft, setDraft] = useState<SettingsDTO | null>(null)
  const [pendingTab, setPendingTab] = useState<SectionKey | null>(null)

  const settingsQ = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiFetch<SettingsDTO>('/api/settings'),
  })
  const server = settingsQ.data
  const value = draft ?? server
  const canSave = can('settings.manage')
  const dirty = !!draft && !!server && JSON.stringify(draft) !== JSON.stringify(server)

  // Warn before losing unsaved edits when leaving the page entirely.
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  function patchSection<K extends SectionKey>(section: K, p: Partial<SettingsDTO[K]>) {
    setDraft((prev) => {
      const base = prev ?? server
      if (!base) return prev
      return { ...base, [section]: { ...base[section], ...p } } as SettingsDTO
    })
  }

  const saveM = useMutation({
    mutationFn: async () => {
      if (!server || !draft) throw new Error('Tidak ada perubahan untuk disimpan')
      const changed = TABS.map((t) => t.key).filter(
        (k) => JSON.stringify(draft[k]) !== JSON.stringify(server[k])
      )
      if (changed.length === 0) throw new Error('Tidak ada perubahan untuk disimpan')
      let last: SettingsDTO = server
      for (const section of changed) {
        last = await apiFetch<SettingsDTO>('/api/settings', {
          method: 'PATCH',
          body: JSON.stringify({ section, patch: draft[section] }),
        })
      }
      return { saved: changed.length, settings: last }
    },
    onSuccess: ({ saved, settings }) => {
      qc.setQueryData(['settings'], settings)
      setDraft(null)
      toast.success('Pengaturan disimpan', {
        description: `${saved} bagian diperbarui — perubahan langsung berlaku di semua halaman.`,
      })
      // Settings feed many screens (hours chip, receipts, storefront…) — refetch broadly.
      void qc.invalidateQueries()
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan pengaturan')
    },
  })

  function discard() {
    setDraft(null)
    toast.info('Perubahan dibuang')
  }

  function onTabChange(next: string) {
    const key = next as SectionKey
    if (dirty && key !== tab) {
      setPendingTab(key)
      return
    }
    setTab(key)
  }

  if (settingsQ.isError) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
        <PageHeader title="Pengaturan" />
        <Alert variant="destructive" role="alert">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Gagal memuat pengaturan</AlertTitle>
          <AlertDescription>
            <p>{settingsQ.error instanceof Error ? settingsQ.error.message : 'Coba muat ulang.'}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => void settingsQ.refetch()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden /> Muat ulang
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!value) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-11 w-full max-w-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:space-y-6 md:p-6">
      <PageHeader
        title="Pengaturan"
        description="Profil kafe, jam buka, pesanan, pembayaran, struk, stok, dan sistem."
      />

      {!canSave && (
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Mode lihat saja</AlertTitle>
          <AlertDescription>
            Akunmu tidak punya izin <span className="font-mono text-xs">settings.manage</span> —
            perubahan tidak dapat disimpan.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={onTabChange} aria-label="Bagian pengaturan">
        <TabsList className="h-auto w-full max-w-full justify-start gap-1 overflow-x-auto bg-cream-deep p-1 scrollbar-warm">
          {TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key} className="min-h-11 gap-1.5 px-3">
              <t.icon className="h-4 w-4" aria-hidden /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileSection value={value.profile} onChange={(p) => patchSection('profile', p)} />
        </TabsContent>
        <TabsContent value="hours" className="mt-4">
          <HoursSection value={value.hours} onChange={(p) => patchSection('hours', p)} />
        </TabsContent>
        <TabsContent value="ordering" className="mt-4">
          <OrderingSection value={value.ordering} onChange={(p) => patchSection('ordering', p)} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <PaymentsSection value={value.payments} onChange={(p) => patchSection('payments', p)} />
        </TabsContent>
        <TabsContent value="receipts" className="mt-4">
          <ReceiptsSection value={value.receipts} onChange={(p) => patchSection('receipts', p)} />
        </TabsContent>
        <TabsContent value="stock" className="mt-4">
          <StockSection value={value.stock} onChange={(p) => patchSection('stock', p)} />
        </TabsContent>
        <TabsContent value="system" className="mt-4">
          <SystemSection value={value.system} onChange={(p) => patchSection('system', p)} />
        </TabsContent>
      </Tabs>

      {/* Sticky save bar (dirty guard) — floats above mobile bottom tabs */}
      {dirty && canSave && (
        <div className="sticky bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 -mx-4 mt-2 border-t bg-card/95 px-4 py-3 shadow-lg backdrop-blur md:-mx-6 md:px-6 lg:bottom-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium">Ada perubahan belum disimpan</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={discard} disabled={saveM.isPending}>
                Buang
              </Button>
              <Button
                onClick={() => saveM.mutate()}
                disabled={saveM.isPending}
                className="bg-espresso text-cream hover:bg-espresso-soft"
              >
                {saveM.isPending ? 'Menyimpan…' : 'Simpan'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Tab-switch dirty confirm */}
      <AlertDialog open={pendingTab !== null} onOpenChange={(o) => !o && setPendingTab(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang perubahan sebelum pindah tab?</AlertDialogTitle>
            <AlertDialogDescription>
              Ada perubahan belum disimpan di tab ini. Pindah tab akan membuang perubahanmu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tetap di sini</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDraft(null)
                if (pendingTab) setTab(pendingTab)
                setPendingTab(null)
              }}
            >
              Buang perubahan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
