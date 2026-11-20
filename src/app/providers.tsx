'use client'

import { ThemeProvider } from 'next-themes'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { Toaster } from '@/components/ui/sonner'
import { SessionProvider } from '@/hooks/use-session'
import { I18nProvider, type Lang } from '@/lib/i18n'

export function Providers({
  initialLang,
  children,
}: {
  initialLang?: Lang
  children: React.ReactNode
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <I18nProvider initialLang={initialLang}>
          <SessionProvider>
            {children}
            <Toaster position="top-center" richColors />
          </SessionProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
