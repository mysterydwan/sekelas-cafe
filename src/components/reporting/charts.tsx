'use client'

// Recharts wrappers via shadcn chart container — coffee palette tokens.
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { formatIDR, formatNumber } from '@/lib/format'

function compactIDR(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.0', '')}jt`
  if (abs >= 1_000) return `${Math.round(v / 1_000)}rb`
  return String(v)
}

const idrFormatter = (value: unknown) => (
  <span className="font-mono tabular-nums">{formatIDR(Number(value))}</span>
)

const revenueConfig = { revenue: { label: 'Pendapatan', color: 'var(--chart-1)' } } satisfies ChartConfig
const ordersConfig = { orders: { label: 'Pesanan', color: 'var(--chart-2)' } } satisfies ChartConfig
const qtyConfig = { qty: { label: 'Qty terjual', color: 'var(--chart-1)' } } satisfies ChartConfig

export function RevenueByHourChart({ data }: { data: { hour: string; revenue: number }[] }) {
  return (
    <ChartContainer config={revenueConfig} className="aspect-auto h-72 w-full">
      <BarChart data={data.map((d) => ({ ...d, label: `${d.hour}.00` }))} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => compactIDR(v)} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent formatter={idrFormatter} />} />
        <Bar dataKey="revenue" fill="var(--color-revenue)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export function OrdersByHourChart({ data }: { data: { hour: string; orders: number }[] }) {
  return (
    <ChartContainer config={ordersConfig} className="aspect-auto h-56 w-full">
      <BarChart data={data.map((d) => ({ ...d, label: `${d.hour}.00` }))} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} fontSize={11} />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v: unknown) => <span className="font-mono tabular-nums">{formatNumber(Number(v))}</span>} />}
        />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

export function ProductTopChart({ data }: { data: { name: string; qty: number; revenue: number }[] }) {
  return (
    <ChartContainer config={qtyConfig} className="aspect-auto h-80 w-full">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="name"
          width={128}
          tickLine={false}
          axisLine={false}
          fontSize={11}
          tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + '…' : v)}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={(v: unknown) => <span className="font-mono tabular-nums">{formatNumber(Number(v))} pcs</span>} />}
        />
        <Bar dataKey="qty" fill="var(--color-qty)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartContainer>
  )
}

const typeConfig = {
  revenue: { label: 'Pendapatan', color: 'var(--chart-1)' },
} satisfies ChartConfig

const TYPE_COLORS: Record<string, string> = {
  DINE_IN: 'var(--chart-1)',
  TAKE_AWAY: 'var(--chart-3)',
  DELIVERY: 'var(--chart-4)',
}

export function RevenueByTypeChart({ data }: { data: { type: string; label: string; revenue: number }[] }) {
  return (
    <ChartContainer config={typeConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} margin={{ left: 4, right: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={11} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={(v: number) => compactIDR(v)} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent formatter={idrFormatter} />} />
        <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.type} fill={TYPE_COLORS[d.type] ?? 'var(--chart-1)'} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

const paymentConfig = {
  tunai: { label: 'Tunai', color: 'var(--chart-1)' },
  qris: { label: 'QRIS', color: 'var(--chart-2)' },
} satisfies ChartConfig

export function PaymentDonut({ tunai, qris }: { tunai: number; qris: number }) {
  const data = [
    { key: 'tunai', value: tunai },
    { key: 'qris', value: qris },
  ].filter((d) => d.value > 0)
  return (
    <ChartContainer config={paymentConfig} className="mx-auto aspect-square h-56">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="key" formatter={idrFormatter} />} />
        <Pie data={data} dataKey="value" nameKey="key" innerRadius={56} outerRadius={86} strokeWidth={2}>
          {data.map((d) => (
            <Cell key={d.key} fill={`var(--color-${d.key})`} />
          ))}
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
