'use client'
import { useState } from 'react'
import { Confirm, Modal } from '@/components/ui'
import { friendly, fmtT, toast, useLive } from '@/lib/data'
import { cfaRateLabel, money } from '@/lib/money'
import { deleteSalesInvoice, loadInvoice, type CustomerRow, type ProductRow } from '@/lib/sales'
import { InvoiceForm } from './InvoiceForm'
import { PaymentForm } from './PaymentForm'
import { StatusChip } from './StatusChip'
import { SupplyForm } from './SupplyForm'

export function InvoiceDetail({ invoiceId, onClose, onChanged, onReceipt, products, customers }: { invoiceId: string; onClose: () => void; onChanged?: () => void; onReceipt: (receiptId: string) => void; products: ProductRow[]; customers: CustomerRow[] }) {
  const { data, err, reload } = useLive((sb) => loadInvoice(sb, invoiceId), ['invoice_summary', 'invoice_items', 'payments', 'invoice_supply_updates', 'receipts'], `sales-invoice-${invoiceId}`)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [supplyItem, setSupplyItem] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const invoice = data?.invoice
  const factor = invoice?.currency === 'XOF' ? invoice.exchange_rate : 1
  const item = data?.items.find((row) => row.id === supplyItem)
  const changed = () => { void reload(); onChanged?.() }

  return <>
    <Modal open title={invoice ? `Invoice ${invoice.invoice_no}` : 'Invoice details'} onClose={onClose} wide footerClose>
      {err ? <p className="err" role="alert">{err}</p> : null}
      {!data ? <p className="mute">Loading invoice…</p> : invoice ? <>
        <div className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><span className="text-xs text-mute">Customer</span><div><b>{invoice.customer_name}</b></div></div>
          <div><span className="text-xs text-mute">Invoice date</span><div><b>{new Date(`${invoice.invoice_date}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' })}</b></div></div>
          <div><span className="text-xs text-mute">Currency</span><div><b>{invoice.currency}</b>{invoice.currency === 'XOF' ? <span className="block text-xs text-mute">{cfaRateLabel(invoice.exchange_rate)}</span> : null}</div></div>
          <div><span className="text-xs text-mute">Recorded</span><div><b>{fmtT(invoice.created_at)}</b></div></div>
        </div>
        <div className="mb-3 mt-4 flex flex-wrap gap-2">
          <button className="btn ghost sm" onClick={() => setEditOpen(true)}>Edit invoice</button>
          <button className="btn danger sm" onClick={() => setDeleteOpen(true)}>Delete invoice</button>
        </div>
        {invoice.note ? <p className="note mt-4 mb-3">{invoice.note}</p> : null}

        <h3 className="mt-4 text-[15px]">Products and supply</h3>
        <div className="wrap"><table>
          <thead><tr><th>Product</th><th className="n">Sold</th><th className="n">Unit price</th><th className="n">Total</th><th className="n">Supplied</th><th className="n">Pending</th><th>Supply status</th><th /></tr></thead>
          <tbody>{data.items.map((row) => <tr key={row.id}>
            <td><b>{row.products?.name ?? 'Product'}</b><span className="block text-xs text-mute">{row.products?.container_no || row.products?.unit || ''}</span></td>
            <td className="n">{row.quantity_sold} {row.products?.unit ?? ''}</td>
            <td className="n">{money(Number(row.unit_price_gmd) * factor, invoice.currency)}</td>
            <td className="n">{money(Number(row.total_gmd) * factor, invoice.currency)}</td>
            <td className="n">{row.quantity_supplied}</td><td className="n">{row.quantity_pending}</td>
            <td><StatusChip status={row.supply_status} /></td>
            <td>{Number(row.quantity_pending) > 0 ? <button className="btn ghost sm" onClick={() => setSupplyItem(row.id)}>Record supply</button> : null}</td>
          </tr>)}</tbody>
        </table></div>
        <div className="mb-3 mt-2 flex flex-wrap items-center gap-2"><span className="text-sm text-mute">Overall supply status:</span><StatusChip status={invoice.supply_status} /></div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="min-w-0">
            <h3 className="text-[15px]">Payment summary</h3>
            <div className="calc"><span>Total invoice</span><b>{money(invoice.total_amount, invoice.currency)}</b></div>
            <div className="calc"><span>Amount paid</span><b>{money(invoice.amount_paid, invoice.currency)}</b></div>
            <div className="calc neg"><span>Outstanding</span><b>{money(invoice.outstanding, invoice.currency)}</b></div>
            <div className="mb-3 flex flex-wrap items-center gap-2"><StatusChip status={invoice.payment_status} />{invoice.outstanding > 0 ? <button className="btn sm" onClick={() => setPaymentOpen(true)}>Record payment</button> : null}</div>
            {data.payments.length ? <p className="m-0 text-xs">Payment methods: {[...new Set(data.payments.map((payment) => payment.method))].join(', ')}</p> : <p className="m-0 text-xs">No payment method recorded.</p>}
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px]">Receipts</h3>
            {data.receipts.length ? <div className="wrap"><table><thead><tr><th>Receipt</th><th>Type</th><th>Issued</th><th /></tr></thead><tbody>
              {data.receipts.map((receipt) => <tr key={receipt.id}><td><b>{receipt.receipt_no}</b></td><td>{receipt.kind}</td><td>{fmtT(receipt.issued_at)}</td><td><button className="btn ghost sm" onClick={() => onReceipt(receipt.id)}>Open / reprint</button></td></tr>)}
            </tbody></table></div> : <p className="mute m-0 text-sm">No receipts generated yet.</p>}
          </div>
        </div>

        <h3 className="mt-5 text-[15px]">Payment history</h3>
        {data.payments.length ? <div className="wrap"><table><thead><tr><th>Date</th><th>Method</th><th className="n">Amount received</th><th>Note</th><th /></tr></thead><tbody>
          {data.payments.map((payment) => {
            const receipt = data.receipts.find((row) => row.payment_id === payment.id)
            return <tr key={payment.id}><td>{fmtT(payment.paid_at)}</td><td>{payment.method}</td><td className="n">{money(payment.amount, invoice.currency)}</td><td>{payment.note || '—'}</td><td>{receipt ? <button className="btn ghost sm" onClick={() => onReceipt(receipt.id)}>Receipt</button> : null}</td></tr>
          })}
        </tbody></table></div> : <p className="mute">No payments recorded.</p>}

        <h3 className="mt-5 text-[15px]">Supply history</h3>
        {data.supplyUpdates.length ? <div className="wrap"><table><thead><tr><th>Date</th><th>Product</th><th className="n">Added</th><th className="n">Supplied after</th><th>By</th><th>Note</th></tr></thead><tbody>
          {data.supplyUpdates.map((update) => <tr key={update.id}><td>{fmtT(update.created_at)}</td><td>{data.items.find((row) => row.id === update.invoice_item_id)?.products?.name ?? 'Product'}</td><td className="n">{update.quantity}</td><td className="n">{update.supplied_after}</td><td>{update.profiles?.full_name ?? 'Admin'}</td><td>{update.note || '—'}</td></tr>)}
        </tbody></table></div> : <p className="mute">No supplies recorded.</p>}
      </> : null}
    </Modal>
    {paymentOpen && invoice ? <PaymentForm invoice={invoice} onClose={() => setPaymentOpen(false)} onSaved={() => { setPaymentOpen(false); changed(); toast('Payment recorded. Receipt generated.') }} /> : null}
    {item ? <SupplyForm item={item} onClose={() => setSupplyItem(null)} onSaved={() => { setSupplyItem(null); changed(); toast('Supply recorded') }} /> : null}
    {editOpen && invoice && data ? <InvoiceForm open invoice={invoice} invoiceItems={data.items} onClose={() => setEditOpen(false)} onSaved={() => { setEditOpen(false); changed(); toast('Invoice updated. Existing receipts are unchanged.') }} products={products} customers={customers} rate={invoice.exchange_rate} suggestedInvoiceNo={invoice.invoice_no} /> : null}
    <Confirm open={deleteOpen && !!invoice} title="Delete invoice" label="Delete invoice" onClose={() => setDeleteOpen(false)} text={invoice ? `Delete ${invoice.invoice_no} for ${invoice.customer_name}? Its products, payments, supply history and receipts will also be deleted. This cannot be undone.` : ''} onConfirm={async () => {
      if (!invoice) return 'Invoice not found.'
      try {
        await deleteSalesInvoice(invoice.id)
        onChanged?.()
        toast('Invoice deleted')
        onClose()
        return ''
      } catch (error) {
        return friendly(error instanceof Error ? error.message : 'Could not delete the invoice.')
      }
    }} />
  </>
}
