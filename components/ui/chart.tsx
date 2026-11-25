'use client'
import * as React from 'react'
import * as RechartsPrimitive from 'recharts'
import { cx } from '@/lib/tw'

export type ChartConfig = Record<string, { label?: string; color?: string }>
type ChartContextValue = { config: ChartConfig }

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function useChart() {
  const context = React.useContext(ChartContext)
  if (!context) throw new Error('useChart must be used inside <ChartContainer>.')
  return context
}

export function ChartContainer({ config, children, className }: {
  config: ChartConfig
  children: React.ReactElement
  className?: string
}) {
  const id = React.useId().replace(/:/g, '')
  const style = Object.fromEntries(
    Object.entries(config).map(([key, value]) => [`--color-${key}`, value.color ?? 'currentColor']),
  ) as React.CSSProperties
  return <ChartContext.Provider value={{ config }}>
    <div data-chart={id} className={cx('relative h-full w-full', className)} style={style}>
      <RechartsPrimitive.ResponsiveContainer width="100%" height="100%">
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  </ChartContext.Provider>
}

export function ChartTooltipContent({ active, payload, label, hideLabel = false, valueFormatter }: {
  active?: boolean
  payload?: any[]
  label?: any
  hideLabel?: boolean
  valueFormatter?: (value: number | string, name: string) => React.ReactNode
}) {
  const { config } = useChart()
  if (!active || !payload?.length) return null
  const labelKey = Object.keys(config).find((key) => config[key]?.label === label)
  const tooltipLabel = labelKey ? config[labelKey]?.label : label
  return <div className="min-w-40 rounded-xl border border-line bg-panel p-3 text-xs shadow-panel">
    {!hideLabel && tooltipLabel != null && tooltipLabel !== '' ? <div className="mb-2 font-semibold text-ink">{String(tooltipLabel)}</div> : null}
    <div className="flex flex-col gap-1.5">
      {payload.map((item, index) => {
        const key = String(item.dataKey ?? item.name ?? index)
        const itemConfig = config[key]
        const color = item.color ?? item.payload?.fill ?? `var(--color-${key})`
        const name = itemConfig?.label ?? String(item.name ?? key)
        return <div key={`${key}-${index}`} className="flex items-center justify-between gap-5">
          <span className="flex items-center gap-2 text-mute"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{name}</span>
          <b className="font-semibold text-ink">{valueFormatter ? valueFormatter(item.value, name) : String(item.value ?? 0)}</b>
        </div>
      })}
    </div>
  </div>
}

export function ChartLegendContent({ payload }: { payload?: any[] }) {
  const { config } = useChart()
  if (!payload?.length) return null
  return <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 pt-3 text-xs text-mute">
    {payload.map((item, index) => {
      const key = String(item.dataKey ?? item.value ?? index)
      const itemConfig = config[key]
      const color = item.color ?? `var(--color-${key})`
      return <span key={`${key}-${index}`} className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />{itemConfig?.label ?? item.value}</span>
    })}
  </div>
}
