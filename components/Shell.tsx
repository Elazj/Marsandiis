'use client'
import { ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Modal, ToastHost } from '@/components/ui'
import { AdminSheet } from '@/components/Sheet'
import OfflineBar from '@/components/OfflineBar'
import { Icon } from '@/components/icons'
import SignOut from '@/components/SignOut'
import ThemeToggle from '@/components/ThemeToggle'
import { clearDownloadHistory, DownloadHistoryItem, subscribeDownloadHistory, useLive } from '@/lib/data'
import { AdminDashboardDateRange, readAdminDashboardDateRange, setAdminDashboardDateRange, subscribeAdminDashboardDateRange } from '@/lib/dashboardDate'
import { searchSupplyEntries, SupplySearchResult } from '@/lib/supplySearch'
import { supabaseBrowser } from '@/lib/supabase/client'
import { cx, iconbtn } from '@/lib/tw'

const NAV: Record<string, [string, string, string][]> = {
  admin: [['/admin', 'Dashboard', 'dashboard'], ['/admin/stores', 'Stores', 'stores'], ['/admin/team', 'Team', 'users'], ['/admin/products', 'Products', 'products'], ['/admin/sales', 'Sales / Invoices', 'sales'], ['/admin/supplies', 'Supplies', 'supplies'], ['/admin/forecast', 'Forecast', 'forecast'], ['/admin/reports', 'Reports', 'reports'], ['/admin/settings', 'Settings', 'settings']],
  manager: [['/manager', 'Dashboard', 'dashboard'], ['/manager/entry', 'Daily entry', 'entry'], ['/manager/scan', 'Scan out', 'scan'], ['/manager/forecast', 'Forecast', 'forecast'], ['/manager/reports', 'Reports', 'reports'], ['/manager/settings', 'Settings', 'settings']],
}

const linkCls = (active: boolean) => cx(
  'flex items-center justify-start gap-2.5 rounded-lg px-2.5 py-2 no-underline transition-colors [@media(pointer:coarse)]:min-h-11',
  active ? 'bg-accsoft font-semibold text-acc shadow-[inset_3px_0_0_var(--acc)]' : 'text-mute hover:bg-bg',
)

