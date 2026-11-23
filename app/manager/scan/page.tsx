'use client'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import ScanCamera from '@/components/ScanCamera'
import { Icon } from '@/components/icons'
import { Confirm, Hd } from '@/components/ui'
import { logAct, q, qn, toast, useLive } from '@/lib/data'
import { insertEntry, recordOrQueue } from '@/lib/offline/record'
import { heldQty } from '@/lib/offline/sync'
import { useOnline, useOutbox } from '@/lib/offline/useOutbox'
import { supabaseBrowser } from '@/lib/supabase/client'
import { cx } from '@/lib/tw'

type Scan = { n: number; code: string; at: number }

export default function Page() {
  return <Suspense fallback={<p className="mute">Loading…</p>}><ScanOut /></Suspense>
}

function ScanOut() {
  const preset = useSearchParams().get('supply') ?? ''
  const online = useOnline()
  const { items } = useOutbox()
  const { data: d, err, reload } = useLive<any>(async (sb) => {
    const supplies = await q(sb.from('supplies').select('id, quantity, sheet_started_at, products(*), stores(name)'))
    const bal = await q(sb.from('supply_balance').select('*'))
    let barcodeReady = true
    try { await q(sb.from('products').select('barcode').limit(1)) } catch { barcodeReady = false }
    return { supplies, bal, barcodeReady }
  }, ['supplies', 'sheet_rows', 'losses', 'gifts', 'products'])

  const [phase, setPhase] = useState<'setup' | 'scan' | 'done'>('setup')
  const [supplyId, setSupplyId] = useState(preset)
  const [cust, setCust] = useState('')
  const [ref, setRef] = useState('')
  const [target, setTarget] = useState('')
  const [goal, setGoal] = useState(0)
  const [count, setCount] = useState(0)
  const [scans, setScans] = useState<Scan[]>([])
  const [manual, setManual] = useState('')
  const [msg, setMsg] = useState('')
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null)
  const [sound, setSound] = useState(true)
  const [busy, setBusy] = useState(false)
  const [askPartial, setAskPartial] = useState(false)
  const [askCancel, setAskCancel] = useState(false)
  const [done, setDone] = useState<{ count: number; cust: string; ref: string; queued: boolean; at: string } | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)
  const flashTimer = useRef(0)
  const audioRef = useRef<AudioContext | null>(null)
  const soundRef = useRef(sound); soundRef.current = sound

  useEffect(() => { setSound(localStorage.getItem('stockroom-scan-sound') !== '0') }, [])
  useEffect(() => () => { window.clearTimeout(flashTimer.current); void audioRef.current?.close().catch(() => {}) }, [])

  const beep = useCallback((kind: 'ok' | 'done' | 'bad') => {
    if (!soundRef.current) return
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext
      if (!Ctx) return
      const ctx = audioRef.current ?? (audioRef.current = new Ctx())
      if (ctx.state === 'suspended') void ctx.resume()
      const tone = (freq: number, start: number, dur: number, type: OscillatorType = 'sine') => {
        const o = ctx.createOscillator(), g = ctx.createGain()
        o.type = type; o.frequency.value = freq
        g.gain.setValueAtTime(0.0001, ctx.currentTime + start)
        g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + start + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur)
        o.connect(g).connect(ctx.destination)
        o.start(ctx.currentTime + start); o.stop(ctx.currentTime + start + dur + 0.02)
      }
      if (kind === 'ok') tone(880, 0, 0.09)
      else if (kind === 'done') { tone(880, 0, 0.09); tone(1318, 0.1, 0.16) }
      else tone(196, 0, 0.2, 'square')
    } catch {}
  }, [])

  function flashNow(kind: 'ok' | 'bad') {
    setFlash(kind)
    window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setFlash(null), 260)
  }

  function toggleSound() {
    const n = !sound
    setSound(n)
    try { localStorage.setItem('stockroom-scan-sound', n ? '1' : '0') } catch {}
  }

  if (err) return <p className="err">{err}</p>
  if (!d) return <p className="mute">Loading…</p>

  const B = new Map<string, any>(d.bal.map((b: any) => [b.supply_id, b]))
  const avail = (s: any) => Math.max(0, Number(B.get(s.id)?.remaining ?? s.quantity) - heldQty(items, s.id))
  const candidates = d.supplies.filter((s: any) => avail(s) > 0)
  const activeId = supplyId || candidates[0]?.id || ''
  const sel = d.supplies.find((s: any) => s.id === activeId) ?? null
  const p = sel?.products
  const left = sel ? avail(sel) : 0

  function handleScan(raw: string) {
    if (phase !== 'scan' || !sel || !p) return
    const code = raw.trim()
    if (!code) return
    if (count >= goal) {
      setMsg(`All ${goal} ${p.unit} scanned. Confirm to record, or undo the last scan.`)
      flashNow('bad'); beep('bad')
      return
    }
    if (code !== p.barcode) {
      const other = d.supplies.find((s: any) => s.products?.barcode && s.products.barcode === code)
      setMsg(other ? `That barcode belongs to ${other.products.name}, not ${p.name}.` : `Barcode ${code} is not recognised for ${p.name}.`)
      flashNow('bad'); beep('bad')
      return
    }
    const n = count + 1
    setCount(n)
    setScans((xs) => [{ n, code, at: Date.now() }, ...xs].slice(0, 200))
    setMsg('')
    flashNow('ok')
    beep(n === goal ? 'done' : 'ok')
    try { navigator.vibrate?.(n === goal ? [40, 60, 40] : 25) } catch {}
    manualRef.current?.focus()
  }

  async function begin() {
    setMsg('')
    if (!sel || !p) return setMsg('Choose a product to scan out.')
    if (!d.barcodeReady) return setMsg('The database needs one update: run supabase/migration-017.sql in the Supabase SQL editor, then reload.')
    if (!p.barcode) return setMsg(`${p.name} has no barcode yet. Ask your admin to add one on the Products page.`)
    const c = cust.trim(), r = ref.trim(), t = qn(target)
    if (!c) return setMsg('Enter the customer name.')
    if (!r) return setMsg('Enter the supply ID (invoice or sales number).')
    if (!t) return setMsg('Enter how many items the customer is taking.')
    if (!Number.isInteger(t)) return setMsg('Scanning counts whole items. Enter a whole number.')
    if (t > left) return setMsg(`Only ${left} ${p.unit} left in the store.`)
    if (!sel.sheet_started_at && !items.some((x) => x.supplyId === sel.id && x.kind === 'start_sheet')) {
      const hit = await recordOrQueue({
        kind: 'start_sheet', supplyId: sel.id, log: `Created the sheet for ${p.name}`, payload: { productName: p.name },
      }, () => supabaseBrowser().rpc('start_sheet', { p_supply: sel.id }))
      if (!hit.ok) return setMsg(hit.message)
      if (hit.queued) toast('Saved on this device. The sheet will sync when you are back online.')
      else await logAct(`Created the sheet for ${p.name}`)
    }
    setGoal(t); setCount(0); setScans([]); setDone(null); setPhase('scan')
    window.setTimeout(() => manualRef.current?.focus(), 50)
  }

  async function record(): Promise<string> {
    if (!sel || !p || busy || !(count > 0)) return ''
    setBusy(true); setMsg('')
    const c = cust.trim(), r = ref.trim()
    const clientId = crypto.randomUUID()
    const log = `${p.name}: supplied ${count} ${p.unit} to ${c} (${r}) from ${sel.stores?.name ?? 'the store'} — scan-verified`
    const hit = await recordOrQueue({
      id: clientId, kind: 'sheet_row', supplyId: sel.id, log,
      payload: { customer: c, supply_ref: r, quantity: count, productName: p.name },
    }, () => insertEntry('sheet_rows', { supply_id: sel.id, customer: c, supply_ref: r, quantity: count, client_id: clientId }))
    setBusy(false)
    if (!hit.ok) { setMsg(hit.message); return hit.message }
    if (hit.queued) toast('Saved on this device. It will sync when you are back online.')
    else { await logAct(log); toast('Supply recorded') }
    setDone({ count, cust: c, ref: r, queued: hit.queued, at: new Date().toISOString() })
    setPhase('done')
    reload()
    return ''
  }

  function undo() {
    if (!count) return
    setCount(count - 1)
    setScans((xs) => xs.slice(1))
    setMsg('')
  }

  function toSetup() {
    setPhase('setup'); setCount(0); setScans([]); setMsg(''); setAskCancel(false)
  }

  function nextCustomer() {
    setCust(''); setRef(''); setTarget(''); setDone(null)
    toSetup()
  }

  return (<>
    <Hd title="Scan out" sub="Scan each item as it leaves the store. Once the count reaches what the customer is taking, confirm it and the supply is added to the records.">
      <Link className="btn ghost sm no-underline" href="/manager/entry">All sheets</Link>
    </Hd>
    {!d.barcodeReady ? <div className="banner" role="alert">The database needs one update before barcodes can be used: run supabase/migration-017.sql in the Supabase SQL editor, then reload.</div> : null}
    {!online ? <div className="note">You are offline. Scanning still works — the confirmed supply stays on this device and sends when you are back online.</div> : null}

    {phase === 'setup' ? (
      !candidates.length ? (
        <div className="panel"><p className="m-0 mute">{d.supplies.length ? 'Every product assigned to you has been fully supplied. Nothing is left to scan out.' : 'No products are assigned to you yet. The admin assigns each product and its quantity.'}</p></div>
      ) : (
        <div className="content-grid">
          <div className="panel">
            <h2>Set up the supply</h2>
            <label>Product<select value={activeId} onChange={(e) => { setSupplyId(e.target.value); setMsg('') }}>
              {candidates.map((s: any) => <option key={s.id} value={s.id}>{s.products?.name} — {avail(s)} {s.products?.unit} left</option>)}
            </select></label>
            {sel ? <div className="note">Barcode: <b className="font-mono">{p?.barcode || 'not set'}</b> · {left} {p?.unit} left in {sel.stores?.name ?? 'your store'}</div> : null}
            <label>Customer name<input value={cust} maxLength={80} onChange={(e) => setCust(e.target.value)} placeholder="e.g., Alex Johnson" /></label>
            <label>Supply ID (invoice or sales number)<input value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} placeholder="e.g., INV-1003" /></label>
            <label>Quantity the customer is taking ({p?.unit ?? 'items'})<input type="number" min="1" step="1" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="e.g., 1000" /></label>
            <p className="err" role="alert">{msg}</p>
            <button className="btn" onClick={begin}>Start scanning</button>
          </div>
          <div className="panel">
            <h2>How it works</h2>
            <ol className="m-0 flex flex-col gap-2.5 pl-5 text-sm text-mute">
              <li>Choose the product, the customer and the amount they are taking — for example, 1000 buckets of mayonnaise.</li>
              <li>Scan the barcode on <b className="text-ink">every item</b> that leaves the store: phone camera, USB/Bluetooth scanner, or typed code. Each accepted scan adds one.</li>
              <li>A barcode from another product is rejected, so nothing wrong gets counted.</li>
              <li>When the count reaches the amount, confirm. The supply is added to the sheet and taken off the stock left in the store.</li>
            </ol>
            <p className="mute mt-3.5 mb-0 text-sm">Mistakes can be undone scan by scan, and a partial count can be recorded if the customer takes less than planned.</p>
          </div>
        </div>
      )
    ) : null}

    {phase === 'scan' && sel && p ? (<>
      <div className="panel strip">
        <div><b>{count} <span className="font-body text-base font-medium text-mute">/ {goal}</span></b><span>{p.unit} scanned</span></div>
        <div><b>{goal - count}</b><span>Still to scan</span></div>
        <div><b>{Math.max(0, left - count)}</b><span>Left in store after this</span></div>
      </div>
      <div className="panel">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <b className="font-head text-lg">{p.name}</b>
            <p className="m-0 truncate text-sm text-mute">{cust} · {ref}</p>
          </div>
          <button type="button" className={cx('iconbtn', sound && 'text-acc')} aria-pressed={sound} onClick={toggleSound} title={sound ? 'Mute scan sounds' : 'Unmute scan sounds'} aria-label={sound ? 'Mute scan sounds' : 'Unmute scan sounds'}>
            <Icon name={sound ? 'sound' : 'mute'} />
          </button>
        </div>
        <div className="scan-progress mt-3" role="progressbar" aria-valuenow={count} aria-valuemin={0} aria-valuemax={goal} aria-label="Scanned items"><div style={{ width: `${Math.min(100, (count / goal) * 100)}%` }} /></div>
        {count === goal
          ? <p className="mt-2 mb-0 flex items-center gap-1.5 text-sm font-semibold text-acc"><Icon name="check" size={17} /> All {goal} {p.unit} scanned. Confirm to add this supply to the records.</p>
          : <p className="mt-2 mb-0 text-sm text-mute">Keep scanning — {goal - count} more to go.</p>}
      </div>
      <div className="content-grid mt-3.5">
        <div className="panel">
          <h2>Scan each item</h2>
          <ScanCamera onCode={handleScan} flash={flash} />
        </div>
        <div className="panel">
          <h2>Scanner or typed code</h2>
          <p className="mute mt-0 text-sm">A USB or Bluetooth scanner types into this box and presses Enter. You can also type the barcode and press Enter.</p>
          <form onSubmit={(e) => { e.preventDefault(); handleScan(manual); setManual('') }}>
            <label>Barcode<input ref={manualRef} value={manual} onChange={(e) => setManual(e.target.value)} placeholder={p.barcode ?? ''} autoComplete="off" /></label>
            <button className="btn" type="submit">Add one</button>
          </form>
          <p className="err" role="alert">{msg}</p>
          <div className="btns">
            <button className="btn ghost sm" onClick={undo} disabled={!count}><span className="inline-flex items-center gap-1.5"><Icon name="undo" size={15} /> Undo last scan</span></button>
            <button className="btn ghost sm" onClick={() => (count ? setAskCancel(true) : toSetup())}>Cancel</button>
          </div>
          <h2 className="mt-4">Recent scans</h2>
          {scans.length ? (
            <ul className="scan-feed m-0 max-h-56 list-none overflow-y-auto p-0">
              {scans.slice(0, 60).map((s) => (
                <li key={s.n} className="flex items-center gap-2 border-b border-line px-1 py-1.5 text-sm last:border-b-0">
                  <span className="grid h-6 w-9 flex-none place-items-center rounded bg-accsoft text-[11px] font-semibold text-acc">{s.n}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{s.code}</span>
                  <time className="flex-none text-[11px] text-mute">{new Date(s.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                </li>
              ))}
            </ul>
          ) : <p className="mute m-0 text-sm">No scans yet. The first accepted barcode appears here.</p>}
        </div>
      </div>
      <div className="panel mt-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <button className="btn w-auto" disabled={count !== goal || busy} onClick={() => void record()}>{busy ? 'Recording…' : `Confirm & record ${count} ${p.unit}`}</button>
          {count > 0 && count < goal ? <button className="btn ghost w-auto" onClick={() => setAskPartial(true)}>Record partial ({count})</button> : null}
          <span className="text-sm text-mute">{count === goal ? 'The full amount is ready to record.' : `${goal - count} more to scan before the full amount can be confirmed.`}</span>
        </div>
      </div>
    </>) : null}

    {phase === 'done' && done && sel && p ? (
      <div className="panel max-w-[600px]">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 flex-none place-items-center rounded-full bg-accsoft text-acc"><Icon name="check" size={26} /></span>
          <div>
            <h2 className="m-0 font-head text-xl">Supply recorded</h2>
            <p className="m-0 text-sm text-mute">{done.queued ? 'Saved on this device — it will sync when you are back online.' : 'Added to the sheet and taken off the stock left in the store.'}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 text-sm">
          <dt className="text-mute">Product</dt><dd className="m-0 font-medium">{p.name}</dd>
          <dt className="text-mute">Customer</dt><dd className="m-0 font-medium">{done.cust}</dd>
          <dt className="text-mute">Supply ID</dt><dd className="m-0 font-medium">{done.ref}</dd>
          <dt className="text-mute">Quantity recorded</dt><dd className="m-0 font-medium">{done.count} {p.unit} (scan-verified)</dd>
          <dt className="text-mute">Recorded at</dt><dd className="m-0 font-medium">{new Date(done.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd>
        </dl>
        <div className="btns mt-4">
          <button className="btn w-auto" onClick={nextCustomer}>Next customer</button>
          <Link className="btn ghost w-auto no-underline" href={`/manager/entry/${sel.id}`}>Open sheet</Link>
          <Link className="btn ghost w-auto no-underline" href="/manager/entry">All sheets</Link>
        </div>
      </div>
    ) : null}

    <Confirm open={askPartial} title="Record partial count" label={`Record ${count}`} onClose={() => setAskPartial(false)}
      text={p ? `You scanned ${count} of ${goal} ${p.unit}. Record ${count} ${p.unit} supplied to ${cust} (${ref}) now? The rest can be supplied later.` : ''}
      onConfirm={record} />
    <Confirm open={askCancel} title="Discard scan session" label="Discard" onClose={() => setAskCancel(false)}
      text={p ? `Discard this session? ${count} scanned ${p.unit} will not be recorded.` : ''}
      onConfirm={async () => { toSetup(); return '' }} />
  </>)
}