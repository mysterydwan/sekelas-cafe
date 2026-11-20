'use client'

// Hourly revenue bar chart (SPEC §3.5) with busiest-hour chip.

import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts'
import { Flame } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatIDR } from '@/lib/format'
import type { DashboardDTO } from '@/lib/types'

const chartConfig = {
  revenue: { label: 'Pendapatan', color: 'var(--chart-1)' },
} satisfies ChartConfig

export function HourlyRevenueChart({
  hourly,
  loading,
}: {
  hourly: DashboardDTO['hourly']
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    )
  }

  if (hourly.length === 0) {
    return (
      <div className="flex h-56 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-center">
        <p className="text-sm font-medium text-muted-foreground">Belum ada penjualan hari ini</p>
        <p className="text-xs text-muted-foreground">Grafik terisi otomatis saat pesanan masuk.</p>
      </div>
    )
  }

  const busiest = hourly.reduce((max, h) => (h.revenue > max.revenue ? h : max), hourly[0])
  const data = hourly.map((h) => ({ hour: `${h.hour}.00`, revenue: h.revenue, orders: h.orders }))

  return (
    <div className="space-y-3">
      <Badge className="border-caramel/50 bg-caramel/15 text-warning">
        <Flame className="mr-1 h-3.5 w-3.5" aria-hidden />
        Jam tersibuk: {busiest.hour}.00 — {formatIDR(busiest.revenue)} ({busiest.orders} pesanan)
      </Badge>
      <ChartContainer config={chartConfig} className="h-56 w-full">
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                formatter={(value) => <span className="font-mono font-medium tabular-nums">{formatIDR(Number(value))}</span>}
              />
            }
          />
          <Bar dataKey="revenue" fill="var(--color-revenue)" radius={6} minPointSize={4} />
        </BarChart>
      </ChartContainer>
    </div>
  )
}
