'use client'

// POS cash drawer strip (SPEC §3.6): opening float capture ("modal awal"),
// cash in/out entries w/ reason, expected cash always visible.

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/client'
import { formatIDR } from '@/lib/format'
import type { CashStatusDTO } from '@/lib/types'
import { cn } from '@/lib/utils'

type DialogState = { kind: 'FLOAT' } | { kind: 'IN' } | { kind: 'OUT' } | null

export function CashStrip({ cash, loading }: { cash: CashStatusDTO | undefined; loading: boolean }) {
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const openDialog = (kind: 'FLOAT' | 'IN' | 'OUT') => {
    setAmount('')
    setReason('')
    setDialog({ kind })
  }

  const submit = async () => {
    if (!dialog || busy) return
    const value = parseInt(amount, 10)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Masukkan jumlah yang valid')
      return
    }
    if (dialog.kind !== 'FLOAT' && !reason.trim()) {
      toast.error('Alasan wajib diisi')
      return
    }
    setBusy(true)
    try {
      await apiFetch('/api/pos/cash', {
        method: 'POST',
        body: JSON.stringify({
          type: dialog.kind === 'FLOAT' ? 'OPENING_FLOAT' : dialog.kind === 'IN' ? 'CASH_IN' : 'CASH_OUT',
          amount: value,
          reason: reason.trim() || undefined,
        }),
      })
      await queryClient.invalidateQueries({ queryKey: ['pos-cash'] })
      toast.success(
        dialog.kind === 'FLOAT' ? 'Modal awal laci tercatat' : dialog.kind === 'IN' ? 'Uang masuk tercatat' : 'Uang keluar tercatat'
      )
      setDialog(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  if (loading && !cash) {
    return <Skeleton className="m-3 h-11 rounded-lg" />
  }

  return (
    <div className="border-b bg-cream/60 px-3 py-2.5 dark:bg-secondary/40">
      {!cash?.hasFloat ? (
        <button
          type="button"
          onClick={() => openDialog('FLOAT')}
          className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-warning/50 bg-caramel/15 px-3 text-sm font-semibold text-warning transition-colors hover:bg-caramel/25"
        >
          <Wallet className="h-4 w-4" aria-hidden />
          Atur Modal Awal — laci belum dibuka hari ini
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Kas di laci (diharapkan)</p>
            {cash.expectedCash != null ? (
              <p className="font-mono text-sm font-bold tabular-nums">{formatIDR(cash.expectedCash)}</p>
            ) : (
              <p className="text-xs text-muted-foreground" title="Visibilitas kas diharapkan mengikuti izin report.viewAll">
                Sembunyi — butuh izin lihat laporan
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('IN')}
            className="min-h-[40px] border-success/40 text-success hover:bg-success/10"
          >
            <ArrowDownToLine className="mr-1 h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Uang Masuk</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openDialog('OUT')}
            className="min-h-[40px] border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <ArrowUpFromLine className="mr-1 h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Uang Keluar</span>
          </Button>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === 'FLOAT' ? 'Modal Awal Laci' : dialog?.kind === 'IN' ? 'Uang Masuk' : 'Uang Keluar'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cash-amount">
                {dialog?.kind === 'FLOAT' ? 'Nominal modal awal' : 'Nominal'}
              </Label>
              <Input
                id="cash-amount"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="mis. 50000"
                autoFocus
                className="min-h-[48px] font-mono text-lg tabular-nums"
              />
              {amount && (
                <p className="text-xs text-muted-foreground">{formatIDR(parseInt(amount, 10) || 0)}</p>
              )}
            </div>
            {dialog?.kind !== 'FLOAT' && (
              <div className="space-y-1.5">
                <Label htmlFor="cash-reason">Alasan (wajib)</Label>
                <Input
                  id="cash-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={dialog?.kind === 'IN' ? 'mis. titipan kembalian' : 'mis. beli es batu'}
                  maxLength={120}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => void submit()}
              disabled={busy}
              className={cn(
                'min-h-[44px] w-full',
                dialog?.kind === 'OUT' ? 'bg-destructive hover:bg-destructive/90' : 'bg-espresso text-cream hover:bg-espresso-soft'
              )}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
