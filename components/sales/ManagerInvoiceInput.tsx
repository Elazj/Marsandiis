'use client'
import { matchManagerInvoice, type ManagerInvoiceItem } from '@/lib/sales'
import { StatusChip } from './StatusChip'

export function ManagerInvoiceInput({ items, value, onChange, remaining, unit, loading, error }: {
  items: ManagerInvoiceItem[]
  value: string
  onChange: (reference: string) => void
  remaining: number
  unit: string
  loading: boolean
  error: string
}) {
  const selected = matchManagerInvoice(items, value)
  const entered = !!value.trim()

  return <>
    <label>Sales / invoice number
      <input value={value} maxLength={40} autoComplete="off" onChange={(event) => onChange(event.target.value)} placeholder="Enter the number created by the admin" required />
    </label>
    {error ? <p className="err" role="alert">{error}</p> : null}
    {loading && entered ? <p className="mute mt-0" role="status">Checking admin records…</p> : null}
    {!loading && !error && entered && !selected ? <p className="err" role="alert">Confirmed invoice/sales and enter again.</p> : null}
    {!loading && !error && !entered ? <p className="mute mt-0">Enter the sales or invoice number exactly as the admin recorded it.</p> : null}
    {selected ? <div className="note mb-4">
      <div className="flex items-center gap-2"><b className="text-acc">Verified</b><span className="text-sm text-mute">{selected.invoice_no} · {selected.customer_name}</span></div>
      <div className="calc"><span>Product sold</span><b>{selected.quantity_sold} {selected.unit}</b></div>
      <div className="calc"><span>Product supplied</span><b>{selected.quantity_supplied} {selected.unit}</b></div>
      <div className="calc neg"><span>Product pending</span><b>{selected.quantity_pending} {selected.unit}</b></div>
      <div className="calc"><span>Available for this entry</span><b>{Math.max(0, Math.min(remaining, Number(selected.quantity_pending)))} {unit}</b></div>
      <div className="mt-2 flex flex-wrap items-center gap-2"><span className="text-sm text-mute">Product:</span><StatusChip status={selected.supply_status} /></div>
      <div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-sm text-mute">Whole invoice:</span><StatusChip status={selected.invoice_status} /></div>
      <p className="mute mb-0 mt-2 text-xs">Whole invoice: {selected.invoice_quantity_supplied} supplied, {selected.invoice_quantity_pending} pending.</p>
    </div> : null}
  </>
}