function GlobalSearch({ role, userId }: { role: 'admin' | 'manager'; userId: string }) {
  const router = useRouter()
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [supplyResults, setSupplyResults] = useState<SupplySearchResult[]>([])
  const [supplyBusy, setSupplyBusy] = useState(false)
  const [supplyError, setSupplyError] = useState('')
  const [selectedSupply, setSelectedSupply] = useState<SupplySearchResult | null>(null)
  const items = NAV[role].filter(([, label]) => label.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)

  useEffect(() => {
    const term = query.trim()
    if (!term || (role === 'manager' && !userId)) {
      setSupplyResults([])
      setSupplyBusy(false)
      setSupplyError('')
      return
    }

    let stale = false
    setSupplyResults([])
    setSupplyBusy(true)
    setSupplyError('')
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchSupplyEntries(term, 6, role === 'manager' ? userId : undefined)
        if (!stale) {
          setSupplyResults(results)
          setSupplyError('')
        }
      } catch (error) {
        if (!stale) {
          setSupplyResults([])
          setSupplyError(error instanceof Error ? error.message : 'Supply search failed')
        }
      } finally {
        if (!stale) setSupplyBusy(false)
      }
    }, 300)
    return () => { stale = true; window.clearTimeout(timer) }
  }, [query, role, userId])

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(true)
        input.current?.focus()
      }
      if (event.key === 'Escape') setOpen(false)
    }
    const pointerdown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', keydown)
    document.addEventListener('pointerdown', pointerdown)
    return () => {
      window.removeEventListener('keydown', keydown)
      document.removeEventListener('pointerdown', pointerdown)
    }
  }, [])

  function visit(href: string) {
    router.push(href)
    setQuery('')
    setSupplyResults([])
    setOpen(false)
    input.current?.blur()
  }

  function openSupply(supply: SupplySearchResult) {
    if (role === 'manager') {
      router.push(`/manager/entry/${supply.supply_id}`)
      setQuery('')
      setSupplyResults([])
      setOpen(false)
      input.current?.blur()
      return
    }
    setSelectedSupply(supply)
    setQuery('')
    setSupplyResults([])
    setOpen(false)
    input.current?.blur()
  }

  return (
    <>
    <div ref={root} className="relative mx-auto hidden min-w-0 max-w-[480px] flex-1 lg:block">
      <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-mute" />
      <input ref={input} value={query} onFocus={() => setOpen(true)} onChange={(event) => { setQuery(event.target.value); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (items[0]) { event.preventDefault(); visit(items[0][0]) }
            else if (supplyResults[0]) { event.preventDefault(); openSupply(supplyResults[0]) }
          }
        }}
        type="search" role="combobox" aria-label="Search pages or supplies" aria-expanded={open} aria-controls="global-search-results" aria-autocomplete="list"
        placeholder="Search pages or invoice/sales number..." className="m-0 h-10 w-full rounded-lg border border-line bg-bg py-0 pl-10 pr-16 text-sm outline-none placeholder:text-mute focus:border-acc focus:outline focus:outline-2 focus:outline-acc" />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line bg-panel px-1.5 py-0.5 text-[11px] text-mute max-sm:hidden">Ctrl K</kbd>
      {open ? <div id="global-search-results" role="listbox" className="absolute left-0 right-0 top-[calc(100%+8px)] z-[70] max-h-[min(60vh,360px)] overflow-auto rounded-lg border border-line bg-panel p-1.5 shadow-panel">
        {items.length ? <>
          <p className="m-0 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-mute">Pages</p>
          {items.map(([href, label, icon]) => (
          <button key={href} type="button" role="option" aria-selected="false" onClick={() => visit(href)} className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-sm text-ink hover:bg-bg">
            <Icon name={icon} size={17} className="text-mute" />{label}<span className="ml-auto text-xs text-mute">Open</span>
          </button>
          ))}
        </> : null}
        {query.trim() ? <>
          <p className="m-0 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-mute">{role === 'manager' ? 'Your supply entries' : 'Supply entries'}</p>
          {supplyResults.map((item) => (
            <button key={item.id} type="button" role="option" aria-selected="false" onClick={() => openSupply(item)} className="flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-2.5 text-left text-sm text-ink hover:bg-bg">
              <Icon name="supplies" size={17} className="flex-none text-mute" />
              <span className="min-w-0 flex-1 truncate"><b>{item.supply_ref}</b><span className="text-mute"> · {item.customer}</span></span>
              <span className="hidden max-w-28 truncate text-xs text-mute sm:block">{item.supplies?.products?.name}</span>
            </button>
          ))}
          {supplyError ? <p className="m-0 px-2.5 py-2 text-sm text-bad" role="alert">{supplyError}</p> : null}
          {supplyBusy ? <p className="m-0 px-2.5 py-2 text-sm text-mute" role="status">Searching supply entries…</p> : null}
          {!supplyError && !supplyBusy && !supplyResults.length ? <p className="m-0 px-2.5 py-2 text-sm text-mute">{role === 'manager' ? 'No matching entries you recorded' : 'No matching supply entries'}</p> : null}
        </> : null}
        {!items.length && !query.trim() ? <p className="m-0 px-3 py-2 text-sm text-mute">No matching pages</p> : null}
      </div> : null}
    </div>
    <Modal open={!!selectedSupply} wide title="Supply sheet" onClose={() => setSelectedSupply(null)}>
      {selectedSupply ? <AdminSheet supplyId={selectedSupply.supply_id} onClose={() => setSelectedSupply(null)} onOpen={(supplyId) => setSelectedSupply({ ...selectedSupply, supply_id: supplyId })} /> : null}
    </Modal>
    </>
  )
}

