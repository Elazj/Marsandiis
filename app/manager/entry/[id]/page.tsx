'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Hd } from '@/components/ui'
import { useSettings } from '@/components/SettingsProvider'
import { SheetTables } from '@/components/Sheet'
import { downloadSheet, fmtT, friendly, loadSheet, logAct, qn, SHEET_LIVE, toast, useLive } from '@/lib/data'
import { insertEntry, recordOrQueue } from '@/lib/offline/record'
import { discardItem, overlaySheet } from '@/lib/offline/sync'
import { useOnline, useOutbox } from '@/lib/offline/useOutbox'
import { supabaseBrowser } from '@/lib/supabase/client'

export default function SheetPage() {
  const { allowGifts } = useSettings() // the admin can turn gifts off in Inventory Configuration
  const { id } = useParams<{ id: string }>()
  const online = useOnline()
  const { items } = useOutbox(id)
  const { data: raw, err, reload } = useLive(async (sb) => loadSheet(sb, id), SHEET_LIVE)
  const [userId, setUserId] = useState('')
  const [userError, setUserError] = useState('')
  const [r, setR] = useState({ cust: '', ref: '', qty: '' })
  const [l, setL] = useState({ kind: 'damaged' as 'damaged' | 'missing', qty: '', note: '' })
  const [re, setRe] = useState('')
  const [le, setLe] = useState('')
  const [g, setG] = useState({ to: '', qty: '', note: '' })
  const [ge, setGe] = useState('')
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const { data, error } = await supabaseBrowser().auth.getUser()
        if (!active) return
        if (error) setUserError(friendly(error.message))
        else setUserId(data.user?.id ?? '')
      } catch (error) {
        if (active) setUserError(error instanceof Error ? error.message : 'Could not verify your account.')
      }
    })()
    return () => { active = false }
  }, [])
  if (err) return <div><p className="err">{err}</p><Link href="/manager/entry">Back to sheets</Link></div>
  if (!raw) return <p className="mute">Loading…</p>
  const d = overlaySheet(raw, items)
  const s = d.supply, b = d.bal, p = s.products, rem = Number(b.remaining)

  async function start() {
    const hit = await recordOrQueue({
      kind: 'start_sheet', supplyId: id, log: `Created the sheet for ${p.name}`, payload: { productName: p.name },
    }, () => supabaseBrowser().rpc('start_sheet', { p_supply: id }))
    if (!hit.ok) return toast(hit.message)
    if (!hit.queued) await logAct(`Created the sheet for ${p.name}`)
    else toast('Saved on this device. It will sync when you are back online.')
    reload()
  }
  async function addRow() {
    const qty = qn(r.qty), cust = r.cust.trim(), ref = r.ref.trim()
    if (!cust || !ref) return setRe('Enter the customer name and the supply ID.')
    if (!qty) return setRe('Enter a quantity above zero.')
    if (qty > rem) return setRe(`Only ${rem} ${p.unit} left in the store.`)
    setRe('')
    const clientId = crypto.randomUUID()
    const hit = await recordOrQueue({
      id: clientId, kind: 'sheet_row', supplyId: id, log: `${p.name}: supplied ${qty} ${p.unit} to ${cust} (${ref}) from ${s.stores?.name ?? 'the store'}`,
      payload: { customer: cust, supply_ref: ref, quantity: qty, productName: p.name },
    }, () => insertEntry('sheet_rows', { supply_id: id, customer: cust, supply_ref: ref, quantity: qty, client_id: clientId }))
    if (!hit.ok) return setRe(hit.message)
    if (hit.queued) toast('Saved on this device. It will sync when you are back online.')
    else { await logAct(`${p.name}: supplied ${qty} ${p.unit} to ${cust} (${ref}) from ${s.stores?.name ?? 'the store'}`); toast('Added to the sheet') }
    setR({ cust: '', ref: '', qty: '' }); reload()
  }
  async function addLoss() {
    const qty = qn(l.qty)
    if (!qty) return setLe('Enter a quantity above zero.')
    if (qty > rem) return setLe(`Only ${rem} ${p.unit} left in the store.`)
    setLe('')
    const clientId = crypto.randomUUID()
    const hit = await recordOrQueue({
      id: clientId, kind: 'loss', supplyId: id, log: `${p.name}: ${qty} ${p.unit} ${l.kind === 'damaged' ? 'damaged' : 'missing'} during supply at ${s.stores?.name ?? 'the store'}`,
      payload: { lossKind: l.kind, quantity: qty, note: l.note.trim(), productName: p.name },
    }, () => insertEntry('losses', { supply_id: id, kind: l.kind, quantity: qty, note: l.note.trim() || null, client_id: clientId }))
    if (!hit.ok) return setLe(hit.message)
    if (hit.queued) toast('Saved on this device. It will sync when you are back online.')
    else { await logAct(`${p.name}: ${qty} ${p.unit} ${l.kind === 'damaged' ? 'damaged' : 'missing'} during supply at ${s.stores?.name ?? 'the store'}`); toast('Recorded') }
    setL({ kind: l.kind, qty: '', note: '' }); reload()
  }
  async function addGift() {
    const qty = qn(g.qty), to = g.to.trim(), note = g.note.trim()
    if (!to) return setGe('Enter who the gift was given to.')
    if (!qty) return setGe('Enter a quantity above zero.')
    if (qty > rem) return setGe(`Only ${rem} ${p.unit} left in the store.`)
    setGe('')
    const clientId = crypto.randomUUID()
    const log = `${p.name}: gifted ${qty} ${p.unit} to ${to} from ${s.stores?.name ?? 'the store'}`
    const hit = await recordOrQueue({
      id: clientId, kind: 'gift', supplyId: id, log,
      payload: { recipient: to, quantity: qty, note, productName: p.name },
    }, () => insertEntry('gifts', { supply_id: id, recipient: to, quantity: qty, note: note || null, client_id: clientId }))
    if (!hit.ok) return setGe(hit.message)
    if (hit.queued) toast('Saved on this device. It will sync when you are back online.')
    else { await logAct(log); toast('Gift recorded') }
    setG({ to: '', qty: '', note: '' }); reload()
  }
  function canUndoRow(row: any) {
    if (row.pending || row.conflict) return items.some((item) => item.id === row.id && item.kind === 'sheet_row' && item.byId === userId && item.status !== 'syncing')
    return !!userId && row.entered_by === userId
  }
  async function undoRow(row: any) {
    if (row.pending || row.conflict) {
      const item = items.find((pending) => pending.id === row.id && pending.kind === 'sheet_row' && pending.byId === userId && pending.status !== 'syncing')
      if (!item) return 'This pending record does not belong to your account.'
      await discardItem(row.id)
    } else {
      if (!userId) return userError || 'Could not verify your account.'
      const sb = supabaseBrowser()
      const { data: existing, error: lookupError } = await sb.from('sheet_rows').select('id')
        .eq('id', row.id).eq('entered_by', userId).maybeSingle()
      if (lookupError) return friendly(lookupError.message)
      if (!existing) return 'This record is no longer available to undo.'
      const { data, error } = await sb.from('sheet_rows').delete()
        .eq('id', row.id).eq('entered_by', userId).select('id').maybeSingle()
      if (error) return friendly(error.message)
      if (!data) return 'The database did not allow this undo. If this is an existing database, run supabase/migration-016.sql in the Supabase SQL editor, then try again.'
      await logAct(`Undid supply record ${row.supply_ref} for ${row.customer}`)
    }
    reload()
    toast('Record undone and quantity restored.')
    return ''
  }

  return (<>
    <Hd title={`Sheet: ${p.name}`} sub={`${s.stores?.name ?? 'Your store'}${s.sheet_started_at ? ', started ' + fmtT(s.sheet_started_at) : ''}${online ? '' : ' · offline'}`}>
      <Link className="btn ghost sm no-underline" href="/manager/entry">All sheets</Link>
      <Link className="btn ghost sm no-underline" href={`/manager/scan?supply=${id}`}>Scan out</Link>
      {s.sheet_started_at ? <button className="btn sm" onClick={() => downloadSheet(d)}>Download sheet</button> : null}
    </Hd>
    <div className="panel strip">
      {([[b.assigned, 'Assigned to this store'], [b.supplied, 'Supplied to customers'], [b.gifted ?? 0, 'Gifted'], [b.damaged_in_supply, 'Damaged in supply'], [b.missing_in_supply, 'Missing in supply'], [b.remaining, 'Remaining in store']] as [number, string][]).map(([v, t]) => <div key={t}><b>{v}</b><span>{t}</span></div>)}
    </div>
    {!s.sheet_started_at ? (
      <div className="panel"><p className="mt-0">This sheet has not been created yet.</p><button className="btn sm" onClick={start}>Create sheet</button></div>
    ) : (<>
      <div className="content-grid">
        <div className="panel"><h2>Record a supply</h2>
          {!online ? <p className="mute mt-0">You are offline. This entry stays on this device and sends later. If the store no longer has enough stock, you will be asked what to do.</p> : null}
          <label>Customer name<input value={r.cust} maxLength={80} onChange={(e) => setR({ ...r, cust: e.target.value })} placeholder="e.g., Alex Johnson" /></label>
          <label>Supply ID (invoice or sales number)<input value={r.ref} maxLength={40} onChange={(e) => setR({ ...r, ref: e.target.value })} placeholder="e.g., INV-1003" /></label>
          <label>Quantity supplied ({p.unit})<input type="number" min="0" step="any" value={r.qty} onChange={(e) => setR({ ...r, qty: e.target.value })} placeholder="e.g., 10" /></label>
          <p className="err" role="alert">{re}</p><button className="btn" onClick={addRow}>Add to sheet</button></div>
        <div className="panel"><h2>Record damaged or missing</h2>
          <label>Type<select value={l.kind} onChange={(e) => setL({ ...l, kind: e.target.value as 'damaged' | 'missing' })}><option value="damaged">Damaged during supply</option><option value="missing">Missing during supply</option></select></label>
          <label>Quantity ({p.unit})<input type="number" min="0" step="any" value={l.qty} onChange={(e) => setL({ ...l, qty: e.target.value })} placeholder="e.g., 1" /></label>
          <label>Note (optional)<input value={l.note} maxLength={120} onChange={(e) => setL({ ...l, note: e.target.value })} placeholder="Add a brief note" /></label>
          <p className="err" role="alert">{le}</p><button className="btn" onClick={addLoss}>Record</button></div>
        {allowGifts ? <div className="panel"><h2>Record a gift</h2>
          <p className="mute mt-0">For products you give away instead of selling. A gift is taken off the stock left in the store.</p>
          <label>Gifted to (name)<input value={g.to} maxLength={80} onChange={(e) => setG({ ...g, to: e.target.value })} placeholder="e.g., Alex Johnson" /></label>
          <label>Quantity gifted ({p.unit})<input type="number" min="0" step="any" value={g.qty} onChange={(e) => setG({ ...g, qty: e.target.value })} placeholder="e.g., 1" /></label>
          <label>Note (optional)<input value={g.note} maxLength={120} onChange={(e) => setG({ ...g, note: e.target.value })} placeholder="Add a brief note" /></label>
          <p className="err" role="alert">{ge}</p><button className="btn" onClick={addGift}>Record gift</button></div> : null}
      </div>
      <div className="panel">
        {userError ? <p className="err" role="alert">{userError}</p> : null}
        <SheetTables rows={d.rows} losses={d.losses} gifts={d.gifts} canUndo={canUndoRow} onUndo={undoRow} />
      </div>
    </>)}
  </>)
}
