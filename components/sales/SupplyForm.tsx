'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui'
import { updateInvoiceSupply, type InvoiceItem } from '@/lib/sales'
import { StatusChip } from './StatusChip'

export function SupplyForm({ item, onClose, onSaved }: { item: InvoiceItem; onClose: () => void; onSaved: () => void }) {
  const [quantity, setQuantity] = useState(String(item.quantity_pending))
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const unit = item.products?.unit ?? ''

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    const value = Number(quantity)
    if (!(value > 0)) return setErr('Enter a quantity greater than zero.')
    if (value > Number(item.quantity_pending)) return setErr(`You can supply at most ${item.quantity_pending} ${unit}.`)
    setBusy(true)
    try {
      await updateInvoiceSupply(item.id, value, note)
      onSaved()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not update the supply.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title={`Record supply · ${item.products?.name ?? 'Product'}`} onClose={onClose}>
    <p className="mute mt-0">Enter the quantity being supplied now. It will be added to the quantity already supplied and cannot exceed the quantity sold.</p>
    <div className="calc"><span>Quantity sold</span><b>{item.quantity_sold} {unit}</b></div>
    <div className="calc"><span>Quantity supplied</span><b>{item.quantity_supplied} {unit}</b></div>
    <div className="calc neg"><span>Quantity pending</span><b>{item.quantity_pending} {unit}</b></div>
    <div className="mb-4"><StatusChip status={item.supply_status} /></div>
    <form onSubmit={submit}>
      <label>Quantity supplied now<input type="number" min="0" max={item.quantity_pending} step="any" value={quantity} onChange={(event) => setQuantity(event.target.value)} autoFocus required /></label>
      <label>Supply note (optional)<input value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || Number(item.quantity_pending) <= 0}>{busy ? 'Recording…' : 'Record supply'}</button></div>
    </form>
  </Modal>
}