function AdminDateRangePicker({ className }: { className?: string }) {
  const [range, setRange] = useState<AdminDashboardDateRange>({ start: '', end: '' })

  useEffect(() => {
    setRange(readAdminDashboardDateRange())
    return subscribeAdminDashboardDateRange(setRange)
  }, [])

  function change(field: keyof AdminDashboardDateRange, value: string) {
    let next = { ...range, [field]: value }
    if (next.start && next.end && next.start > next.end) {
      next = field === 'start' ? { ...next, end: next.start } : { ...next, start: next.end }
    }
    setRange(next)
    if (next.start && next.end) setAdminDashboardDateRange(next)
  }

  function restoreIfIncomplete() {
    if (!range.start || !range.end) setRange(readAdminDashboardDateRange())
  }

  return <div className={cx('flex h-9 min-w-0 items-center gap-0.5 rounded-lg border border-line bg-bg px-1 sm:h-10 sm:gap-1.5 sm:px-2', className)} aria-label="Dashboard date range">
    <Icon name="calendar" size={17} className="hidden flex-none text-mute sm:block" />
    <label className="sr">Start date</label>
    <input type="date" value={range.start} onChange={(event) => change('start', event.target.value)} onBlur={restoreIfIncomplete} aria-label="Start date" className="m-0 h-7 w-[68px] min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] text-ink focus:outline focus:outline-2 focus:outline-acc min-[380px]:w-[80px] sm:h-8 sm:w-[128px] sm:flex-none sm:text-[12px]" />
    <span className="px-0.5 text-[10px] text-mute sm:text-[11px]">-</span>
    <label className="sr">End date</label>
    <input type="date" value={range.end} onChange={(event) => change('end', event.target.value)} onBlur={restoreIfIncomplete} aria-label="End date" className="m-0 h-7 w-[68px] min-w-0 flex-1 border-0 bg-transparent p-0 text-[10px] text-ink focus:outline focus:outline-2 focus:outline-acc min-[380px]:w-[80px] sm:h-8 sm:w-[128px] sm:flex-none sm:text-[12px]" />
  </div>
}

function CurrentDateTime() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [])
  const label = now?.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  return <time dateTime={now?.toISOString()} title={label ?? 'Current date and time'} className="hidden whitespace-nowrap text-xs text-mute lg:block">
    {label ?? 'Current date and time'}
  </time>
}

function Notifications({ role, count }: { role: 'admin' | 'manager'; count: number }) {
  return <Link href={`/${role}/reports`} className="relative grid h-10 w-10 flex-none place-items-center rounded-lg text-ink no-underline hover:bg-bg" aria-label={`${count} report notifications`} title="Notifications">
    <Icon name="bell" />
    {count > 0 ? <span className="absolute right-0.5 top-0.5 min-w-[17px] rounded-full bg-bad px-1 text-center text-[10px] leading-[17px] text-white">{count > 99 ? '99+' : count}</span> : null}
  </Link>
}

