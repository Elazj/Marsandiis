'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui'
import { localDay } from '@/lib/data'
import { cfaRateLabel, money, type SalesCurrency } from '@/lib/money'
import { createSalesInvoice, PAYMENT_METHODS, updateSalesInvoice, type CustomerRow, type InvoiceItem, type InvoiceSummary, type NewInvoiceItem, type PaymentMethod, type ProductRow } from '@/lib/sales'

type Line = { key: string; id?: string; product_id: string; quantity: string; unit_price_gmd: string; supplied?: number }
const blankLine = (): Line => ({ key: crypto.randomUUID(), product_id: '', quantity: '1', unit_price_gmd: '' })
const stockText = (value: number) => Number(value.toFixed(3)).toLocaleString()

export function InvoiceForm({ open, onClose, onSaved, products, customers, rate, suggestedInvoiceNo, invoice, invoiceItems }: {
  open: boolean
  onClose: () => void
  onSaved: (id: string) => void
  products: ProductRow[]
  customers: CustomerRow[]
  rate: number
  suggestedInvoiceNo: string
  invoice?: InvoiceSummary
  invoiceItems?: InvoiceItem[]
}) {
  const editing = !!invoice
  const [invoiceNo, setInvoiceNo] = useState(invoice?.invoice_no ?? suggestedInvoiceNo)
  const [customer, setCustomer] = useState(invoice?.customer_name ?? '')
  const [date, setDate] = useState(invoice?.invoice_date ?? localDay(new Date()))
  const [currency, setCurrency] = useState<SalesCurrency>(invoice?.currency ?? 'GMD')
  const [lines, setLines] = useState<Line[]>(() => invoiceItems?.length ? invoiceItems.map((item) => ({
    key: item.id,
    id: item.id,
    product_id: item.product_id,
    quantity: String(item.quantity_sold),
    unit_price_gmd: String(item.unit_price_gmd),
    supplied: Number(item.quantity_supplied),
  })) : [blankLine()])
  const [paid, setPaid] = useState('0')
  const [method, setMethod] = useState<PaymentMethod | ''>('Cash')
  const [note, setNote] = useState(invoice?.note ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const factor = currency === 'XOF' ? rate : 1
  const totalGmd = useMemo(() => lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price_gmd) || 0), 0), [lines])
  const total = totalGmd * factor
  const initialPayment = editing ? 0 : Number(paid) || 0
  const originalItems = useMemo(() => new Map((invoiceItems ?? []).map((item) => [item.id, item])), [invoiceItems])

  function originalQuantity(line: Line, productId: string) {
    const original = line.id ? originalItems.get(line.id) : undefined
    return original?.product_id === productId ? Number(original.quantity_sold) || 0 : 0
  }

  function stockBeforeLine(line: Line, product?: ProductRow) {
    if (!product) return 0
    const original = originalQuantity(line, product.id)
    return Math.max(original, (Number(product.available) || 0) + original)
  }

  const stockExceeded = lines.some((line) => {
    const product = products.find((row) => row.id === line.product_id)
    return !!product && Number(line.quantity) > stockBeforeLine(line, product) + 0.000001
  })

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  }

  function pickProduct(key: string, productId: string) {
    const product = products.find((row) => row.id === productId)
    updateLine(key, { product_id: productId, unit_price_gmd: product ? String(product.default_unit_price_gmd || '') : '' })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    if (invoiceNo.trim().length < 2) return setErr('Enter a sales or invoice number.')
    if (customer.trim().length < 2) return setErr('Enter or select a customer name.')
    if (currency === 'XOF' && rate <= 0) return setErr('The saved exchange rate on this invoice is invalid.')
    const items: NewInvoiceItem[] = []
    for (const line of lines) {
      const quantity = Number(line.quantity)
      const price = Number(line.unit_price_gmd)
      const product = products.find((row) => row.id === line.product_id)
      if (!line.product_id || !product) return setErr('Choose a product for every invoice line.')
      if (!(quantity > 0)) return setErr('Every product needs a quantity above zero.')
      if (Number(line.supplied) > quantity) return setErr('Quantity sold cannot be less than the quantity already supplied.')
      const available = stockBeforeLine(line, product)
      if (quantity > available + 0.000001) return setErr(`Only ${available} ${product.unit} of ${product.name} is available for this sale. Add more stock in Products.`)
      if (!(price >= 0) || !isFinite(price)) return setErr('Every product needs a valid unit price.')
      if (items.some((item) => item.product_id === line.product_id)) return setErr('A product can appear only once on an invoice.')
      items.push({ ...(line.id ? { id: line.id } : {}), product_id: line.product_id, quantity, unit_price_gmd: price })
    }
    if (!items.length) return setErr('Add at least one product.')
    if (!editing && (initialPayment < 0 || initialPayment > total)) return setErr('The amount paid cannot be negative or exceed the invoice total.')
    if (editing && Number(invoice?.amount_paid) > total) return setErr('The edited invoice total cannot be less than the amount already paid.')
    if (!editing && initialPayment > 0 && !method) return setErr('Choose how the customer paid.')
    setBusy(true)
    try {
      let id = invoice?.id ?? ''
      if (invoice) {
        await updateSalesInvoice(invoice.id, { invoice_no: invoiceNo, customer_name: customer, invoice_date: date, items, note })
      } else {
        id = await createSalesInvoice({ invoice_no: invoiceNo, customer_name: customer, invoice_date: date, currency, items, initial_payment: initialPayment, payment_method: method, note })
      }
      onSaved(id)
    } catch (error) {
      setErr(error instanceof Error ? error.message : editing ? 'Could not update the invoice.' : 'Could not create the invoice.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open={open} title={editing ? 'Edit sale / invoice' : 'Create sale / invoice'} onClose={onClose} wide>
    <form onSubmit={submit}>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Sales / invoice number<input value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} maxLength={40} required />
          <span className="mt-1 block text-[11px] text-mute">Use a sales number for a cash sale paid in full. Use an invoice number when the customer will repay later.</span>
        </label>
        <label>Invoice date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label>
      </div>
      <label>Customer name<input list="sales-customers" value={customer} onChange={(event) => setCustomer(event.target.value)} maxLength={120} placeholder="Enter a new name or select an existing customer" required />
        <datalist id="sales-customers">{customers.map((row) => <option key={row.id} value={row.name} />)}</datalist>
      </label>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Transaction currency<select value={currency} disabled={editing} onChange={(event) => setCurrency(event.target.value as SalesCurrency)}><option value="GMD">GMD — Gambian Dalasi</option><option value="XOF">XOF — CFA Franc</option></select></label>
        <div className="note mt-1">{currency === 'XOF' ? `${cfaRateLabel(rate)}. ${editing ? 'The saved rate cannot be changed.' : 'This rate is saved on the invoice.'}` : 'Product prices are entered in GMD. The invoice total is in GMD.'}</div>
      </div>
      {editing ? <p className="note">Currency and exchange rate stay fixed so recorded payments keep their meaning. Existing receipts remain exactly as originally issued.</p> : null}

      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="m-0 text-[15px]">Invoice products</h3>
        <button type="button" className="btn ghost sm" onClick={() => setLines((rows) => [...rows, blankLine()])}>Add product</button>
      </div>
      <p className="note">Stock is reserved when the invoice is saved. When a product reaches zero, add more total stock in Products before selling it again.</p>
      {!products.length ? <p className="err">Create a product first, then return to record an invoice.</p> : null}
      <div className="flex flex-col gap-3">
        {lines.map((line, index) => {
          const product = products.find((row) => row.id === line.product_id)
          const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_price_gmd) || 0) * factor
          const supplied = Number(line.supplied) || 0
          const available = stockBeforeLine(line, product)
          const remaining = available - (Number(line.quantity) || 0)
          const overStock = !!product && remaining < -0.000001
          return <div key={line.key} className="rounded-xl border border-line bg-bg p-3">
            <div className="grid items-end gap-2 sm:grid-cols-[1.5fr_.7fr_1fr_auto]">
              <label className="m-0">Product<select value={line.product_id} disabled={supplied > 0} onChange={(event) => pickProduct(line.key, event.target.value)} required>
                <option value="">Choose product</option>{products.map((row) => {
                  const optionStock = stockBeforeLine(line, row)
                  return <option key={row.id} value={row.id} disabled={optionStock <= 0}>{row.name} ({row.unit}) — {optionStock > 0 ? `${stockText(optionStock)} available` : 'out of stock'}</option>
                })}
              </select></label>
              <label className="m-0">Quantity<input type="number" min={supplied > 0 ? supplied : 0} max={available} step="any" value={line.quantity} onChange={(event) => updateLine(line.key, { quantity: event.target.value })} required />
                {supplied > 0 ? <span className="mt-1 block text-[11px] text-mute">{supplied} already supplied</span> : null}
              </label>
              <label className="m-0">Unit price (GMD)<input type="number" min="0" step="any" value={line.unit_price_gmd} onChange={(event) => updateLine(line.key, { unit_price_gmd: event.target.value })} required />
                {currency === 'XOF' && line.unit_price_gmd !== '' ? <span className="mt-1 block text-[11px]">= {money(Number(line.unit_price_gmd) * factor, currency)}</span> : null}
              </label>
              <button type="button" className="btn ghost sm mb-0.5" disabled={lines.length === 1 || supplied > 0} onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))} aria-label={`Remove product line ${index + 1}`}>{supplied > 0 ? 'Supplied' : 'Remove'}</button>
            </div>
            {product ? <p className={`mt-2 mb-0 text-[11px] ${overStock ? 'text-bad' : 'text-mute'}`}>
              {overStock
                ? `Only ${stockText(available)} ${product.unit} available. Add more stock in Products.`
                : `${stockText(available)} ${product.unit} available · ${stockText(Math.max(0, remaining))} left after this sale`}
            </p> : null}
            <div className="mt-2 text-right text-sm"><span className="text-mute">Line total: </span><b>{money(lineTotal, currency)}</b></div>
          </div>
        })}
      </div>

      <div className="calc mt-4"><span>Invoice total</span><b>{money(total, currency)}</b></div>
      {editing ? <div className="note">Already paid: {money(invoice?.amount_paid ?? 0, currency)}. The corrected total cannot be lower than this amount.</div> : <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Amount paid now ({currency})<input type="number" min="0" step="any" value={paid} onChange={(event) => setPaid(event.target.value)} /></label>
        <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod | '')}><option value="">Not paid</option>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>}
      <label>Invoice note (optional)<textarea value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !products.length || stockExceeded}>{busy ? editing ? 'Saving…' : 'Creating…' : editing ? 'Save changes' : 'Create invoice'}</button></div>
    </form>
  </Modal>
}
