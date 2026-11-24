'use client'
import { Modal } from '@/components/ui'
import { fmtT } from '@/lib/data'
import { money } from '@/lib/money'
import type { CustomerRow, InvoiceSummary, PaymentRow, SalesCurrency } from '@/lib/sales'
import { StatusChip } from './StatusChip'

export function CustomerDetail({ customer, invoices, payments, onClose, onInvoice }: { customer: CustomerRow; invoices: InvoiceSummary[]; payments: PaymentRow[]; onClose: () => void; onInvoice: (id: string) => void }) {
  const rows = invoices.filter((invoice) => invoice.customer_id === customer.id)
  const ids = new Set(rows.map((invoice) => invoice.id))
  const history = payments.filter((payment) => ids.has(payment.invoice_id))
  const currencies: SalesCurrency[] = ['GMD', 'XOF']
  return <Modal open title={`Customer · ${customer.name}`} onClose={onClose} wide footerClose>
    <div className="grid gap-3 sm:grid-cols-3">
      {currencies.map((currency) => {
        const own = rows.filter((invoice) => invoice.currency === currency)
        return <div className="panel p-3" key={currency}>
          <h3 className="m-0 text-sm">{currency} balance</h3>
          <b className="mt-1 block text-lg">{money(own.reduce((sum, invoice) => sum + Number(invoice.outstanding), 0), currency)}</b>
          <span className="text-xs text-mute">Outstanding from {own.length} invoice{own.length === 1 ? '' : 's'}</span>
        </div>
      })}
    </div>
    <h3 className="mt-5 text-[15px]">Invoices and sales history</h3>
    <div className="wrap"><table><thead><tr><th>Invoice</th><th>Date</th><th className="n">Total</th><th className="n">Paid</th><th className="n">Outstanding</th><th>Payment</th><th>Supply</th><th /></tr></thead><tbody>
      {rows.map((invoice) => <tr key={invoice.id}><td><button className="linkbtn" onClick={() => onInvoice(invoice.id)}>{invoice.invoice_no}</button></td><td>{invoice.invoice_date}</td><td className="n">{money(invoice.total_amount, invoice.currency)}</td><td className="n">{money(invoice.amount_paid, invoice.currency)}</td><td className="n">{money(invoice.outstanding, invoice.currency)}</td><td><StatusChip status={invoice.payment_status} /></td><td><StatusChip status={invoice.supply_status} /></td><td><button className="btn ghost sm" onClick={() => onInvoice(invoice.id)}>Open</button></td></tr>)}
    </tbody></table></div>
    {!rows.length ? <p className="mute">No invoices for this customer.</p> : null}
    <h3 className="mt-5 text-[15px]">Payment history</h3>
    {history.length ? <div className="wrap"><table><thead><tr><th>Date</th><th>Invoice</th><th>Method</th><th className="n">Amount</th><th>Note</th></tr></thead><tbody>
      {history.map((payment) => {
        const invoice = rows.find((row) => row.id === payment.invoice_id)
        return <tr key={payment.id}><td>{fmtT(payment.paid_at)}</td><td>{invoice?.invoice_no}</td><td>{payment.method}</td><td className="n">{money(payment.amount, invoice?.currency ?? 'GMD')}</td><td>{payment.note || '—'}</td></tr>
      })}
    </tbody></table></div> : <p className="mute">No payments recorded.</p>}
  </Modal>
}
