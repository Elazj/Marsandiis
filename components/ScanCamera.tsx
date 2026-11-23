'use client'
import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { cx } from '@/lib/tw'

type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = (new (options?: { formats?: string[] }) => Detector) & { getSupportedFormats?: () => Promise<string[]> }
const FORMATS = ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'itf', 'qr_code']

const ctor = (): DetectorCtor | null => (typeof window === 'undefined' ? null : ((window as any).BarcodeDetector ?? null))

export default function ScanCamera({ onCode, flash }: { onCode: (code: string) => void; flash: 'ok' | 'bad' | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef(0)
  const busyRef = useRef(false)
  const lastRef = useRef({ code: '', at: 0 })
  const onCodeRef = useRef(onCode); onCodeRef.current = onCode
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const [supported, setSupported] = useState<boolean | null>(null)

  useEffect(() => {
    const C = ctor()
    if (!C) { setSupported(false); return }
    if (!C.getSupportedFormats) { setSupported(true); return }
    let alive = true
    C.getSupportedFormats().then((fs) => { if (alive) setSupported(fs.some((f) => FORMATS.includes(f))) }).catch(() => { if (alive) setSupported(true) })
    return () => { alive = false }
  }, [])

  function stop() {
    window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setOn(false)
  }

  async function start() {
    setErr('')
    const C = ctor()
    if (!C) return setErr('This browser cannot read barcodes from the camera. Use Chrome or Edge, a USB/Bluetooth scanner, or type the code below.')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      streamRef.current = stream
      const v = videoRef.current
      if (!v) { stream.getTracks().forEach((t) => t.stop()); streamRef.current = null; return }
      v.srcObject = stream
      await v.play()
      setOn(true)
      let formats = FORMATS
      try { const fs = await C.getSupportedFormats?.(); if (fs?.length) formats = FORMATS.filter((f) => fs.includes(f)) } catch {}
      const det = new C({ formats })
      timerRef.current = window.setInterval(async () => {
        const video = videoRef.current
        if (busyRef.current || !video || video.readyState < 2) return
        busyRef.current = true
        try {
          const hits = await det.detect(video)
          const code = hits[0]?.rawValue?.trim()
          if (code) {
            const now = Date.now()
            // The camera re-reads the same label many times a second; count one pass per label.
            if (code !== lastRef.current.code || now - lastRef.current.at > 1200) {
              lastRef.current = { code, at: now }
              onCodeRef.current(code)
            }
          }
        } catch {} finally { busyRef.current = false }
      }, 200)
    } catch (e: any) {
      const n = String(e?.name ?? '')
      setErr(n === 'NotAllowedError' ? 'Camera permission was denied. Allow camera access in the browser, or use a hardware scanner / type the code below.'
        : n === 'NotFoundError' ? 'No camera was found on this device. Use a hardware scanner or type the code below.'
        : 'Could not start the camera. Use a hardware scanner or type the code below.')
      stop()
    }
  }

  useEffect(() => stop, [])

  return (
    <div>
      <div className="scan-stage">
        <video ref={videoRef} playsInline muted className={cx('h-full w-full object-cover', !on && 'hidden')} />
        {!on ? (
          <div className="absolute inset-0 grid place-items-center px-4 text-center">
            <div>
              <Icon name="camera" size={34} className="mx-auto text-[#8faac0]" />
              <p className="mt-2 mb-0 text-sm text-[#8faac0]">{supported === false ? 'Camera scanning is not supported in this browser.' : 'Camera is off'}</p>
            </div>
          </div>
        ) : (<>
          <span className="absolute left-3 top-3 h-7 w-7 rounded-tl-lg border-l-2 border-t-2 border-acc" aria-hidden="true" />
          <span className="absolute right-3 top-3 h-7 w-7 rounded-tr-lg border-r-2 border-t-2 border-acc" aria-hidden="true" />
          <span className="absolute bottom-3 left-3 h-7 w-7 rounded-bl-lg border-b-2 border-l-2 border-acc" aria-hidden="true" />
          <span className="absolute bottom-3 right-3 h-7 w-7 rounded-br-lg border-b-2 border-r-2 border-acc" aria-hidden="true" />
          <span className="scan-line" aria-hidden="true" />
        </>)}
        {flash ? <div aria-hidden="true" className={cx('pointer-events-none absolute inset-0', flash === 'ok' ? 'bg-acc/25' : 'bg-bad/30')} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {on
          ? <button type="button" className="btn ghost sm" onClick={stop}>Stop camera</button>
          : <button type="button" className="btn sm" onClick={start} disabled={supported === false}>Start camera</button>}
        <span className="text-xs text-mute">{on ? 'Point the camera at the barcode on each item.' : supported === false ? 'Use a USB/Bluetooth scanner or type the code below.' : 'Scanning works best in good light.'}</span>
      </div>
      {err ? <p className="err mt-2 mb-0" role="alert">{err}</p> : null}
    </div>
  )
}