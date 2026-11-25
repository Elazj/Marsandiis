'use client'
import { useState } from 'react'
import { downloadSheet, fmtT, loadSheet, q, useLive } from '@/lib/data'
import { Confirm, useSort } from '@/components/ui'
import InvoiceSearch from '@/components/InvoiceSearch'
import { StatusChip } from '@/components/sales/StatusChip'
import type { ManagerInvoiceItem } from '@/lib/sales'

type SheetInvoiceItem = Pick<ManagerInvoiceItem, 'invoice_item_id' | 'quantity_supplied' | 'quantity_pending' | 'supply_status'>

export function SheetTables({ rows, losses, gifts = [], invoiceItems, canUndo, onUndo }: { rows: any[]; losses: any[]; gifts?: any[]; invoiceItems?: SheetInvoiceItem[]; canUndo?: (row: any) => boolean; onUndo?: (row: any) => Promise<string> }) {
  const [undoing, setUndoing] = useState<any>(null)
  const invoiceMap = new Map((invoiceItems ?? []).map((item) => [item.invoice_item_id, item]))
  const s = useSort(rows, { date: (r) => r.created_at, customer: (r) => r.customer, ref: (r) => r.supply_ref, qty: (r) => Number(r.quantity) }, { k: 'date', d: -1 })
  return (<>
    <h2>Supplies to customers</h2>
    {rows.length ? (
      <div className="wrap"><table>
        <thead><tr>{s.th('date', 'Date')}{s.th('customer', 'Customer')}{s.th('ref', 'Sales / invoice number')}{s.th('qty', 'Qty', 'n')}{invoiceItems ? <th>Invoice supply</th> : null}<th>By</th>{canUndo && onUndo ? <th /> : null}</tr></thead>
        <tbody>{s.rows.map((r) => {
          const item = invoiceMap.get(r.invoice_item_id)
          return <tr key={r.id}><td>{fmtT(r.created_at)}</td><td>{r.customer}{r.pending ? <span className="chip low ml-2">Waiting to sync</span> : null}{r.conflict ? <span className="chip out ml-2">Needs a decision</span> : null}</td><td>{r.supply_ref}</td><td className="n">{r.quantity}</td>{invoiceItems ? <td>{item ? <><span className="block text-xs text-mute">{item.quantity_supplied} supplied · {item.quantity_pending} pending</span><StatusChip status={item.supply_status} /></> : <span className="text-xs text-mute">{r.invoice_item_id ? 'Invoice no longer available' : 'Legacy record · not linked'}</span>}</td> : null}<td>{r.profiles?.full_name ?? ''}</td>{canUndo && onUndo ? <td>{canUndo(r) ? <button className="btn ghost sm" onClick={() => setUndoing(r)}>Undo</button> : null}</td> : null}</tr>
        })}</tbody>
      </table></div>
    ) : <p className="mute m-0">Nothing recorded yet.</p>}
    {canUndo && onUndo ? <Confirm
      open={!!undoing}
      title="Undo supply record"
      text={undoing ? `Remove the record for ${undoing.customer} (${undoing.supply_ref})? Its quantity will be restored to the store${undoing.invoice_item_id ? ' and subtracted from the invoice supplied total' : ''}.` : ''}
      label="Undo record"
      onClose={() => setUndoing(null)}
      onConfirm={() => undoing ? onUndo(undoing) : Promise.resolve('No record selected.')}
    /> : null}
    <h2 className="mt-[18px]">Damaged and missing during supply</h2>
    {losses.length ? (
      <div className="wrap"><table>
        <thead><tr><th>Date</th><th>Type</th><th className="n">Qty</th><th>Note</th><th>By</th></tr></thead>
        <tbody>{losses.map((l) => <tr key={l.id}><td>{fmtT(l.created_at)}</td><td>{l.kind === 'damaged' ? 'Damaged' : 'Missing'}{l.pending ? <span className="chip low ml-2">Waiting to sync</span> : null}{l.conflict ? <span className="chip out ml-2">Needs a decision</span> : null}</td><td className="n">{l.quantity}</td><td className="w">{l.note ?? ''}</td><td>{l.profiles?.full_name ?? ''}</td></tr>)}</tbody>
      </table></div>
    ) : <p className="mute m-0">None recorded.</p>}
    <h2 className="mt-[18px]">Gifts</h2>
    {gifts.length ? (
      <div className="wrap"><table>
        <thead><tr><th>Date</th><th>Gifted to</th><th className="n">Qty</th><th>Note</th><th>By</th></tr></thead>
        <tbody>{gifts.map((g) => <tr key={g.id}><td>{fmtT(g.created_at)}</td><td>{g.recipient}{g.pending ? <span className="chip low ml-2">Waiting to sync</span> : null}{g.conflict ? <span className="chip out ml-2">Needs a decision</span> : null}</td><td className="n">{g.quantity}</td><td className="w">{g.note ?? ''}</td><td>{g.profiles?.full_name ?? ''}</td></tr>)}</tbody>
      </table></div>
    ) : <p className="mute m-0">No gifts recorded.</p>}
  </>)
}

// Read-only sheet for the admin, updating live as the manager records entries.
export function AdminSheet({ supplyId, onClose, onOpen }: { supplyId: string; onClose: () => void; onOpen: (supplyId: string) => void }) {
  const { data: d, err } = useLive(async (sb) => {
    const sheet = await loadSheet(sb, supplyId)
    const ids = [...new Set(sheet.rows.map((row: any) => row.invoice_item_id).filter(Boolean))] as string[]
    const linked = ids.length ? await q(sb.from('invoice_items').select('id, quantity_supplied, quantity_pending, supply_status').in('id', ids)) : []
    const invoiceItems = linked.map((item: any) => ({ invoice_item_id: item.id, quantity_supplied: Number(item.quantity_supplied), quantity_pending: Number(item.quantity_pending), supply_status: item.supply_status }))
    return { ...sheet, invoiceItems }
  }, ['sheet_rows', 'losses', 'supplies', 'invoice_items'])
  if (err) return <p className="err">{err}</p>
  if (!d) return <p className="mute">Loading…</p>
  const s = d.supply, b = d.bal, u = s.products.unit
  const invoiceMap = new Map<string, SheetInvoiceItem>(d.invoiceItems.map((item: SheetInvoiceItem) => [item.invoice_item_id, item]))
  const rows = d.rows.map((row: any) => {
    const item = invoiceMap.get(row.invoice_item_id)
    return item ? { ...row, invoice_supplied: item.quantity_supplied, invoice_pending: item.quantity_pending, invoice_status: item.supply_status } : row
  })
  return (<>
    <InvoiceSearch onOpen={onOpen} />
    <p className="mute mt-0">
      {s.sheet_started_at ? `Sheet started ${fmtT(s.sheet_started_at)}. ` : 'The store manager has not started a sheet yet. '}
      Assigned to store {s.quantity}, supplied {b.supplied}, gifted {b.gifted ?? 0}, damaged {b.damaged_in_supply}, missing {b.missing_in_supply}. <b>Remaining {b.remaining} {u}</b>
    </p>
    <SheetTables rows={rows} losses={d.losses} gifts={d.gifts} invoiceItems={d.invoiceItems} />
    <div className="mfoot"><button className="btn ghost" onClick={onClose}>Close</button><button className="btn" onClick={() => downloadSheet({ ...d, rows })}>Download CSV</button></div>
  </>)
}
