'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { cx, btn } from '@/lib/tw'
import { Reveal, Container, SectionHead, I, Cubes, CheckRow } from './shared'
import Footer from './Footer'
import DemoModal from './DemoModal'
import { DesktopFrame, PhoneFrame } from './DeviceFrames'

const NAV = [
  { label: 'Home', href: '/#top', id: 'top' },
  { label: 'Features', href: '/#features', id: 'features' },
  { label: 'How It Works', href: '/#how-it-works', id: 'how-it-works' },
  { label: 'Pricing', href: '/#pricing', id: 'pricing' },
  { label: 'Help', href: '/#help', id: 'help' },
]

const skyBtn = 'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#38a8ee] px-5 py-2.5 text-[15px] font-semibold text-[#06202f] no-underline transition-all duration-150 hover:-translate-y-px hover:bg-[#5cbcf5] hover:shadow-[0_8px_24px_rgba(56,168,238,0.35)]'

function Nav({ onDemo }: { onDemo: () => void }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState('top')

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40)
      let current = 'top'
      for (const n of NAV) {
        const el = document.getElementById(n.id)
        if (el && el.getBoundingClientRect().top <= 140) current = n.id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const dark = !scrolled && !open
  return (
    <header className={cx('fixed inset-x-0 top-0 z-50 transition-all duration-300', dark ? 'bg-transparent' : 'border-b border-line bg-panel/90 shadow-sm backdrop-blur-md')}>
      <Container className="flex h-[72px] items-center justify-between gap-4">
        <Link href="/#top" className={cx('flex items-center gap-2.5 font-head text-[22px] font-semibold no-underline', dark ? 'text-white' : 'text-ink')} aria-label="Marsandiis home">
          <Image src="/logo-icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
          Marsandiis
        </Link>

        <nav className="hidden flex-row items-center gap-1 lg:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.id}
              href={n.href}
              className={cx(
                'rounded-lg px-3.5 py-2 text-[14.5px] font-medium no-underline transition-colors',
                dark
                  ? active === n.id ? 'bg-white/10 text-white' : 'text-[#c6dcec] hover:bg-white/5 hover:text-white'
                  : active === n.id ? 'bg-accsoft text-acc' : 'text-mute hover:bg-accsoft/60 hover:text-ink',
              )}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <Link href="/login" className={cx('rounded-lg px-4 py-2 text-[14.5px] font-semibold no-underline transition-colors', dark ? 'text-white hover:bg-white/10' : 'text-ink hover:bg-accsoft/60')}>
            Log In
          </Link>
          <Link href="/login?mode=signup" className={dark ? cx(skyBtn, 'px-4 py-2 text-[14px]') : btn('primary', 'sm')}>
            Get Started
          </Link>
        </div>

        <button
          className={cx('grid h-10 w-10 cursor-pointer place-items-center rounded-lg border lg:hidden', dark ? 'border-white/20 bg-white/5 text-white' : 'border-line bg-panel text-ink')}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          <I name={open ? 'x' : 'menu'} size={20} />
        </button>
      </Container>

      {open && (
        <div className="border-t border-line bg-panel shadow-lg lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV.map((n) => (
              <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className={cx('rounded-lg px-3 py-2.5 text-[15px] font-medium no-underline', active === n.id ? 'bg-accsoft text-acc' : 'text-ink hover:bg-accsoft/60')}>
                {n.label}
              </Link>
            ))}
            <button onClick={() => { setOpen(false); onDemo() }} className="cursor-pointer rounded-lg border-0 bg-transparent px-3 py-2.5 text-left text-[15px] font-medium text-ink hover:bg-accsoft/60">
              Watch demo
            </button>
            <div className="mt-2 flex gap-3 border-t border-line pt-4">
              <Link href="/login" className={cx(btn('ghost'), 'flex-1')} onClick={() => setOpen(false)}>Log In</Link>
              <Link href="/login?mode=signup" className={cx(btn('primary'), 'flex-1')} onClick={() => setOpen(false)}>Get Started</Link>
            </div>
          </Container>
        </div>
      )}
    </header>
  )
}

