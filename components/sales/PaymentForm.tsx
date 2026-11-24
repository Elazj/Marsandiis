'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui'
import { localDay } from '@/lib/data'
import { money } from '@/lib/money'
import { PAYMENT_METHODS, recordInvoicePayment, type InvoiceSummary, type PaymentMethod } from '@/lib/sales'

export function PaymentForm({ invoice, onClose, onSaved }: { invoice: InvoiceSummary; onClose: () => void; onSaved: (paymentId: string) => void }) {
  const [amount, setAmount] = useState(String(invoice.outstanding))
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [date, setDate] = useState(localDay(new Date()))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    const value = Number(amount)
    if (!(value > 0)) return setErr('Enter a payment greater than zero.')
    if (value > Number(invoice.outstanding)) return setErr(`The payment cannot exceed the outstanding balance of ${money(invoice.outstanding, invoice.currency)}.`)
    setBusy(true)
    try {
      const id = await recordInvoicePayment(invoice.id, value, method, date, note)
      onSaved(id)
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not record the payment.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title={`Record payment · ${invoice.invoice_no}`} onClose={onClose}>
    <div className="calc"><span>Total invoice</span><b>{money(invoice.total_amount, invoice.currency)}</b></div>
    <div className="calc"><span>Already paid</span><b>{money(invoice.amount_paid, invoice.currency)}</b></div>
    <div className="calc neg"><span>Outstanding balance</span><b>{money(invoice.outstanding, invoice.currency)}</b></div>
    <form onSubmit={submit}>
      <label>Amount received ({invoice.currency})<input type="number" min="0" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus required /></label>
      <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Payment date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      <label>Note (optional)<input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record payment'}</button></div>
    </form>
  </Modal>
}
