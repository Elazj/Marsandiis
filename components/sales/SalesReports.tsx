'use client'
import { csv, download, localDay } from '@/lib/data'
import { money } from '@/lib/money'
import { PAYMENT_METHODS, type CustomerRow, type InvoiceItem, type InvoiceSummary, type PaymentRow, type PaymentStatus, type SalesCurrency, type SupplyStatus } from '@/lib/sales'

export function SalesReports({ invoices, items, payments, customers }: { invoices: InvoiceSummary[]; items: InvoiceItem[]; payments: PaymentRow[]; customers: CustomerRow[] }) {
  const currencies: SalesCurrency[] = ['GMD', 'XOF']
  const paymentStatuses: PaymentStatus[] = ['Paid', 'Partially Paid', 'Unpaid']
  const supplyStatuses: SupplyStatus[] = ['Fully Supplied', 'Partially Supplied', 'Pending']
  const customerRows = customers.map((customer) => {
    const own = invoices.filter((invoice) => invoice.customer_id === customer.id)
    return {
      name: customer.name,
      count: own.length,
      GMD: own.filter((invoice) => invoice.currency === 'GMD').reduce((sum, invoice) => sum + Number(invoice.outstanding), 0),
      XOF: own.filter((invoice) => invoice.currency === 'XOF').reduce((sum, invoice) => sum + Number(invoice.outstanding), 0),
    }
  }).filter((row) => row.count > 0).sort((a, b) => (b.GMD + b.XOF) - (a.GMD + a.XOF))
  const productRows = [...new Map(items.map((item) => [item.product_id, { name: item.products?.name ?? 'Product', sold: 0, supplied: 0, pending: 0, GMD: 0, XOF: 0 }])).entries()].map(([id, row]) => {
    items.filter((item) => item.product_id === id).forEach((item) => {
      const invoice = invoices.find((row) => row.id === item.invoice_id)
      if (!invoice) return
      row.sold += Number(item.quantity_sold)
      row.supplied += Number(item.quantity_supplied)
      row.pending += Number(item.quantity_pending)
      row[invoice.currency] += Number(item.total_gmd) * (invoice.currency === 'XOF' ? Number(invoice.exchange_rate) : 1)
    })
    return row
  }).sort((a, b) => b.sold - a.sold)
  const currencyRows = currencies.map((currency) => {
    const own = invoices.filter((invoice) => invoice.currency === currency)
    return { currency, count: own.length, revenue: own.reduce((sum, invoice) => sum + Number(invoice.total_amount), 0), received: own.reduce((sum, invoice) => sum + Number(invoice.amount_paid), 0), outstanding: own.reduce((sum, invoice) => sum + Number(invoice.outstanding), 0) }
  })
  const methodRows = PAYMENT_METHODS.map((method) => {
    const own = payments.filter((payment) => payment.method === method)
    return { method, count: own.length, GMD: own.filter((payment) => invoices.find((invoice) => invoice.id === payment.invoice_id)?.currency === 'GMD').reduce((sum, payment) => sum + Number(payment.amount), 0), XOF: own.filter((payment) => invoices.find((invoice) => invoice.id === payment.invoice_id)?.currency === 'XOF').reduce((sum, payment) => sum + Number(payment.amount), 0) }
  })

  function exportReport() {
    const rows: (string | number)[][] = [
      ['Marsandiis sales report', new Date().toLocaleString()],
      [],
      ['Currency', 'Invoices', 'Revenue', 'Received', 'Outstanding'],
      ...currencyRows.map((row) => [row.currency, row.count, row.revenue, row.received, row.outstanding]),
      [],
      ['Outstanding by customer', 'Invoices', 'GMD', 'XOF'],
      ...customerRows.map((row) => [row.name, row.count, row.GMD, row.XOF]),
      [],
      ['Product', 'Quantity sold', 'Quantity supplied', 'Quantity pending', 'GMD sales', 'XOF sales'],
      ...productRows.map((row) => [row.name, row.sold, row.supplied, row.pending, row.GMD, row.XOF]),
      [],
      ['Payment method', 'Payments', 'GMD received', 'XOF received'],
      ...methodRows.map((row) => [row.method, row.count, row.GMD, row.XOF]),
      [],
      ['Payment status', 'Invoices'],
      ...paymentStatuses.map((status) => [status, invoices.filter((invoice) => invoice.payment_status === status).length]),
      [],
      ['Supply status', 'Invoices', 'Quantity pending'],
      ...supplyStatuses.map((status) => [status, invoices.filter((invoice) => invoice.supply_status === status).length, invoices.filter((invoice) => invoice.supply_status === status).reduce((sum, invoice) => sum + Number(invoice.quantity_pending), 0)]),
    ]
    download(`sales-report-${localDay(new Date())}.csv`, csv(rows))
  }

  return <section className="report-print-area">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="m-0">Sales and invoice report</h2><p className="mute mb-0 mt-1 text-[13px]">Based on the invoice filters above. GMD and XOF are kept separate.</p></div>
      <div className="btns"><button className="btn ghost sm" onClick={exportReport}>Export report (CSV)</button><button className="btn ghost sm" onClick={() => window.print()}>Print report</button></div>
    </div>
    <div className="content-grid">
      <div className="panel"><h2>Sales by currency</h2><div className="wrap"><table><thead><tr><th>Currency</th><th className="n">Invoices</th><th className="n">Revenue</th><th className="n">Received</th><th className="n">Outstanding</th></tr></thead><tbody>
        {currencyRows.map((row) => <tr key={row.currency}><td>{row.currency}</td><td className="n">{row.count}</td><td className="n">{money(row.revenue, row.currency)}</td><td className="n">{money(row.received, row.currency)}</td><td className="n">{money(row.outstanding, row.currency)}</td></tr>)}
      </tbody></table></div></div>
      <div className="panel"><h2>Invoice status</h2><div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="text-sm">Payment</h3><table><tbody>{paymentStatuses.map((status) => <tr key={status}><td>{status}</td><td className="n">{invoices.filter((invoice) => invoice.payment_status === status).length}</td></tr>)}</tbody></table></div>
        <div><h3 className="text-sm">Supply</h3><table><tbody>{supplyStatuses.map((status) => <tr key={status}><td>{status}</td><td className="n">{invoices.filter((invoice) => invoice.supply_status === status).length}</td></tr>)}</tbody></table></div>
      </div></div>
    </div>
    <div className="content-grid">
      <div className="panel"><h2>Outstanding customer balances</h2><div className="wrap"><table><thead><tr><th>Customer</th><th className="n">Invoices</th><th className="n">GMD outstanding</th><th className="n">XOF outstanding</th></tr></thead><tbody>
        {customerRows.map((row) => <tr key={row.name}><td>{row.name}</td><td className="n">{row.count}</td><td className="n">{money(row.GMD, 'GMD')}</td><td className="n">{money(row.XOF, 'XOF')}</td></tr>)}
      </tbody></table></div>{!customerRows.length ? <p className="mute m-0">No matching invoices.</p> : null}</div>
      <div className="panel"><h2>Payments by method</h2><div className="wrap"><table><thead><tr><th>Method</th><th className="n">Payments</th><th className="n">GMD</th><th className="n">XOF</th></tr></thead><tbody>
        {methodRows.map((row) => <tr key={row.method}><td>{row.method}</td><td className="n">{row.count}</td><td className="n">{money(row.GMD, 'GMD')}</td><td className="n">{money(row.XOF, 'XOF')}</td></tr>)}
      </tbody></table></div></div>
    </div>
    <div className="panel"><h2>Sales and pending quantities by product</h2><div className="wrap"><table><thead><tr><th>Product</th><th className="n">Sold</th><th className="n">Supplied</th><th className="n">Pending</th><th className="n">GMD sales</th><th className="n">XOF sales</th></tr></thead><tbody>
      {productRows.map((row) => <tr key={row.name}><td>{row.name}</td><td className="n">{row.sold}</td><td className="n">{row.supplied}</td><td className="n">{row.pending}</td><td className="n">{money(row.GMD, 'GMD')}</td><td className="n">{money(row.XOF, 'XOF')}</td></tr>)}
    </tbody></table></div>{!productRows.length ? <p className="mute m-0">No matching products.</p> : null}</div>
  </section>
}
