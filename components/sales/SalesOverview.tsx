import { Kpi } from '@/components/Kpi'
import { money } from '@/lib/money'
import { calculateSalesMetrics, PAYMENT_METHODS, type SalesData } from '@/lib/sales'

export function SalesOverview({ data }: { data: SalesData }) {
  const m = calculateSalesMetrics(data.invoices, data.items, data.payments, data.customers.length)
  return <>
    <div className="kpis">
      <Kpi icon="reports" label="Total invoices" value={m.invoiceCount} />
      <Kpi icon="users" label="Customers" value={m.customerCount} />
      <Kpi icon="box" label="Products sold" value={m.productsSold} />
      <Kpi icon="layers" label="Quantities supplied" value={m.quantitySupplied} />
      <Kpi icon="clock" label="Quantities pending supply" value={m.quantityPending} tone={m.quantityPending ? 'warn' : undefined} />
      <Kpi icon="forecast" label="Sales revenue (GMD)" value={money(m.revenue.GMD, 'GMD')} />
      <Kpi icon="forecast" label="Sales revenue (XOF)" value={money(m.revenue.XOF, 'XOF')} />
      <Kpi icon="download" label="Amount received (GMD)" value={money(m.received.GMD, 'GMD')} />
      <Kpi icon="download" label="Amount received (XOF)" value={money(m.received.XOF, 'XOF')} />
      <Kpi icon="alert" label="Outstanding (GMD)" value={money(m.outstanding.GMD, 'GMD')} tone={m.outstanding.GMD ? 'bad' : undefined} />
      <Kpi icon="alert" label="Outstanding (XOF)" value={money(m.outstanding.XOF, 'XOF')} tone={m.outstanding.XOF ? 'bad' : undefined} />
    </div>
    <div className="content-grid">
      <div className="panel">
        <h2>Payments by method</h2>
        <div className="wrap"><table>
          <thead><tr><th>Method</th><th className="n">Payments</th><th className="n">GMD received</th><th className="n">XOF received</th></tr></thead>
          <tbody>{PAYMENT_METHODS.map((method) => <tr key={method}><td>{method}</td><td className="n">{m.byMethod[method].count}</td><td className="n">{money(m.byMethod[method].GMD, 'GMD')}</td><td className="n">{money(m.byMethod[method].XOF, 'XOF')}</td></tr>)}</tbody>
        </table></div>
      </div>
      <div className="panel">
        <h2>Invoice supply status</h2>
        <div className="kpis compact-kpis">
          <Kpi icon="check" label="Fully supplied" value={m.supply['Fully Supplied']} />
          <Kpi icon="clock" label="Partially supplied" value={m.supply['Partially Supplied']} tone="warn" />
          <Kpi icon="box" label="Pending" value={m.supply.Pending} tone="bad" />
        </div>
      </div>
    </div>
  </>
}
