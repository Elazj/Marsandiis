'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Chip } from '@/components/ui'
import { Kpi } from '@/components/Kpi'
import Notices from '@/components/Notices'
import { CashFlowChart, SupplyLossChart, StatusDonut, StoreBars, TopBars } from '@/components/charts'
import { fmtT, level, q, sum, useLive } from '@/lib/data'
import { AdminDashboardDateRange, defaultAdminDashboardDateRange, localDateString, readAdminDashboardDateRange, subscribeAdminDashboardDateRange } from '@/lib/dashboardDate'
import { loadFinanceSummary } from '@/lib/finances'
import { money } from '@/lib/money'

export default function AdminDashboard() {
  const [selectedRange, setSelectedRange] = useState<AdminDashboardDateRange>({ start: '', end: '' })
  useEffect(() => {
    setSelectedRange(readAdminDashboardDateRange())
    return subscribeAdminDashboardDateRange(setSelectedRange)
  }, [])
  const range = selectedRange.start && selectedRange.end ? selectedRange : defaultAdminDashboardDateRange()
  const from = new Date(`${range.start}T00:00:00`).toISOString()
  const untilDate = new Date(`${range.end}T00:00:00`)
  untilDate.setDate(untilDate.getDate() + 1)
  const until = untilDate.toISOString()
  const { data: d, err } = useLive<any>(async (sb) => {
    const [bal, products, stores, open, reps, log, rows, losses, gifts] = await Promise.all([
      q(sb.from('supply_balance').select('*')), q(sb.from('products').select('*')), q(sb.from('stores').select('*')),
      (async () => {
        const { count, error } = await sb.from('reports').select('id', { count: 'exact', head: true }).eq('resolved', false).gte('created_at', from).lt('created_at', until)
        if (error) throw new Error(error.message)
        return count ?? 0
      })(),
      q(sb.from('reports').select('id, subject, resolved, created_at, profiles(full_name)').gte('created_at', from).lt('created_at', until).order('created_at', { ascending: false }).limit(4)),
      q(sb.from('activity_log').select('id, message, created_at, profiles(full_name)').gte('created_at', from).lt('created_at', until).order('created_at', { ascending: false }).limit(10)),
      q(sb.from('sheet_rows').select('quantity, created_at, supplies(products(name))').gte('created_at', from).lt('created_at', until)),
      q(sb.from('losses').select('quantity, kind, created_at').gte('created_at', from).lt('created_at', until)),
      q(sb.from('gifts').select('quantity, created_at').gte('created_at', from).lt('created_at', until)),
    ])
    return { bal, products, stores, open, reps, log, rows, losses, gifts }
  }, ['supplies', 'sheet_rows', 'losses', 'gifts', 'reports', 'activity_log', 'products', 'stores'], `admin-dashboard-${range.start}-${range.end}`, 5_000)
  const { data: finance, err: financeErr } = useLive(
    (sb) => loadFinanceSummary(sb, from, until),
    ['payments', 'salary_payments', 'misc_expenses', 'bank_deposits'],
    `admin-dashboard-finance-${range.start}-${range.end}`,
    5_000,
    false,
  )
  if (err) return <p className="err">{err}</p>
  if (!d) return <p className="mute">Loading…</p>

  const B: any[] = d.bal, P: any[] = d.products
  const sName = new Map<string, string>(d.stores.map((s: any) => [s.id, s.name]))
  const pName = new Map<string, string>(P.map((p: any) => [p.id, p.name]))
  const notInStore = sum(P, (p) => Number(p.net)) - sum(B, (b) => Number(b.assigned))
  const damagedOffload = sum(P, (p) => Number(p.damaged_offload))
  const damagedSupply = sum(d.losses.filter((l: any) => l.kind === 'damaged'), (l: any) => Number(l.quantity))
  const missingOffload = sum(P, (p) => Number(p.missing_before_offload))
  const missingSupply = sum(d.losses.filter((l: any) => l.kind === 'missing'), (l: any) => Number(l.quantity))
  const lost = damagedSupply + missingSupply
  const startLabel = new Date(`${range.start}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' })
  const endLabel = new Date(`${range.end}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' })
  const dateLabel = range.start === range.end ? startLabel : `${startLabel} to ${endLabel}`
  const chartDays: string[] = []
  const cursor = new Date(`${range.start}T12:00:00`)
  const lastDay = new Date(`${range.end}T12:00:00`)
  while (cursor <= lastDay) {
    chartDays.push(localDateString(cursor))
    cursor.setDate(cursor.getDate() + 1)
  }
  const dailyTotals = (events: any[]) => {
    const totals = new Map<string, number>()
    events.forEach((event) => {
      const day = localDateString(new Date(event.created_at))
      totals.set(day, (totals.get(day) ?? 0) + Number(event.quantity))
    })
    return chartDays.map((day) => totals.get(day) ?? 0)
  }
  const lv = B.map((b) => level(Number(b.assigned), Number(b.remaining)))
  const byStore = d.stores.map((s: any) => ({ name: s.name, u: sum(B.filter((b) => b.store_id === s.id), (b) => Number(b.remaining)) }))
  const sums = new Map<string, number>()
  d.rows.forEach((r: any) => { const n = r.supplies?.products?.name ?? ''; if (n) sums.set(n, (sums.get(n) ?? 0) + Number(r.quantity)) })
  const top = [...sums.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
  const need = B.filter((b, i) => lv[i] !== 'ok').sort((a, b) => a.remaining - b.remaining).slice(0, 6)

  return (<>
    <div className="hero">
      <div><h1>Dashboard</h1><p>Live overview of every store. Entries from store managers appear here automatically.</p></div>
      <div className="flex items-center gap-3"><span className="live-pill"><i />Live</span><Link href="/admin/finances" className="btn ghost sm">Open finances</Link></div>
    </div>
    {!d.stores.length || !B.length ? <div className="panel mb-4"><b>Get started.</b> <span className="mute">Add a store under Stores, create a product under Products, then add it to a store under Supplies.</span></div> : null}
    <Notices role="admin" />
    <div className="kpis">
      <Kpi icon="store" label="Active stores (current)" value={d.stores.filter((s: any) => s.active).length} />
      <Kpi icon="box" label="Products (current)" value={P.length} />
      <Kpi icon="clock" label="Not yet in a store (current)" value={notInStore} />
      <Kpi icon="layers" label="Units in stores (current)" value={sum(B, (b) => Number(b.assigned))} />
      <Kpi icon="send" label="Supplied in period" value={sum(d.rows, (r: any) => Number(r.quantity))} />
      <Kpi icon="gift" label="Gifted in period" value={sum(d.gifts, (g: any) => Number(g.quantity))} />
      <Kpi icon="alert" label="Damaged on offload" value={damagedOffload} tone={damagedOffload ? 'warn' : undefined} />
      <Kpi icon="alert" label="Damaged in supply (period)" value={damagedSupply} tone={damagedSupply ? 'warn' : undefined} />
      <Kpi icon="alert" label="Missing on offload" value={missingOffload} tone={missingOffload ? 'warn' : undefined} />
      <Kpi icon="alert" label="Missing in supply (period)" value={missingSupply} tone={missingSupply ? 'warn' : undefined} />
      <Kpi icon="alert" label="Damaged or missing (period)" value={lost} tone={lost ? 'warn' : undefined} />
      <Kpi icon="archive" label="Remaining in stores (current)" value={sum(B, (b) => Number(b.remaining))} />
      <Kpi icon="flag" label="Open reports in period" value={d.open} tone={d.open ? 'bad' : undefined} />
    </div>
    <section className="panel mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0">Finances: {dateLabel}</h2><p className="mute mb-0">Customer payments received, salaries paid, miscellaneous expenses and bank deposits in the selected period.</p></div><Link href="/admin/finances" className="btn ghost sm">Manage finances</Link></div>
      {financeErr ? <p className="err" role="alert">{financeErr}</p> : null}
      {!finance ? <p className="mute">Loading cash totals…</p> : <>
        <div className="content-grid">
          {(['GMD', 'XOF'] as const).map((currency) => {
            const value = finance.currencies[currency]
            return <div className="panel" key={currency}>
              <h2 className="mt-0">{currency} cash position</h2>
              <div className="wrap"><table><tbody>
                <tr><th>Cash in vault through {endLabel}</th><td className="n"><b>{money(value.cashInVault, currency)}</b></td></tr>
                <tr><th>Customer cash received (period)</th><td className="n">{money(value.received, currency)}</td></tr>
                <tr><th>Salaries paid</th><td className="n">{money(value.salaries, currency)}</td></tr>
                <tr><th>Miscellaneous expenses</th><td className="n">{money(value.expenses, currency)}</td></tr>
                <tr><th>Bank deposits (transfers)</th><td className="n">{money(value.deposits, currency)}</td></tr>
                <tr><th>Total outgoing (salaries and expenses)</th><td className="n"><b>{money(value.totalOutgoing, currency)}</b></td></tr>
                <tr><th>Total vault deductions (including deposits)</th><td className="n">{money(value.vaultOutgoing, currency)}</td></tr>
                <tr><th>Net cash flow for selected period</th><td className="n"><b>{money(value.netCashFlow, currency)}</b></td></tr>
              </tbody></table></div>
            </div>
          })}
        </div>
        <p className="note mb-0">Cash in vault is all customer cash received through the end date minus all active salary payments, expenses and bank deposits, including older records. Net cash flow covers only the selected period and excludes bank deposits because they are transfers, not business expenses. GMD and XOF are never added together.</p>
        <div className="content-grid mt-4">
          {(['GMD', 'XOF'] as const).map((currency) => <div className="panel" key={currency}>
            <h2>{currency} daily cash flow</h2>
            <CashFlowChart currency={currency} days={finance.daily.filter((row: { currency: string }) => row.currency === currency).sort((a: { day: string }, b: { day: string }) => a.day.localeCompare(b.day))} />
          </div>)}
        </div>
      </>}
    </section>
    <div className="content-grid wide">
      <div className="panel"><h2>Supplied, gifted and lost: {dateLabel}</h2>
        <SupplyLossChart labels={chartDays.map((day) => new Date(`${day}T12:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' }))} supplied={dailyTotals(d.rows)} gifted={dailyTotals(d.gifts)} lost={dailyTotals(d.losses)} /></div>
      <div className="panel"><h2>Stock health (current)</h2>
        <StatusDonut ok={lv.filter((x) => x === 'ok').length} low={lv.filter((x) => x === 'low').length} out={lv.filter((x) => x === 'out').length} /></div>
    </div>
    <div className="content-grid">
      <div className="panel"><h2>Remaining by store (current)</h2><StoreBars labels={byStore.map((x: any) => x.name)} values={byStore.map((x: any) => x.u)} /></div>
      <div className="panel"><h2>Top products supplied: {dateLabel}</h2><TopBars labels={top.map(([n]) => n)} values={top.map(([, v]) => v)} /></div>
    </div>
    <div className="content-grid">
      <div className="panel"><h2>Needs restocking</h2>
        {need.length ? <div className="wrap"><table><thead><tr><th>Store</th><th>Product</th><th className="n">Left</th><th /></tr></thead><tbody>
          {need.map((b) => <tr key={b.supply_id}><td>{sName.get(b.store_id)}</td><td>{pName.get(b.product_id)}</td><td className="n">{b.remaining}</td><td><Chip s={level(Number(b.assigned), Number(b.remaining))} /></td></tr>)}</tbody></table></div> : <p className="mute m-0">Nothing is low or finished.</p>}
      </div>
      <div className="panel"><h2>Reports on {dateLabel}</h2>
        {d.reps.length ? <div className="wrap"><table><thead><tr><th>From</th><th>Subject</th><th /></tr></thead><tbody>
          {d.reps.map((r: any) => <tr key={r.id}><td>{r.profiles?.full_name}</td><td>{r.subject}</td><td><span className={'chip' + (r.resolved ? '' : ' low')}>{r.resolved ? 'Resolved' : 'Open'}</span></td></tr>)}</tbody></table></div> : <p className="mute m-0">No reports from managers yet.</p>}
      </div>
    </div>
    <div className="panel"><h2>Activity on {dateLabel}</h2>
      {d.log.length ? <div className="wrap"><table><thead><tr><th>When</th><th>By</th><th>Activity</th></tr></thead><tbody>
      {d.log.map((l: any) => <tr key={l.id}><td>{fmtT(l.created_at)}</td><td>{l.profiles?.full_name}</td><td className="w">{l.message}</td></tr>)}</tbody></table></div> : <p className="mute m-0">No activity yet.</p>}
    </div>
  </>)
}
