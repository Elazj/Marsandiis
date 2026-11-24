'use client'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui'
import { friendly, q } from '@/lib/data'
import { downloadReceiptPdf } from '@/lib/receiptPdf'
import { receiptSnapshot, type ReceiptSnapshot } from '@/lib/sales'
import { supabaseBrowser } from '@/lib/supabase/client'
import { ReceiptPaper, type ReceiptFormat } from './ReceiptPaper'

const PRINT_CSS = `
  *{box-sizing:border-box}body{margin:0;color:#0f2a3d;background:#fff;font-family:Arial,sans-serif;font-size:12px}
  .receipt-paper{box-sizing:border-box;background:#fff;color:#0f2a3d;padding:24px;font-family:Arial,sans-serif}
  .receipt-a4{width:186mm;min-height:270mm;margin:auto}.receipt-58{width:58mm;padding:6mm 3mm}.receipt-80{width:80mm;padding:7mm 4mm}
  .receipt-head{display:flex;align-items:center;gap:12px;padding-bottom:12px;border-bottom:2px solid #1673bb}.receipt-head img{width:48px;height:48px;object-fit:contain}.receipt-head h2{margin:0;font-size:19px}.receipt-head p{margin:4px 0 0;font-size:10px;color:#53708a}
  .receipt-title{text-align:center;font-size:18px;font-weight:700;letter-spacing:1px;margin:18px 0}.receipt-meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:0 0 16px}.receipt-meta div{display:flex;justify-content:space-between;gap:8px}.receipt-meta dt{color:#53708a}.receipt-meta dd{margin:0;font-weight:600;text-align:right}
  .receipt-items{width:100%;border-collapse:collapse;font-size:11px}.receipt-items th,.receipt-items td{padding:7px 4px;border-bottom:1px solid #cde2f2;text-align:left;vertical-align:top}.receipt-items th{color:#53708a}.n{text-align:right!important;white-space:nowrap}
  .receipt-totals{width:min(320px,100%);margin:16px 0 16px auto}.receipt-totals div{display:flex;justify-content:space-between;gap:16px;padding:4px 0}.receipt-status{border-top:1px solid #cde2f2;padding-top:10px;margin:0}.receipt-status div{display:flex;justify-content:space-between;gap:12px;padding:3px 0}.receipt-status dt{color:#53708a}.receipt-status dd{margin:0;font-weight:600;text-align:right}
  .receipt-payment-callout{background:#d6ebfb;border-left:4px solid #1673bb;padding:12px;margin:12px 0}.receipt-payment-callout div{display:flex;justify-content:space-between;gap:12px}.receipt-payment-callout b{font-size:15px}.receipt-payment-callout p{margin:8px 0 0;font-size:10px}.receipt-note{font-size:10px;color:#53708a}.receipt-foot{text-align:center;margin-top:22px;padding-top:12px;border-top:1px solid #cde2f2;font-weight:600}.receipt-foot span{display:block;margin-top:5px;font-size:9px;font-weight:400;color:#53708a}
  .receipt-58,.receipt-80{font-size:9px}.receipt-58 .receipt-head img,.receipt-80 .receipt-head img{width:32px;height:32px}.receipt-58 .receipt-head,.receipt-80 .receipt-head{gap:7px}.receipt-58 .receipt-head h2,.receipt-80 .receipt-head h2{font-size:12px}.receipt-58 .receipt-head p,.receipt-80 .receipt-head p{font-size:6px}.receipt-58 .receipt-title,.receipt-80 .receipt-title{font-size:12px;margin:12px 0}.receipt-58 .receipt-meta,.receipt-80 .receipt-meta{grid-template-columns:1fr;font-size:8px}.receipt-58 .receipt-items,.receipt-80 .receipt-items{font-size:8px}.receipt-58 .receipt-items th,.receipt-58 .receipt-items td,.receipt-80 .receipt-items th,.receipt-80 .receipt-items td{padding:5px 2px}.receipt-58 .receipt-items th:nth-child(3),.receipt-58 .receipt-items td:nth-child(3),.receipt-80 .receipt-items th:nth-child(3),.receipt-80 .receipt-items td:nth-child(3){display:none}.receipt-58 .receipt-totals,.receipt-80 .receipt-totals{width:100%;font-size:9px}.receipt-58 .receipt-status,.receipt-80 .receipt-status{font-size:8px}.receipt-58 .receipt-foot,.receipt-80 .receipt-foot{font-size:8px}
  @page{size:A4 portrait;margin:12mm}@media print{body{background:#fff}.receipt-paper{margin:0;box-shadow:none}}
`

export function ReceiptViewer({ receiptId, onClose }: { receiptId: string; onClose: () => void }) {
  const [snapshot, setSnapshot] = useState<ReceiptSnapshot | null>(null)
  const [format, setFormat] = useState<ReceiptFormat>('a4')
  const [err, setErr] = useState('')
  const paper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let stale = false
    q(supabaseBrowser().from('receipts').select('snapshot').eq('id', receiptId).single())
      .then((row: any) => { if (!stale) setSnapshot(receiptSnapshot(row?.snapshot)) })
      .catch((error: any) => { if (!stale) setErr(friendly(error?.message ?? 'Could not load the receipt.')) })
    return () => { stale = true }
  }, [receiptId])

  function printReceipt() {
    if (!paper.current) return
    const frame = document.createElement('iframe')
    frame.style.position = 'fixed'
    frame.style.right = '0'
    frame.style.bottom = '0'
    frame.style.width = '0'
    frame.style.height = '0'
    frame.style.border = '0'
    document.body.appendChild(frame)
    const doc = frame.contentDocument
    if (!doc) return
    const pageRule = format === 'a4' ? '@page{size:A4 portrait;margin:12mm}' : `@page{size:${format}mm 297mm;margin:0}`
    doc.open()
    doc.write(`<!doctype html><html><head><base href="${window.location.origin}/"><style>${PRINT_CSS.replace('@page{size:A4 portrait;margin:12mm}', pageRule)}</style></head><body>${paper.current.outerHTML}</body></html>`)
    doc.close()
    const run = () => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      frame.addEventListener('load', () => frame.remove(), { once: true })
      setTimeout(() => frame.remove(), 60_000)
    }
    if (doc.readyState === 'complete') setTimeout(run, 80)
    else frame.addEventListener('load', () => setTimeout(run, 80), { once: true })
  }

  return <Modal open title={snapshot ? `Receipt ${snapshot.receiptNo}` : 'Receipt'} onClose={onClose} wide footerClose>
    {err ? <p className="err" role="alert">{err}</p> : null}
    {!snapshot ? <p className="mute">Loading receipt…</p> : <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="tabs m-0 min-w-[240px]" aria-label="Receipt format">
          <button className={format === 'a4' ? 'on' : ''} onClick={() => setFormat('a4')}>A4</button>
          <button className={format === '58' ? 'on' : ''} onClick={() => setFormat('58')}>58mm</button>
          <button className={format === '80' ? 'on' : ''} onClick={() => setFormat('80')}>80mm</button>
        </div>
        <div className="flex flex-wrap gap-2"><button className="btn ghost sm" onClick={printReceipt}>Print receipt</button><button className="btn sm" onClick={() => downloadReceiptPdf(snapshot, format)}>Download PDF</button></div>
      </div>
      <div ref={paper} className="receipt-preview"><ReceiptPaper snapshot={snapshot} format={format} /></div>
      <p className="mute mt-3 mb-0 text-xs">This is a preview of the saved receipt. Amounts and exchange rates come from its original snapshot.</p>
    </>}
  </Modal>
}
