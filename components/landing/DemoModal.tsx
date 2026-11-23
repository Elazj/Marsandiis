'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Modal } from '@/components/ui'
import { I } from './shared'
import { DesktopFrame, PhoneFrame } from './DeviceFrames'
import { btn } from '@/lib/tw'

const STEPS = [
  {
    src: '/landing/dashboard-desktop.webp',
    w: 1600,
    h: 801,
    title: 'Your whole company at a glance',
    text: 'The admin dashboard shows stock value, low-stock notices and store activity the moment you sign in.',
  },
  {
    src: '/landing/dashboard-hero.webp',
    w: 1600,
    h: 801,
    title: 'Track trends across every store',
    text: 'Charts and KPIs show how stock moves over time, so you can reorder before a shelf runs empty.',
  },
  {
    src: '/landing/dashboard-mobile.webp',
    w: 433,
    h: 692,
    title: 'Works on the shop floor',
    text: 'Store managers record daily entries from any phone — even offline. Entries sync when the connection returns.',
  },
]

export default function DemoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(true)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) { setStep(0); setPlaying(true); return }
    if (!playing) return
    timer.current = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 4500)
    return () => { if (timer.current) clearInterval(timer.current) }
  }, [open, playing])

  const go = (n: number) => { setPlaying(false); setStep((n + STEPS.length) % STEPS.length) }
  const s = STEPS[step]

  return (
    <Modal open={open} title="See Marsandiis in action" onClose={onClose} wide>
      <div className="relative rounded-xl border border-line bg-bg p-4 sm:p-5">
        {s.w < s.h
          ? <PhoneFrame key={s.src} size="md" src={s.src} alt={s.title} className="mx-auto w-[230px] sm:w-[260px]" />
          : <DesktopFrame key={s.src} src={s.src} alt={s.title} />}
        <button
          className="absolute left-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-panel text-ink shadow-md transition-colors hover:border-acc hover:text-acc"
          onClick={() => go(step - 1)}
          aria-label="Previous screen"
        >
          <I name="chev" size={18} className="rotate-90" />
        </button>
        <button
          className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-panel text-ink shadow-md transition-colors hover:border-acc hover:text-acc"
          onClick={() => go(step + 1)}
          aria-label="Next screen"
        >
          <I name="chev" size={18} className="-rotate-90" />
        </button>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="m-0 text-[15px] font-semibold text-ink">{s.title}</p>
          <p className="m-0 mt-1 text-sm leading-relaxed text-mute">{s.text}</p>
        </div>
        <button
          className="shrink-0 cursor-pointer rounded-full border border-line bg-transparent px-3 py-1.5 text-[12px] font-medium text-mute transition-colors hover:border-acc hover:text-acc"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? 'Pause tour' : 'Auto-play'}
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <div className="flex gap-2" role="tablist" aria-label="Tour steps">
          {STEPS.map((t, i) => (
            <button
              key={t.src}
              role="tab"
              aria-selected={i === step}
              aria-label={t.title}
              onClick={() => go(i)}
              className={`h-2 cursor-pointer rounded-full border-0 transition-all ${i === step ? 'w-6 bg-acc' : 'w-2 bg-line hover:bg-mute'}`}
            />
          ))}
        </div>
        <Link href="/login?mode=signup" className={btn('primary', 'sm')} onClick={onClose}>
          Start free <I name="arrow" size={15} />
        </Link>
      </div>
    </Modal>
  )
}