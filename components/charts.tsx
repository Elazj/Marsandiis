'use client'
import { useEffect, useId, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, LineChart, Pie, PieChart, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ChartContainer, ChartLegendContent, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { money, type SalesCurrency } from '@/lib/money'

type Colors = { acc: string; warn: string; bad: string; ink: string; mute: string; line: string; panel: string; font: string }
const GIFT = '#8B5CF6'
const FALLBACK: Colors = { acc: '#1673BB', warn: '#B76E00', bad: '#B3322B', ink: '#0F2A3D', mute: '#53708A', line: '#CDE2F2', panel: '#FFFFFF', font: 'system-ui, sans-serif' }

export const rgba = (hex: string, a: number) => {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function useColors(): Colors {
  const [c, setC] = useState<Colors>(FALLBACK)
  useEffect(() => {
    const read = () => {
      const s = getComputedStyle(document.documentElement)
      const g = (n: string, d: string) => s.getPropertyValue(n).trim() || d
      setC({ acc: g('--acc', FALLBACK.acc), warn: g('--warn', FALLBACK.warn), bad: g('--bad', FALLBACK.bad), ink: g('--ink', FALLBACK.ink), mute: g('--mute', FALLBACK.mute), line: g('--line', FALLBACK.line), panel: g('--panel', FALLBACK.panel), font: getComputedStyle(document.body).fontFamily || FALLBACK.font })
    }
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', read)
    return () => { mo.disconnect(); mq.removeEventListener('change', read) }
  }, [])
  return c
}

const Empty = ({ text }: { text: string }) => <p className="mute m-0">{text}</p>
const numberTick = { fontSize: 11 }

export function SupplyLossChart({ labels, supplied, lost, gifted }: { labels: string[]; supplied: number[]; lost: number[]; gifted?: number[] }) {
  const c = useColors()
  const id = useId().replace(/:/g, '')
  const data = labels.map((label, index) => ({ label, supplied: supplied[index] ?? 0, gifted: gifted?.[index] ?? 0, lost: lost[index] ?? 0 }))
  const config: ChartConfig = {
    supplied: { label: 'Supplied to customers', color: c.acc },
    gifted: { label: 'Gifted', color: GIFT },
    lost: { label: 'Damaged or missing', color: c.warn },
  }
  return <div className="chart">
    <ChartContainer config={config}>
      <AreaChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
        <defs>
          <linearGradient id={`supplied-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.acc} stopOpacity={0.32} /><stop offset="100%" stopColor={c.acc} stopOpacity={0} /></linearGradient>
          <linearGradient id={`gifted-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GIFT} stopOpacity={0.26} /><stop offset="100%" stopColor={GIFT} stopOpacity={0} /></linearGradient>
          <linearGradient id={`lost-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c.warn} stopOpacity={0.28} /><stop offset="100%" stopColor={c.warn} stopOpacity={0} /></linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={10} minTickGap={24} tick={{ fill: c.mute, ...numberTick }} />
        <YAxis axisLine={false} tickLine={false} width={42} allowDecimals={false} tick={{ fill: c.mute, ...numberTick }} />
        <Tooltip cursor={{ stroke: rgba(c.line, 0.9) }} content={<ChartTooltipContent />} />
        <Legend content={<ChartLegendContent />} />
        <Area type="monotone" dataKey="supplied" stroke={c.acc} strokeWidth={2.5} fill={`url(#supplied-${id})`} activeDot={{ r: 4, stroke: c.panel, strokeWidth: 2 }} />
        {gifted ? <Area type="monotone" dataKey="gifted" stroke={GIFT} strokeWidth={2.5} fill={`url(#gifted-${id})`} activeDot={{ r: 4, stroke: c.panel, strokeWidth: 2 }} /> : null}
        <Area type="monotone" dataKey="lost" stroke={c.warn} strokeWidth={2.5} fill={`url(#lost-${id})`} activeDot={{ r: 4, stroke: c.panel, strokeWidth: 2 }} />
      </AreaChart>
    </ChartContainer>
  </div>
}

type Tone = 'acc' | 'warn' | 'bad' | 'mute' | 'gift'
function Donut({ labels, values, tones, total, caption }: { labels: string[]; values: number[]; tones: Tone[]; total: number | string; caption: string }) {
  const c = useColors()
  const color = (t: Tone) => (t === 'mute' ? rgba(c.mute, 0.45) : t === 'gift' ? GIFT : c[t])
  const data = labels.map((name, index) => ({ name, value: values[index] ?? 0, fill: color(tones[index]) }))
  const config: ChartConfig = Object.fromEntries(labels.map((label, index) => [label, { label, color: color(tones[index]) }]))
  return <div className="chart sm relative">
    <ChartContainer config={config}>
      <PieChart margin={{ top: 8, right: 8, bottom: 30, left: 8 }}>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="88%" paddingAngle={3} cornerRadius={6} stroke={c.panel} strokeWidth={3}>
          {data.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}
        </Pie>
        <Tooltip content={<ChartTooltipContent hideLabel />} />
        <Legend content={<ChartLegendContent />} />
      </PieChart>
    </ChartContainer>
    <div className="pointer-events-none absolute inset-x-0 top-[41%] -translate-y-1/2 text-center">
      <b className="block text-[28px] leading-7 text-ink">{String(total)}</b><span className="text-xs text-mute">{caption}</span>
    </div>
  </div>
}

export function StatusDonut({ ok, low, out }: { ok: number; low: number; out: number }) {
  if (ok + low + out === 0) return <Empty text="Stock health appears once a store has a product." />
  return <Donut labels={['In stock', 'Low', 'Finished']} values={[ok, low, out]} tones={['acc', 'warn', 'bad']} total={ok + low + out} caption="items" />
}

export function StockSplit({ remaining, supplied, gifted = 0, damaged, missing }: { remaining: number; supplied: number; gifted?: number; damaged: number; missing: number }) {
  if (remaining + supplied + gifted + damaged + missing === 0) return <Empty text="Your stock breakdown appears once a product is assigned." />
  return <Donut labels={['Remaining', 'Supplied', 'Gifted', 'Damaged', 'Missing']} values={[remaining, supplied, gifted, damaged, missing]} tones={['acc', 'mute', 'gift', 'warn', 'bad']} total={remaining} caption="left in store" />
}

export function StoreBars({ labels, values }: { labels: string[]; values: number[] }) {
  const c = useColors()
  if (!labels.length) return <Empty text="No stores yet." />
  const data = labels.map((name, index) => ({ name, remaining: values[index] ?? 0 }))
  const config: ChartConfig = { remaining: { label: 'Remaining', color: c.acc } }
  return <div className="chart sm"><ChartContainer config={config}>
    <BarChart data={data} margin={{ top: 10, right: 12, left: -14, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} minTickGap={16} tick={{ fill: c.mute, ...numberTick }} />
      <YAxis axisLine={false} tickLine={false} width={42} allowDecimals={false} tick={{ fill: c.mute, ...numberTick }} />
      <Tooltip cursor={{ fill: rgba(c.acc, 0.06) }} content={<ChartTooltipContent />} />
      <Bar dataKey="remaining" fill={rgba(c.acc, 0.85)} activeBar={{ fill: c.acc }} radius={[10, 10, 0, 0]} maxBarSize={44} />
    </BarChart>
  </ChartContainer></div>
}

export function TopBars({ labels, values }: { labels: string[]; values: number[] }) {
  const c = useColors()
  if (!labels.length) return <Empty text="Customer supplies will rank here." />
  const data = labels.map((name, index) => ({ name, supplied: values[index] ?? 0 }))
  const config: ChartConfig = { supplied: { label: 'Supplied', color: c.acc } }
  return <div className="chart sm"><ChartContainer config={config}>
    <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
      <CartesianGrid horizontal={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
      <XAxis type="number" axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: c.mute, ...numberTick }} />
      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} width={118} interval={0} tick={{ fill: c.mute, ...numberTick }} />
      <Tooltip cursor={{ fill: rgba(c.acc, 0.06) }} content={<ChartTooltipContent />} />
      <Bar dataKey="supplied" fill={rgba(c.acc, 0.85)} activeBar={{ fill: c.acc }} radius={[0, 8, 8, 0]} maxBarSize={26} />
    </BarChart>
  </ChartContainer></div>
}

export function ForecastLines({ labels, actual, sma, ses }: { labels: string[]; actual: number[]; sma: (number | null)[]; ses: (number | null)[] }) {
  const c = useColors()
  const data = labels.map((label, index) => ({ label, actual: actual[index] ?? 0, sma: sma[index] ?? null, ses: ses[index] ?? null }))
  const config: ChartConfig = {
    actual: { label: 'Actual use', color: c.ink },
    sma: { label: 'Moving average', color: c.acc },
    ses: { label: 'Exponential smoothing', color: c.warn },
  }
  return <div className="chart"><ChartContainer config={config}>
    <LineChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={10} minTickGap={24} tick={{ fill: c.mute, ...numberTick }} />
      <YAxis axisLine={false} tickLine={false} width={42} allowDecimals={false} tick={{ fill: c.mute, ...numberTick }} />
      <Tooltip content={<ChartTooltipContent />} />
      <Legend content={<ChartLegendContent />} />
      <Line type="monotone" dataKey="actual" stroke={c.ink} strokeWidth={2} dot={false} connectNulls={false} />
      <Line type="monotone" dataKey="sma" stroke={c.acc} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false} />
      <Line type="monotone" dataKey="ses" stroke={c.warn} strokeWidth={2} strokeDasharray="2 3" dot={false} connectNulls={false} />
    </LineChart>
  </ChartContainer></div>
}

export function ProductStack({ labels, remaining, supplied, gifted, damaged, missing }: { labels: string[]; remaining: number[]; supplied: number[]; gifted?: number[]; damaged: number[]; missing: number[] }) {
  const c = useColors()
  if (!labels.length) return <Empty text="Products assigned to your store will appear here." />
  const data = labels.map((name, index) => ({
    name, remaining: remaining[index] ?? 0, supplied: supplied[index] ?? 0,
    gifted: gifted?.[index] ?? 0, damaged: damaged[index] ?? 0, missing: missing[index] ?? 0,
  }))
  const config: ChartConfig = {
    remaining: { label: 'Remaining', color: c.acc }, supplied: { label: 'Supplied', color: rgba(c.mute, 0.45) },
    gifted: { label: 'Gifted', color: GIFT }, damaged: { label: 'Damaged', color: c.warn }, missing: { label: 'Missing', color: c.bad },
  }
  return <div className="chart"><ChartContainer config={config}>
    <BarChart data={data} margin={{ top: 12, right: 12, left: -14, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
      <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={10} minTickGap={16} tick={{ fill: c.mute, ...numberTick }} />
      <YAxis axisLine={false} tickLine={false} width={42} allowDecimals={false} tick={{ fill: c.mute, ...numberTick }} />
      <Tooltip content={<ChartTooltipContent />} />
      <Legend content={<ChartLegendContent />} />
      <Bar dataKey="remaining" stackId="stock" fill={c.acc} maxBarSize={46} />
      <Bar dataKey="supplied" stackId="stock" fill={rgba(c.mute, 0.45)} maxBarSize={46} />
      {gifted ? <Bar dataKey="gifted" stackId="stock" fill={GIFT} maxBarSize={46} /> : null}
      <Bar dataKey="damaged" stackId="stock" fill={c.warn} radius={[6, 6, 0, 0]} maxBarSize={46} />
      <Bar dataKey="missing" stackId="stock" fill={c.bad} radius={[6, 6, 0, 0]} maxBarSize={46} />
    </BarChart>
  </ChartContainer></div>
}

export type CashFlowPoint = { day: string; received: number; salaries: number; expenses: number; netCashFlow: number }

export function CashFlowChart({ days, currency }: { days: CashFlowPoint[]; currency: SalesCurrency }) {
  const c = useColors()
  if (!days.length) return <Empty text="Cash flow appears once a finance date range is selected." />
  const data = days.map((row) => ({
    ...row,
    label: new Date(`${row.day}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }),
  }))
  const config: ChartConfig = {
    received: { label: 'Customer cash received', color: c.acc },
    salaries: { label: 'Salaries paid', color: c.warn },
    expenses: { label: 'Miscellaneous expenses', color: c.bad },
    netCashFlow: { label: 'Net cash flow (excl. deposits)', color: c.ink },
  }
  return <div className="chart"><ChartContainer config={config}>
    <ComposedChart data={data} margin={{ top: 12, right: 12, left: -4, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={rgba(c.line, 0.9)} strokeDasharray="3 3" />
      <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={10} minTickGap={24} tick={{ fill: c.mute, ...numberTick }} />
      <YAxis axisLine={false} tickLine={false} width={70} tick={{ fill: c.mute, ...numberTick }} tickFormatter={(value) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value))} />
      <Tooltip content={<ChartTooltipContent valueFormatter={(value) => money(value, currency)} />} />
      <Legend content={<ChartLegendContent />} />
      <Bar dataKey="received" fill={rgba(c.acc, 0.75)} radius={[5, 5, 0, 0]} maxBarSize={28} />
      <Bar dataKey="salaries" fill={rgba(c.warn, 0.8)} radius={[5, 5, 0, 0]} maxBarSize={28} />
      <Bar dataKey="expenses" fill={rgba(c.bad, 0.72)} radius={[5, 5, 0, 0]} maxBarSize={28} />
      <Line type="monotone" dataKey="netCashFlow" stroke={c.ink} strokeWidth={2.5} dot={false} activeDot={{ r: 4, stroke: c.panel, strokeWidth: 2 }} />
    </ComposedChart>
  </ChartContainer></div>
}
