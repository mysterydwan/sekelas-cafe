'use client'

// "Lacak Pesanan" dialog — code lookup from the header.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'
import { ORDER_CODE_RE } from './utils'
import { CodeInput } from './code-input'

export function TrackDialog({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const router = useRouter()
  const valid = ORDER_CODE_RE.test(code)

  const submit = () => {
    if (!valid) return
    setOpen(false)
    setCode('')
    router.push(`/track/${code}`)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('header.trackOrder')}</DialogTitle>
          <DialogDescription>
            {t('track.dialogHint')} <span className="font-mono">SKC-012</span>
          </DialogDescription>
        </DialogHeader>
        <CodeInput value={code} onChange={setCode} onSubmit={submit} />
        <Button
          type="button"
          disabled={!valid}
          onClick={submit}
          className="h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {t('track.trackBtn')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
