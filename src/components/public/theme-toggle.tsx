'use client'

import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

export function ThemeToggle() {
  const { t } = useI18n()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setMounted(true))
  }, [])

  const dark = resolvedTheme === 'dark'

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-11 rounded-full text-foreground hover:bg-cream-deep dark:hover:bg-espresso-soft/40"
      aria-label={dark ? t('theme.light') : t('theme.dark')}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
    >
      {mounted && dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  )
}
