'use client'
import { useEffect, useMemo, useState } from 'react'
import { useSettings } from '@/components/SettingsProvider'
import { CustomerDetail } from '@/components/sales/CustomerDetail'
import { InvoiceDetail } from '@/components/sales/InvoiceDetail'
import { InvoiceForm } from '@/components/sales/InvoiceForm'
import { SalesOverview } from '@/components/sales/SalesOverview'
import { SalesReports } from '@/components/sales/SalesReports'
import { ReceiptViewer } from '@/components/sales/ReceiptViewer'
import { StatusChip } from '@/components/sales/StatusChip'
import { csv, download, localDay, toast, useLive } from '@/lib/data'
import { gmdPerCfaBlock, money } from '@/lib/money'
import { loadSales, PAYMENT_METHODS, type CustomerRow, type InvoiceSummary, type PaymentStatus, type SalesCurrency, type SupplyStatus } from '@/lib/sales'

type Tab = 'invoices' | 'customers' | 'reports'
const PAGE_SIZE = 25

export default function SalesPage() {
  const settings = useSettings()
  const { data, err, reload, fromCache } = useLive(loadSales, ['invoice_summary', 'invoice_items', 'payments', 'customers', 'products', 'receipts'], 'admin-sales', 5_000)
  const [tab, setTab] = useState<Tab>('invoices')
  const [search, setSearch] = useState('')
  const [currency, setCurrency] = useState<'all' | SalesCurrency>('all')
  const [paymentStatus, setPaymentStatus] = useState<'all' | PaymentStatus>('all')
  const [supplyStatus, setSupplyStatus] = useState<'all' | SupplyStatus>('all')
  const [method, setMethod] = useState<'all' | typeof PAYMENT_METHODS[number]>('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [invoiceId, setInvoiceId] = useState<string | null>(null)
  const [customer, setCustomer] = useState<CustomerRow | null>(null)
  const [receiptId, setReceiptId] = useState<string | null>(null)

  const productNames = useMemo(() => new Map((data?.items ?? []).map((item) => [item.invoice_id, (data?.items ?? []).filter((row) => row.invoice_id === item.invoice_id).map((row) => row.products?.name ?? '').join(' ')])), [data])
  const invoiceMethods = useMemo(() => {
    const methods = new Map<string, Set<typeof PAYMENT_METHODS[number]>>()
    for (const payment of data?.payments ?? []) {
      const own = methods.get(payment.invoice_id) ?? new Set()
      own.add(payment.method)
      methods.set(payment.invoice_id, own)
    }
    return methods
  }, [data])
  const filtered = useMemo(() => (data?.invoices ?? []).filter((invoice) => {
    const term = search.trim().toLowerCase()
    const matchesSearch = !term || invoice.invoice_no.toLowerCase().includes(term) || invoice.customer_name.toLowerCase().includes(term) || (productNames.get(invoice.id) ?? '').toLowerCase().includes(term)
    return matchesSearch
      && (currency === 'all' || invoice.currency === currency)
      && (paymentStatus === 'all' || invoice.payment_status === paymentStatus)
      && (supplyStatus === 'all' || invoice.supply_status === supplyStatus)
      && (method === 'all' || invoiceMethods.get(invoice.id)?.has(method))
      && (!from || invoice.invoice_date >= from)
      && (!to || invoice.invoice_date <= to)
  }), [data, search, currency, paymentStatus, supplyStatus, method, invoiceMethods, productNames, from, to])
  const ids = useMemo(() => new Set(filtered.map((invoice) => invoice.id)), [filtered])
  const filteredItems = useMemo(() => (data?.items ?? []).filter((item) => ids.has(item.invoice_id)), [data, ids])
  const filteredPayments = useMemo(() => (data?.payments ?? []).filter((payment) => ids.has(payment.invoice_id)), [data, ids])
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const suggested = useMemo(() => {
    const highest = (data?.invoices ?? []).reduce((max, invoice) => Math.max(max, Number(/(\d+)$/.exec(invoice.invoice_no)?.[1]) || 0), 0)
    return `INV-${String(highest + 1).padStart(6, '0')}`
  }, [data])
  const customerRows = useMemo(() => (data?.customers ?? []).map((row) => {
    const own = filtered.filter((invoice) => invoice.customer_id === row.id)
    return { customer: row, count: own.length, revenueGMD: own.filter((invoice) => invoice.currency === 'GMD').reduce((sum, invoice) => sum + Number(invoice.total_amount), 0), revenueXOF: own.filter((invoice) => invoice.currency === 'XOF').reduce((sum, invoice) => sum + Number(invoice.total_amount), 0), outstandingGMD: own.filter((invoice) => invoice.currency === 'GMD').reduce((sum, invoice) => sum + Number(invoice.outstanding), 0), outstandingXOF: own.filter((invoice) => invoice.currency === 'XOF').reduce((sum, invoice) => sum + Number(invoice.outstanding), 0) }
  }).filter((row) => row.count > 0).sort((a, b) => b.count - a.count), [data, filtered])

  useEffect(() => setPage(1), [search, currency, paymentStatus, supplyStatus, method, from, to])
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])

  function clearFilters() {
    setSearch(''); setCurrency('all'); setPaymentStatus('all'); setSupplyStatus('all'); setMethod('all'); setFrom(''); setTo('')
  }

  function exportInvoices() {
    download(`invoices-${localDay(new Date())}.csv`, csv([
      ['Invoice number', 'Customer', 'Date', 'Currency', 'GMD per 5000 CFA', 'Total', 'Amount paid', 'Outstanding', 'Payment status', 'Supply status', 'Payment methods'],
      ...filtered.map((invoice) => [invoice.invoice_no, invoice.customer_name, invoice.invoice_date, invoice.currency, invoice.currency === 'XOF' ? gmdPerCfaBlock(invoice.exchange_rate) : '', invoice.total_amount, invoice.amount_paid, invoice.outstanding, invoice.payment_status, invoice.supply_status, (data?.payments ?? []).filter((payment) => payment.invoice_id === invoice.id).map((payment) => payment.method).join(', ')]),
    ]))
  }

  if (err) return <p className="err" role="alert">{err}</p>
  if (!data) return <p className="mute">Loading sales…</p>

  return <>
    <div className="hero">
      <div><h1>Sales & Invoices</h1><p>Record customer sales, track supplies and payments, and reprint receipts. Financial and supply status update automatically.</p></div>
      <div className="flex items-center gap-3"><span className="live-pill"><i />{fromCache ? 'Syncing' : 'Live'}</span><button className="btn" onClick={() => setFormOpen(true)}>Create invoice</button></div>
    </div>
    <div className="panel sales-filters">
      <label className="m-0 sm:col-span-2">Search invoice, customer or product<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g., INV-000001 or customer name" /></label>
      <label className="m-0">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}><option value="all">All currencies</option><option value="GMD">GMD</option><option value="XOF">XOF</option></select></label>
      <label className="m-0">Payment status<select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as typeof paymentStatus)}><option value="all">All payment statuses</option><option>Paid</option><option>Partially Paid</option><option>Unpaid</option></select></label>
      <label className="m-0">Supply status<select value={supplyStatus} onChange={(event) => setSupplyStatus(event.target.value as typeof supplyStatus)}><option value="all">All supply statuses</option><option>Fully Supplied</option><option>Partially Supplied</option><option>Pending</option></select></label>
      <label className="m-0">Payment method<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="all">All methods</option>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="m-0">From date<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label className="m-0">To date<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      <div className="flex items-end"><button className="btn ghost sm" onClick={clearFilters}>Clear filters</button></div>
    </div>
    <SalesOverview data={data} />
    <div className="tabs" role="tablist" aria-label="Sales sections">
      <button role="tab" aria-selected={tab === 'invoices'} className={tab === 'invoices' ? 'on' : ''} onClick={() => setTab('invoices')}>Invoices</button>
      <button role="tab" aria-selected={tab === 'customers'} className={tab === 'customers' ? 'on' : ''} onClick={() => setTab('customers')}>Customers</button>
      <button role="tab" aria-selected={tab === 'reports'} className={tab === 'reports' ? 'on' : ''} onClick={() => setTab('reports')}>Reports</button>
    </div>

    {tab === 'invoices' ? <section className="panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="m-0">Recorded invoices</h2><button className="btn ghost sm" onClick={exportInvoices}>Export invoices (CSV)</button></div>
      <div className="wrap"><table><thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Products</th><th className="n">Total</th><th className="n">Paid</th><th className="n">Outstanding</th><th>Payment</th><th>Supply</th><th /></tr></thead><tbody>
        {visible.map((invoice) => <InvoiceRow key={invoice.id} invoice={invoice} itemCount={data.items.filter((item) => item.invoice_id === invoice.id).length} onOpen={() => setInvoiceId(invoice.id)} />)}
      </tbody></table></div>
      {!filtered.length ? <p className="mute mb-0">No invoices match these filters. Create the first invoice or clear the filters.</p> : null}
      <div className="mt-3 flex items-center justify-between gap-3 text-sm"><span className="text-mute">Showing {visible.length} of {filtered.length} invoices</span><div className="flex gap-2"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><button className="btn ghost sm" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section> : null}

    {tab === 'customers' ? <section className="panel">
      <h2>Customer sales and balances</h2>
      <div className="wrap"><table><thead><tr><th>Customer</th><th className="n">Invoices</th><th className="n">GMD sales</th><th className="n">XOF sales</th><th className="n">GMD outstanding</th><th className="n">XOF outstanding</th><th /></tr></thead><tbody>
        {customerRows.map((row) => <tr key={row.customer.id}><td><b>{row.customer.name}</b></td><td className="n">{row.count}</td><td className="n">{money(row.revenueGMD, 'GMD')}</td><td className="n">{money(row.revenueXOF, 'XOF')}</td><td className="n">{money(row.outstandingGMD, 'GMD')}</td><td className="n">{money(row.outstandingXOF, 'XOF')}</td><td><button className="btn ghost sm" onClick={() => setCustomer(row.customer)}>View history</button></td></tr>)}
      </tbody></table></div>{!customerRows.length ? <p className="mute mb-0">No customers match these filters.</p> : null}
    </section> : null}

    {tab === 'reports' ? <SalesReports invoices={filtered} items={filteredItems} payments={filteredPayments} customers={data.customers} /> : null}

    {formOpen ? <InvoiceForm open onClose={() => setFormOpen(false)} onSaved={(id) => { setFormOpen(false); setInvoiceId(id); void reload(); toast('Invoice created. Receipt generated.') }} products={data.products} customers={data.customers} rate={settings.gmdToXofRate} suggestedInvoiceNo={suggested} /> : null}
    {invoiceId ? <InvoiceDetail invoiceId={invoiceId} onClose={() => setInvoiceId(null)} onChanged={() => void reload()} onReceipt={setReceiptId} products={data.products} customers={data.customers} /> : null}
    {customer ? <CustomerDetail customer={customer} invoices={filtered} payments={filteredPayments} onClose={() => setCustomer(null)} onInvoice={(id) => { setCustomer(null); setInvoiceId(id) }} /> : null}
    {receiptId ? <ReceiptViewer receiptId={receiptId} onClose={() => setReceiptId(null)} /> : null}
  </>
}

function InvoiceRow({ invoice, itemCount, onOpen }: { invoice: InvoiceSummary; itemCount: number; onOpen: () => void }) {
  return <tr>
    <td><button className="linkbtn" onClick={onOpen}><b>{invoice.invoice_no}</b></button><span className="block text-xs text-mute">{invoice.currency}</span></td>
    <td>{invoice.customer_name}</td><td>{invoice.invoice_date}</td><td>{itemCount} product{itemCount === 1 ? '' : 's'}</td>
    <td className="n">{money(invoice.total_amount, invoice.currency)}</td><td className="n">{money(invoice.amount_paid, invoice.currency)}</td><td className="n">{money(invoice.outstanding, invoice.currency)}</td>
    <td><StatusChip status={invoice.payment_status} /></td><td><StatusChip status={invoice.supply_status} /></td><td><button className="btn ghost sm" onClick={onOpen}>Open</button></td>
  </tr>
}