function DownloadsMenu({ userId }: { userId: string }) {
  const [items, setItems] = useState<DownloadHistoryItem[]>([])
  const menu = useRef<HTMLDetailsElement>(null)

  useEffect(() => subscribeDownloadHistory(userId, setItems), [userId])

  function clear() {
    clearDownloadHistory(userId)
    setItems([])
    if (menu.current) menu.current.open = false
  }

  return <details ref={menu} className="group relative flex-none">
    <summary aria-label={`${items.length} downloads`} title="Downloads" className="relative grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg text-ink hover:bg-bg focus-visible:outline focus-visible:outline-2 focus-visible:outline-acc [&::-webkit-details-marker]:hidden">
      <Icon name="download" />
      {items.length ? <span className="absolute right-0.5 top-0.5 min-w-[17px] rounded-full bg-acc px-1 text-center text-[10px] leading-[17px] text-white">{items.length > 99 ? '99+' : items.length}</span> : null}
    </summary>
    <div className="absolute right-0 top-[calc(100%+8px)] z-[70] w-[min(320px,calc(100vw-24px))] overflow-hidden rounded-lg border border-line bg-panel shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <b className="text-sm">Downloads</b>
        {items.length ? <button type="button" onClick={clear} className="cursor-pointer border-0 bg-transparent p-1 text-xs font-medium text-mute hover:text-ink">Clear history</button> : null}
      </div>
      {items.length ? <ul className="m-0 max-h-[min(60vh,360px)] list-none overflow-y-auto p-1.5">
        {items.map((item) => <li key={item.id} className="flex items-start gap-2.5 rounded-md px-2 py-2 hover:bg-bg">
          <Icon name="download" size={16} className="mt-0.5 flex-none text-mute" />
          <span className="min-w-0 flex-1"><b className="block break-all text-[13px] font-medium">{item.name}</b><time className="block text-[11px] text-mute">{new Date(item.downloadedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</time></span>
        </li>)}
      </ul> : <p className="m-0 px-3 py-4 text-sm text-mute">No Marsandiis downloads yet.</p>}
    </div>
  </details>
}

function ProfileMenu({ role, name, avatarUrl }: { role: 'admin' | 'manager'; name: string; avatarUrl?: string }) {
  const label = role === 'admin' ? 'Administrator' : 'Store manager'
  return <details className="group relative flex-none">
    <summary aria-label={`${name}, ${label} account menu`} className="flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 text-ink hover:bg-bg [&::-webkit-details-marker]:hidden sm:px-2">
      {avatarUrl ? <img src={avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-accsoft text-acc"><Icon name="user" size={18} /></span>}
      <span className="hidden max-w-32 text-left sm:block"><b className="block truncate text-xs leading-4">{name}</b><span className="block text-[11px] leading-4 text-mute">{label}</span></span>
      <Icon name="chevron" size={15} className="hidden rotate-90 text-mute sm:block" />
    </summary>
    <div className="absolute right-0 top-[calc(100%+8px)] z-[70] w-56 rounded-lg border border-line bg-panel p-1.5 shadow-panel">
      <div className="border-b border-line px-2.5 py-2"><b className="block truncate text-sm">{name}</b><span className="text-xs text-mute">{label}</span></div>
      <Link href={`/${role}/settings/profile`} className="block rounded-md px-2.5 py-2 text-sm text-ink no-underline hover:bg-bg">Profile</Link>
      <Link href={`/${role}/settings`} className="block rounded-md px-2.5 py-2 text-sm text-ink no-underline hover:bg-bg">Settings</Link>
      <div className="border-t border-line px-2.5 pt-2"><SignOut /></div>
    </div>
  </details>
}

export default function Shell({ role, name, userId, sub, company, avatarUrl, firstAdminLogin = false, children }: { role: 'admin' | 'manager'; name: string; userId: string; sub?: string; company?: string; avatarUrl?: string; firstAdminLogin?: boolean; children: ReactNode }) {
  const path = usePathname()
  const [open, setOpen] = useState(false) // side bar on small screens
  const welcomeRecorded = useRef(false)
  const on = (h: string) => (h === '/' + role ? path === h : path.startsWith(h))
  const [showCompany, setShowCompany] = useState(true) // Appearance > show the company name in the navigation bar
  const { data } = useLive(async (sb) => {
    const { count, error } = await sb.from('reports').select('id', { count: 'exact', head: true }).eq('resolved', role === 'admin' ? false : true)
    if (error) throw new Error(error.message)
    return count ?? 0
  }, ['reports'], `nav-reports-${role}`)
  const reportCount = data ?? 0

  useEffect(() => {
    setShowCompany(localStorage.getItem('stockroom-hide-company') !== '1')
    window.addEventListener('stockroom-appearance', () => setShowCompany(localStorage.getItem('stockroom-hide-company') !== '1'))
    return () => window.removeEventListener('stockroom-appearance', () => setShowCompany(localStorage.getItem('stockroom-hide-company') !== '1'))
  }, [])

  useEffect(() => {
    if (role !== 'admin' || !firstAdminLogin || path !== '/admin' || welcomeRecorded.current) return
    welcomeRecorded.current = true
    void (async () => {
      try {
        const result = await supabaseBrowser().auth.updateUser({ data: { stockroom_admin_welcome_seen: true } })
        if (result.error) throw new Error(result.error.message)
      } catch (error) {
        welcomeRecorded.current = false
        const message = error instanceof Error ? error.message : 'Unknown error'
        window.dispatchEvent(new CustomEvent('toast', { detail: `Could not save welcome status: ${message}` }))
      }
    })()
  }, [firstAdminLogin, path, role])

  useEffect(() => { setOpen(false) }, [path]) // close after choosing a tab

  useEffect(() => {
    document.body.classList.toggle('nav-open', open) // stops the page scrolling behind the side bar
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('nav-open') }
  }, [open])

  useEffect(() => { // close if the screen grows to desktop size
    const mq = matchMedia('(min-width: 1100px)')
    const h = () => { if (mq.matches) setOpen(false) }
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  return (
    <div className="min-h-dvh lg:flex">
      {/* dark area behind the open side bar */}
      <div onClick={() => setOpen(false)} aria-hidden="true"
        className={cx('fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden', open ? 'opacity-100' : 'pointer-events-none opacity-0')} />

      <aside id="sidebar" aria-label="Main menu"
        className={cx(
          'fixed inset-y-0 left-0 z-[60] flex h-dvh w-[min(300px,86vw)] flex-col gap-1 overflow-y-auto border-r border-line bg-panel pl-[calc(12px_+_env(safe-area-inset-left,0px))] pr-3 pt-[calc(16px_+_env(safe-area-inset-top,0px))] pb-[calc(16px_+_env(safe-area-inset-bottom,0px))] shadow-panel transition-[transform,visibility] duration-200 ease-out',
          'lg:sticky lg:inset-y-auto lg:top-0 lg:bottom-auto lg:z-auto lg:h-dvh lg:w-[230px] lg:flex-none lg:visible lg:translate-x-0 lg:pb-5 lg:pl-3 lg:pt-5 lg:shadow-none lg:transition-none',
          open ? 'visible translate-x-0' : 'invisible -translate-x-[105%]',
        )}>
        <div className="flex items-center gap-2.5 px-2 pb-4 font-head text-[21px] font-semibold">
          <img src="/logo-icon.svg" alt="" width={30} height={30} />
          <span className="bg-stockroom bg-clip-text text-transparent">Marsandiis</span>
          <button className={cx(iconbtn, 'ml-auto lg:hidden')} aria-label="Close menu" onClick={() => setOpen(false)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV[role].map(([h, l, ic]) => (
            <Link key={h} href={h} className={linkCls(on(h))} aria-current={on(h) ? 'page' : undefined}>
              <Icon name={ic} />{l}{role === 'admin' && h === '/admin/reports' && reportCount > 0 ? <span className="ml-auto rounded-full bg-bad px-[7px] text-[11px] text-white">{reportCount}</span> : null}
            </Link>
          ))}
        </nav>
        <Link href={`/${role}/settings/help`} aria-current={path === `/${role}/settings/help` ? 'page' : undefined}
          className={cx(linkCls(path === `/${role}/settings/help`), 'mt-auto')}>
          <Icon name="help" />Help &amp; Support<Icon name="chevron" size={18} className="ml-auto text-mute" />
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-50 w-full border-b border-line bg-panel/95 shadow-[0_1px_3px_rgba(15,42,61,0.06)] backdrop-blur">
        <div className="flex min-h-16 w-full flex-nowrap items-center gap-1 px-2 py-2 sm:gap-3 sm:px-4 lg:px-6 lg:py-0">
          <button className={cx(iconbtn, 'lg:hidden')} aria-label="Open menu" aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(true)}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <CurrentDateTime />
          <GlobalSearch role={role} userId={userId} />
          <div className="ml-auto flex min-w-0 items-center gap-0.5 sm:gap-1.5">
            {role === 'admin' ? <>
              <AdminDateRangePicker className="min-w-0 flex-1 lg:hidden" />
              <AdminDateRangePicker className="hidden flex-none lg:flex" />
            </> : null}
            <Notifications role={role} count={reportCount} />
            <DownloadsMenu userId={userId} />
            <ThemeToggle compact />
            <ProfileMenu role={role} name={name} avatarUrl={avatarUrl} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full min-w-0 max-w-[1200px] px-3 pb-9 pt-3.5 min-[1500px]:max-w-[1360px] sm:px-[18px] sm:pt-[18px] lg:px-7 lg:pb-12 lg:pt-6 [&>*]:animate-fadeup">
        {path === `/${role}` ? <section className="mb-5 rounded-lg border border-line bg-accsoft px-4 py-3.5 sm:px-5">
          <p className="mb-0.5 mt-0 text-xs font-semibold text-mute">{showCompany && company ? `${company} · ` : ''}{role === 'admin' ? 'Administrator' : sub || 'Store manager'}</p>
          <p className="m-0 font-head text-xl font-semibold sm:text-2xl">{role === 'admin' && firstAdminLogin ? `Welcome onboard, ${name}` : `Welcome back, ${name}`}</p>
        </section> : null}
        {role === 'manager' ? <OfflineBar /> : null}
        {children}
      </main>
      </div>
      <ToastHost />
    </div>
  )
}
