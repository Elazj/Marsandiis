'use client'
import { ReactNode, useEffect, useRef, useState } from 'react'
import { cx } from '@/lib/tw'

export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setSeen(true); return }
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) { setSeen(true); io.disconnect() } },
      { threshold: 0.12, rootMargin: '0px 0px -36px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={cx('reveal', seen && 'in', className)} style={delay ? { transitionDelay: `${delay}ms` } : undefined}>
      {children}
    </div>
  )
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-[1200px] px-5 sm:px-8', className)}>{children}</div>
}

export function SectionHead({ eyebrow, title, sub, onNavy }: { eyebrow?: string; title: string; sub?: string; onNavy?: boolean }) {
  return (
    <Reveal className="mx-auto mb-12 max-w-[640px] text-center lg:mb-16">
      {eyebrow && (
        <p className={cx('mb-3 text-[12px] font-bold uppercase tracking-[0.18em]', onNavy ? 'text-[#38a8ee]' : 'text-acc')}>{eyebrow}</p>
      )}
      <h2 className={cx('font-head text-[30px] font-semibold leading-[1.15] sm:text-[38px]', onNavy ? 'text-[#e4f1fb]' : 'text-ink')}>{title}</h2>
      {sub && <p className={cx('mt-4 text-[16px] leading-relaxed', onNavy ? 'text-[#9db8cc]' : 'text-mute')}>{sub}</p>}
    </Reveal>
  )
}

const paths: Record<string, ReactNode> = {
  store: <><path d="M4 9l1.4-4.5h13.2L20 9" /><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9" /><path d="M5.5 12v8h13v-8M10 20v-5h4v5" /></>,
  warehouse: <><path d="M3 9.5L12 4l9 5.5V20H3z" /><path d="M7 20v-7h10v7M7 16.5h10" /></>,
  truck: <><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7.5" cy="17.5" r="1.8" /><circle cx="17.5" cy="17.5" r="1.8" /></>,
  boxes: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>,
  chart: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></>,
  calendar: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  wifioff: <><path d="M2 2l20 20" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 5.2-2.3M16.7 11a10.9 10.9 0 0 1 2.4 1.5M12 20h.01" /></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 11.5l2 2 4-4.5" /></>,
  receipt: <><path d="M5 3h14v18l-2.3-1.6L14.4 21l-2.4-1.6L9.6 21l-2.3-1.6L5 21z" /><path d="M9 8h6M9 12h6" /></>,
  check: <path d="M20 6L9 17l-5-5" />,
  arrow: <><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>,
  play: <path d="M8 5.5v13l11-6.5z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  chev: <path d="M6 9l6 6 6-6" />,
  users: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4.5M12 16h.01" /></>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeoff: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a13.7 13.7 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  quote: <path d="M10 8H6a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3M20 8h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2v3" />,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 6l-10 7L2 6" /></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.8.7a2 2 0 0 1 1.7 2z" />,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></>,
}

export function I({ name, size = 22, className, sw = 1.8 }: { name: keyof typeof paths | string; size?: number; className?: string; sw?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

/** Isometric cube cluster, drawn in the brand blues. Used as a section decoration. */
export function Cubes({ className, outline }: { className?: string; outline?: boolean }) {
  const stroke = outline ? 'rgba(228,241,251,0.5)' : '#7db8e0'
  const fills = outline
    ? ['none', 'none', 'none']
    : ['rgba(56,168,238,0.35)', 'rgba(22,115,187,0.28)', 'rgba(214,235,251,0.75)']
  const cube = (x: number, y: number, f: number) => (
    <g transform={`translate(${x} ${y})`}>
      <polygon points="0,-26 45,0 0,26 -45,0" fill={fills[f]} stroke={stroke} strokeWidth="1.4" />
      <polygon points="-45,0 0,26 0,78 -45,52" fill={outline ? 'none' : 'rgba(22,115,187,0.18)'} stroke={stroke} strokeWidth="1.4" />
      <polygon points="45,0 0,26 0,78 45,52" fill={outline ? 'none' : 'rgba(56,168,238,0.14)'} stroke={stroke} strokeWidth="1.4" />
    </g>
  )
  return (
    <svg viewBox="-100 -40 200 180" className={className} aria-hidden="true">
      {cube(0, 0, 0)}
      {cube(-46, 79, 1)}
      {cube(46, 79, 2)}
    </svg>
  )
}

export function CheckRow({ title, sub, onNavy }: { title: string; sub?: string; onNavy?: boolean }) {
  return (
    <div className="flex items-start gap-3.5">
      <span className={cx('mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full', onNavy ? 'bg-[#1673bb]/30 text-[#7cc4f5]' : 'bg-accsoft text-acc')}>
        <I name="check" size={13} sw={2.6} />
      </span>
      <span>
        <span className={cx('block text-[15px] font-semibold', onNavy ? 'text-[#e4f1fb]' : 'text-ink')}>{title}</span>
        {sub && <span className={cx('mt-0.5 block text-[13.5px] leading-relaxed', onNavy ? 'text-[#9db8cc]' : 'text-mute')}>{sub}</span>}
      </span>
    </div>
  )
}