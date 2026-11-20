'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw, ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[app error]', error)
  }, [error])

  const copyDetails = async () => {
    const text = `${error.message}\n${error.digest ? 'digest: ' + error.digest : ''}\n${error.stack ?? ''}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Detail error disalin — serahkan ke guru pendamping')
    } catch {
      toast.error('Gagal menyalin detail error')
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 rounded-full bg-destructive/10 p-5 text-destructive" aria-hidden>
        <AlertTriangle className="h-10 w-10" />
      </div>
      <h2 className="font-display text-2xl font-semibold">Waduh, ada yang error</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        Data kamu aman — keranjang dan antrean dapur tersimpan otomatis. Coba muat ulang halaman.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset} className="bg-espresso text-cream hover:bg-espresso-soft">
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden /> Coba lagi
        </Button>
        <Button variant="outline" onClick={copyDetails}>
          <ClipboardCopy className="mr-2 h-4 w-4" aria-hidden /> Salin detail error
        </Button>
      </div>
    </div>
  )
}