function Hero({ onDemo }: { onDemo: () => void }) {
  return (
    <section id="top" className="lp-navy relative overflow-hidden pb-28 pt-[136px] lg:pb-32 lg:pt-[160px]">
      <Image src="/landing/warehouse.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b1925]/80 via-[#0f2a3d]/75 to-[#0f2a3d]" aria-hidden="true" />
      <div className="lp-dots absolute inset-0" aria-hidden="true" />
      <Cubes className="absolute -left-10 top-24 hidden w-40 opacity-40 lg:block" />
      <Cubes className="absolute -right-8 bottom-40 hidden w-32 opacity-30 xl:block" />

      <Container className="relative">
        <div className="mx-auto max-w-[760px] text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-[13px] font-medium text-[#c6dcec]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#38a8ee]" aria-hidden="true" />
              Multi-store inventory, made simple
            </span>
          </Reveal>
          <Reveal delay={90}>
            <h1 className="mt-6 font-head text-[40px] font-semibold leading-[1.08] text-white sm:text-[54px] lg:text-[62px]">
              Smarter Inventory.
              <span className="block bg-gradient-to-r from-[#38a8ee] to-[#8fd0f8] bg-clip-text text-transparent">Stronger Business.</span>
            </h1>
          </Reveal>
          <Reveal delay={180}>
            <p className="mx-auto mt-5 max-w-[560px] text-[17px] leading-relaxed text-[#9db8cc]">
              Track stock across every store, record daily entries from any phone, and know what to reorder before a shelf runs empty — online or offline.
            </p>
          </Reveal>
          <Reveal delay={260}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link href="/login?mode=signup" className={cx(skyBtn, 'px-7 py-3.5 text-base')}>
                Get Started Free <I name="arrow" size={17} />
              </Link>
              <button onClick={onDemo} className="inline-flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/25 bg-white/5 px-6 py-3.5 text-base font-semibold text-white transition-all duration-150 hover:-translate-y-px hover:border-white/40 hover:bg-white/10">
                <span className="grid h-7 w-7 place-items-center rounded-full bg-white/15"><I name="play" size={13} /></span>
                Watch Demo
              </button>
            </div>
          </Reveal>
          <Reveal delay={330}>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[13.5px] text-[#9db8cc]">
              {['Free to start', 'Works on any phone', 'Your data stays private'].map((t) => (
                <span key={t} className="inline-flex items-center gap-1.5"><I name="check" size={14} className="text-[#38a8ee]" sw={2.4} />{t}</span>
              ))}
            </p>
          </Reveal>
        </div>

        <Reveal delay={200} className="relative mx-auto mt-14 max-w-[900px] lg:mt-16">
          <DesktopFrame src="/landing/dashboard-hero.webp" alt="Marsandiis admin dashboard showing stock KPIs and trend charts" />
          <div className="absolute -bottom-12 -right-2 w-[120px] sm:-right-6 sm:w-[170px] lg:-right-14 lg:w-[195px]">
            <PhoneFrame src="/landing/dashboard-mobile.webp" alt="Marsandiis on iPhone — store manager dashboard" />
          </div>

          <div className="absolute -left-3 top-16 hidden animate-float-slow items-center gap-2.5 rounded-xl border border-white/12 bg-[#122436]/95 px-4 py-3 shadow-xl backdrop-blur md:flex lg:-left-16">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#b3322b]/20 text-[#f08a83]"><I name="alert" size={16} /></span>
            <span><b className="block text-[13px] text-white">Mayonnaise 5Le is finished</b><span className="text-[11.5px] text-[#9db8cc]">Low-stock notice · Main store</span></span>
          </div>
          <div className="absolute -right-3 top-[40px] hidden animate-float-slow items-center gap-2.5 rounded-xl border border-white/12 bg-[#122436]/95 px-4 py-3 shadow-xl backdrop-blur md:flex lg:-right-24 [animation-delay:1.4s]">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#b76e00]/25 text-[#f2b45c]"><I name="clock" size={16} /></span>
            <span><b className="block text-[13px] text-white">Runs out in about 2 days</b><span className="text-[11.5px] text-[#9db8cc]">Cooking Oil 20L · forecast</span></span>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

function TrustedBy() {
  const types = [
    { icon: 'boxes', label: 'Wholesalers' },
    { icon: 'store', label: 'Retail Shops' },
    { icon: 'warehouse', label: 'Warehouses' },
    { icon: 'truck', label: 'Distributors' },
  ]
  return (
    <section className="border-b border-line bg-panel py-10">
      <Container>
        <Reveal className="flex flex-col items-center gap-6 lg:flex-row lg:justify-between">
          <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-mute">Built for businesses like yours</p>
          <div className="grid w-full grid-cols-2 gap-4 sm:flex sm:w-auto sm:gap-10">
            {types.map((t) => (
              <span key={t.label} className="flex items-center justify-center gap-2.5 text-[15px] font-semibold text-ink/80 sm:justify-start">
                <I name={t.icon} size={21} className="text-acc" />{t.label}
              </span>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}

function Problems() {
  const items = [
    {
      icon: 'boxes',
      problem: 'Stock counts live in notebooks',
      detail: 'Quantities are written down at the counter, so nobody at head office knows what each store really holds.',
      fix: 'Every entry updates one shared stock count, visible to the whole company instantly.',
    },
    {
      icon: 'alert',
      problem: 'Shelves run empty without warning',
      detail: 'You only discover a product is finished when a customer asks for it — and the sale walks away.',
      fix: 'Low-stock notices and usage forecasts tell you what to reorder days in advance.',
    },
    {
      icon: 'wifioff',
      problem: 'The internet drops, work stops',
      detail: 'Cloud tools freeze when the connection fails, so entries pile up on paper and get lost.',
      fix: 'Marsandiis keeps working offline and syncs every entry when the connection returns — never twice.',
    },
  ]
  return (
    <section className="bg-bg py-20 lg:py-24">
      <Container>
        <SectionHead eyebrow="Why Marsandiis" title="Running several stores shouldn't mean guessing" sub="If any of this sounds familiar, Marsandiis was built for you." />
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <Reveal key={it.problem} delay={i * 110}>
              <article className="flex h-full flex-col rounded-2xl border border-line bg-panel p-7 shadow-panel transition-transform duration-200 hover:-translate-y-1">
                <span className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-badsoft text-bad"><I name={it.icon} size={22} /></span>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-bad">The problem</p>
                <h3 className="font-head text-[20px] font-semibold text-ink">{it.problem}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-mute">{it.detail}</p>
                <div className="mt-5 flex items-start gap-2.5 border-t border-line pt-5">
                  <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-[#e5f4ec] text-[#1a7f4e]"><I name="check" size={11} sw={3} /></span>
                  <p className="m-0 text-[14px] leading-relaxed text-ink">{it.fix}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Features() {
  const feats = [
    { icon: 'store', title: 'Multi-store management', text: 'Run every branch from one company space. Each store has its own stock, entries and manager accounts.' },
    { icon: 'calendar', title: 'Daily entries in seconds', text: 'Record customer supplies, losses and gifts on a simple product sheet built for the shop floor.' },
    { icon: 'wifioff', title: 'Works offline', text: 'No connection? Keep recording. Entries queue on the device and sync automatically — never twice.' },
    { icon: 'chart', title: 'Stock forecasts', text: 'See recent usage and estimated days of cover for each product, so you reorder at the right time.' },
    { icon: 'bell', title: 'Low-stock alerts', text: 'Notices flag products that are low or finished across your stores, before customers notice.' },
    { icon: 'receipt', title: 'Reports & analytics', text: 'Charts, KPIs and store reports show how stock moves. Managers send issues straight to the admin.' },
    { icon: 'shield', title: 'Private & secure', text: 'Each company\u2019s data is fully separated, with role-based access and one-click backups.' },
    { icon: 'boxes', title: 'Sales, receipts & loans', text: 'Invoice and sales-number search is already here. A full sales, receipts and loans suite is on the way.', soon: true },
  ]
  return (
    <section id="features" className="scroll-mt-20 bg-panel py-20 lg:py-24">
      <Container>
        <SectionHead eyebrow="Features" title="Everything your stock needs, nothing it doesn't" sub="Real tools for real shops — from the first daily entry to company-wide reports." />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {feats.map((f, i) => (
            <Reveal key={f.title} delay={(i % 4) * 90}>
              <article className="group h-full rounded-2xl border border-line bg-bg p-6 transition-all duration-200 hover:-translate-y-1 hover:border-acc/40 hover:shadow-panel">
                <span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-accsoft text-acc transition-colors group-hover:bg-acc group-hover:text-on">
                  <I name={f.icon} size={22} />
                </span>
                <h3 className="flex flex-wrap items-center gap-2 text-[16px] font-semibold text-ink">
                  {f.title}
                  {f.soon && <span className="rounded-full bg-warnsoft px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-warn">Coming soon</span>}
                </h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-mute">{f.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    { n: '1', icon: 'users', title: 'Create your company', text: 'Sign up with your company name — it becomes your private space. No card needed, ready in a minute.' },
    { n: '2', icon: 'boxes', title: 'Add stores & products', text: 'Set up each store, add products with starting quantities, and invite up to three managers per store.' },
    { n: '3', icon: 'chart', title: 'Manage & monitor', text: 'Managers record daily entries from any phone. You watch stock, alerts and reports across every store.' },
  ]
  return (
    <section id="how-it-works" className="lp-dots scroll-mt-20 bg-bg py-20 lg:py-24">
      <Container>
        <SectionHead eyebrow="How it works" title="Up and running in three steps" sub="From sign-up to your first synced entry in a single afternoon." />
        <div className="relative grid gap-10 md:grid-cols-3 md:gap-6">
          <svg className="absolute left-[16%] right-[16%] top-7 hidden h-6 w-[68%] text-acc/30 md:block" viewBox="0 0 600 24" fill="none" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 12 C 100 -8, 200 32, 300 12 S 500 -8, 600 12" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" />
          </svg>
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 130} className="relative text-center">
              <div className="relative mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-acc text-on shadow-[0_8px_20px_rgba(22,115,187,0.35)]">
                <I name={s.icon} size={24} />
                <span className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border-2 border-bg bg-panel text-[12px] font-bold text-acc">{s.n}</span>
              </div>
              <h3 className="font-head text-[20px] font-semibold text-ink">{s.title}</h3>
              <p className="mx-auto mt-2.5 max-w-[300px] text-[14.5px] leading-relaxed text-mute">{s.text}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200} className="mt-12 text-center">
          <Link href="/login?mode=signup" className={btn('primary', 'lg')}>Create your company <I name="arrow" size={16} /></Link>
        </Reveal>
      </Container>
    </section>
  )
}

function Showcase({ onDemo }: { onDemo: () => void }) {
  return (
    <section className="overflow-hidden bg-panel py-20 lg:py-24">
      <Container>
        <div className="grid items-center gap-14 lg:grid-cols-[1.25fr_1fr] lg:gap-16">
          <Reveal className="relative pb-14 lg:pb-10">
            <DesktopFrame stand src="/landing/dashboard-desktop.webp" alt="Marsandiis dashboard with welcome banner, notices and stock KPIs" />
            <div className="absolute -bottom-2 right-2 w-[115px] sm:right-8 sm:w-[155px]">
              <PhoneFrame src="/landing/dashboard-mobile.webp" alt="Marsandiis mobile view on iPhone" />
            </div>
          </Reveal>
          <div>
            <SectionHead eyebrow="Product showcase" title="Recording stock takes seconds" sub="One clean screen per task — no training manual required." />
            <div className="-mt-4 space-y-5">
              <CheckRow title="Made for the shop floor" sub="Big touch targets and a simple product sheet managers can use between customers." />
              <CheckRow title="Keeps working offline" sub="Entries are saved on the device and sync when the connection returns — never twice." />
              <CheckRow title="Supplies, gifts, damage & losses" sub="Every kind of stock movement has its own entry type, so counts stay honest." />
            </div>
            <button onClick={onDemo} className={cx(btn('ghost', 'lg'), 'mt-8 gap-2')}>
              <I name="play" size={15} /> Take the tour
            </button>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Stats() {
  const stats = [
    { v: '3', label: 'manager accounts per store' },
    { v: '1', label: 'private space per company' },
    { v: '100%', label: 'of data separated by company' },
    { v: '0', label: 'entries lost when offline' },
  ]
  return (
    <section className="lp-navy lp-grid py-16 lg:py-20">
      <Container>
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((s, i) => (
            <Reveal key={s.label} delay={i * 90} className="text-center">
              <p className="font-head text-[44px] font-semibold leading-none text-[#38a8ee]">{s.v}</p>
              <p className="mt-2.5 text-[14px] text-[#9db8cc]">{s.label}</p>
            </Reveal>
          ))}
        </div>
        <Reveal delay={200}>
          <p className="mt-10 text-center text-[12px] text-[#7d99af]">These are product facts, not customer metrics. Verified customer statistics will be published here.</p>
        </Reveal>
      </Container>
    </section>
  )
}

function Testimonials() {
  const quotes = [
    { text: 'A verified wholesale customer\u2019s story about managing stock across branches will appear here.', who: '[Customer name]', role: 'Wholesaler' },
    { text: 'A verified retail customer\u2019s story about daily entries and low-stock alerts will appear here.', who: '[Customer name]', role: 'Retail shop owner' },
    { text: 'A verified distributor\u2019s story about offline entries and forecasting will appear here.', who: '[Customer name]', role: 'Distributor' },
  ]
  return (
    <section className="bg-bg py-20 lg:py-24">
      <Container>
        <SectionHead eyebrow="Testimonials" title="What our customers will say" sub="We only publish real, verified stories — these cards are reserved for them." />
        <div className="grid gap-6 md:grid-cols-3">
          {quotes.map((q, i) => (
            <Reveal key={q.role} delay={i * 110}>
              <figure className="relative flex h-full flex-col rounded-2xl border border-dashed border-line bg-panel p-7">
                <span className="absolute right-5 top-5 rounded-full bg-accsoft px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-acc">Placeholder</span>
                <I name="quote" size={26} className="mb-4 text-acc/50" />
                <blockquote className="m-0 flex-1 text-[14.5px] italic leading-relaxed text-mute">{q.text}</blockquote>
                <figcaption className="mt-5 border-t border-line pt-4">
                  <b className="block text-[14px] text-ink">{q.who}</b>
                  <span className="text-[12.5px] text-mute">{q.role}</span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Pricing() {
  const plans = [
    {
      name: 'Free',
      tag: 'Available today',
      price: 'Free',
      per: 'during early access',
      desc: 'Everything Marsandiis does today, for every company.',
      feats: ['Your own private company space', 'Unlimited stores & products', 'Daily entries, alerts & forecasts', 'Offline mode with auto-sync', 'Reports, backups & manager accounts'],
      cta: 'Start free',
      hot: false,
    },
    {
      name: 'Standard',
      tag: 'Most popular',
      price: '[price]',
      per: 'per month · to be confirmed',
      desc: 'For growing teams that want more support and insight.',
      feats: ['Everything in Free', 'Priority support', 'Advanced exports & reports', 'Higher manager limits'],
      cta: 'Start free today',
      hot: true,
    },
    {
      name: 'Pro',
      tag: 'For larger operations',
      price: '[price]',
      per: 'per month · to be confirmed',
      desc: 'For distributors and multi-branch operations at scale.',
      feats: ['Everything in Standard', 'Dedicated onboarding', 'Custom reporting', 'Early access to sales, receipts & loans'],
      cta: 'Start free today',
      hot: false,
    },
  ]
  return (
    <section id="pricing" className="scroll-mt-20 bg-panel py-20 lg:py-24">
      <Container>
        <SectionHead eyebrow="Pricing" title="Simple plans that grow with you" sub="Start free today. Paid plans are a preview — prices will be confirmed before any billing begins." />
        <div className="grid items-stretch gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 110} className="h-full">
              <article className={cx('relative flex h-full flex-col rounded-2xl border-2 bg-bg p-8 transition-transform duration-200 hover:-translate-y-1', p.hot ? 'border-acc shadow-[0_16px_44px_rgba(22,115,187,0.18)]' : 'border-line')}>
                <span className={cx('absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide', p.hot ? 'bg-acc text-on' : 'border border-line bg-panel text-mute')}>
                  {p.tag}
                </span>
                <h3 className="font-head text-[22px] font-semibold text-ink">{p.name}</h3>
                <p className="mt-1.5 text-[13.5px] text-mute">{p.desc}</p>
                <p className="mt-5 flex items-baseline gap-2">
                  <span className={cx('font-head text-[36px] font-semibold', p.price === '[price]' ? 'text-mute' : 'text-ink')}>{p.price}</span>
                </p>
                <p className="text-[12.5px] text-mute">{p.per}</p>
                <ul className="mt-6 flex-1 space-y-3 border-t border-line pt-6">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[14px] text-ink">
                      <span className="mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-full bg-accsoft text-acc"><I name="check" size={11} sw={3} /></span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login?mode=signup" className={cx(p.hot ? btn('primary', 'lg', true) : btn('ghost', 'lg', true), 'mt-8')}>
                  {p.cta}
                </Link>
              </article>
            </Reveal>
          ))}
        </div>
        <Reveal delay={220}>
          <p className="mt-8 text-center text-[13px] text-mute">
            Marsandiis is free during early access — every account gets all current features. No card needed, and nothing is charged until plans and prices are officially announced.
          </p>
        </Reveal>
      </Container>
    </section>
  )
}

function Faq() {
  const qa = [
    { q: 'How do I register my company?', a: 'Click Get Started, enter your name, company name, email and a password. Your company name becomes your private space — if it\u2019s already taken, you\u2019ll be asked to pick another. You can also sign in with Google.' },
    { q: 'Can I manage more than one store?', a: 'Yes. Create as many stores as you need inside your company, assign products and quantities to each, and invite up to three manager accounts per store. Every store\u2019s stock is tracked separately.' },
    { q: 'Does Marsandiis work without internet?', a: 'Yes. Store managers can keep recording entries offline. Entries are stored on the device and sync automatically when the connection returns — each entry is synced once, never twice.' },
    { q: 'Is my company\u2019s data safe?', a: 'Every company\u2019s data is fully separated from all others. Access is role-based: admins manage the company, managers only see their own stores. Connections are encrypted, and admins can export a full backup at any time.' },
    { q: 'Who can record daily entries?', a: 'Store managers record customer supplies, losses and gifts from the product sheets on any phone or computer. Admins see everything across stores, plus reports and notices.' },
    { q: 'How much does it cost?', a: 'Marsandiis is free during early access — every account gets all current features with no card required. The Standard and Pro plans on this page are a preview; prices will be confirmed before any billing begins.' },
    { q: 'Can I track sales and receipts?', a: 'Invoice and sales-number search is available today. A full sales, receipts and loans suite is coming soon — Pro customers will get early access when it launches.' },
  ]
  return (
    <section id="help" className="lp-plus scroll-mt-20 bg-bg py-20 lg:py-24">
      <Container className="max-w-[820px]">
        <SectionHead eyebrow="Help & FAQ" title="Questions, answered" sub="Everything you need to know before creating your company." />
        <div className="space-y-3.5">
          {qa.map((item, i) => (
            <Reveal key={item.q} delay={i * 60}>
              <details className="lp-faq group rounded-xl border border-line bg-panel transition-colors open:border-acc/40">
                <summary className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4.5 text-[15.5px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="lp-chev grid h-7 w-7 flex-none place-items-center rounded-full bg-accsoft text-acc transition-transform duration-200"><I name="chev" size={15} /></span>
                </summary>
                <p className="m-0 px-6 pb-5 text-[14.5px] leading-relaxed text-mute">{item.a}</p>
              </details>
            </Reveal>
          ))}
        </div>
      </Container>
    </section>
  )
}

function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#1673bb] py-20 lg:py-24">
      <Image src="/landing/warehouse.jpg" alt="" fill sizes="100vw" className="object-cover opacity-70" />
      <div className="absolute inset-0 bg-gradient-to-br from-[#1673bb]/82 via-[#1b83d4]/72 to-[#38a8ee]/62" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(6,42,68,0.45),transparent_72%)]" aria-hidden="true" />
      <div className="lp-dots absolute inset-0 opacity-60" aria-hidden="true" />
      <Cubes outline className="absolute -left-8 bottom-0 w-44 opacity-50" />
      <Cubes outline className="absolute -right-6 -top-6 w-36 opacity-40" />
      <Container className="relative text-center">
        <Reveal>
          <h2 className="font-head text-[32px] font-semibold leading-[1.15] text-white sm:text-[42px]">Start managing your stock today</h2>
          <p className="mx-auto mt-4 max-w-[480px] text-[16.5px] text-[#d6ebfb]">Create your company in a minute. No card needed.</p>
          <Link
            href="/login?mode=signup"
            className="mt-8 inline-flex items-center gap-2 rounded-lg bg-white px-8 py-4 text-base font-bold text-[#1673bb] no-underline shadow-[0_10px_30px_rgba(6,32,47,0.3)] transition-all duration-150 hover:-translate-y-px hover:shadow-[0_14px_38px_rgba(6,32,47,0.4)]"
          >
            Start Free <I name="arrow" size={17} />
          </Link>
        </Reveal>
      </Container>
    </section>
  )
}

export default function LandingPage() {
  const [demo, setDemo] = useState(false)
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <Nav onDemo={() => setDemo(true)} />
      <main>
        <Hero onDemo={() => setDemo(true)} />
        <TrustedBy />
        <Problems />
        <Features />
        <HowItWorks />
        <Showcase onDemo={() => setDemo(true)} />
        <Stats />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
      <DemoModal open={demo} onClose={() => setDemo(false)} />
    </div>
  )
}