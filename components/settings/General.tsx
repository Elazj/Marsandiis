'use client'
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { friendly, q, toast } from '@/lib/data'
import { cfaRateFromGmd, gmdPerCfaBlock } from '@/lib/money'
import { supabaseBrowser } from '@/lib/supabase/client'
import { useSettings } from '@/components/SettingsProvider'
import type { DateFormat } from '@/lib/settings'
import { Row, TabHead } from './shared'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'GMD', 'XOF', 'NGN', 'GHS', 'KES', 'ZAR', 'CAD', 'AUD', 'INR', 'AED']
const FORMATS: [DateFormat, string][] = [['medium', 'Nov 8, 2026'], ['dmy', '08/11/2026'], ['mdy', '11/08/2026'], ['iso', '2026-11-08']]

export default function General() {
  const router = useRouter()
  const cur = useSettings()
  const [name, setName] = useState('')
  const [f, setF] = useState({ currency: cur.currency, dateFormat: cur.dateFormat, timeZone: cur.timeZone, gmdPer5000Cfa: cur.gmdToXofRate ? String(Number(gmdPerCfaBlock(cur.gmdToXofRate).toFixed(6))) : '', businessAddress: cur.businessAddress, businessPhone: cur.businessPhone, businessEmail: cur.businessEmail, receiptFooter: cur.receiptFooter, receiptLogoMode: cur.receiptLogoMode, receiptLogo: cur.receiptLogo })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const zones = useMemo(() => {
    try { return (Intl as any).supportedValuesOf('timeZone') as string[] } catch { return ['UTC', 'Africa/Banjul', 'Africa/Lagos', 'Europe/London', 'America/New_York'] }
  }, [])

  useEffect(() => {
    q(supabaseBrowser().from('companies').select('name').limit(1)).then((r) => setName(r?.[0]?.name ?? '')).catch(() => {})
  }, [])

  async function chooseLogo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMsg('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setMsg('Choose a JPEG, PNG or WebP image.')
    if (file.size > 2_000_000) return setMsg('Choose a logo smaller than 2 MB.')
    setLogoBusy(true)
    const url = URL.createObjectURL(file)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('invalid'))
        image.src = url
      })
      const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('unavailable')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const logo = canvas.toDataURL('image/jpeg', 0.88)
      if (logo.length > 900000) throw new Error('large')
      setF((current) => ({ ...current, receiptLogo: logo, receiptLogoMode: 'logo' }))
    } catch {
      setMsg('Could not prepare that image. Try a different logo.')
    } finally {
      URL.revokeObjectURL(url)
      setLogoBusy(false)
    }
  }

  async function save() {
    setMsg('')
    if (name.trim().length < 2) return setMsg('Enter the company or business name.')
    const gmd = Number(f.gmdPer5000Cfa)
    if (f.gmdPer5000Cfa && (!isFinite(gmd) || gmd <= 0)) return setMsg('Enter the GMD value of 5000 CFA above zero, or leave it blank.')
    const { gmdPer5000Cfa, ...settings } = f
    setBusy(true)
    const { error } = await supabaseBrowser().rpc('update_company_settings', { p_name: name.trim(), p_settings: { ...settings, gmdToXofRate: gmdPer5000Cfa ? cfaRateFromGmd(gmd) : 0 } })
    setBusy(false)
    if (error) return setMsg(friendly(error.message))
    toast('Settings saved')
    router.refresh() // every page reads the new name and formats from the server
  }

  return (<>
    <TabHead title="General Settings" desc="Company-wide defaults for how information is shown." />
    <div className="-mt-4">
      <Row title="Company name" desc="Edit the name to correct a spelling mistake. It appears on dashboards and in the side bar for you and your managers.">
        <input className="mt-0 w-full sm:w-64" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Company name" placeholder="e.g., Acme Supplies" />
      </Row>
      <Row title="Receipt branding" desc="Show your company logo above the name on new receipts, or use the company name only. Existing receipts keep their saved branding.">
        <div className="flex max-w-full flex-wrap items-center gap-3">
          {f.receiptLogo ? <img src={f.receiptLogo} alt="Company logo preview" className="h-16 w-16 rounded-lg border border-line bg-panel object-contain" /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn ghost sm" aria-pressed={f.receiptLogoMode === 'logo'} onClick={() => setF({ ...f, receiptLogoMode: 'logo' })}>Company logo</button>
            <button type="button" className="btn ghost sm" aria-pressed={f.receiptLogoMode === 'name'} onClick={() => setF({ ...f, receiptLogoMode: 'name' })}>Company name only</button>
            <label className={`btn ghost sm${logoBusy ? ' opacity-50' : ''}`}>
              {logoBusy ? 'Preparing…' : f.receiptLogo ? 'Replace logo' : 'Upload logo'}
              <input className="sr" type="file" accept="image/jpeg,image/png,image/webp" disabled={logoBusy} onChange={chooseLogo} aria-label="Upload company logo" />
            </label>
            {f.receiptLogo ? <button type="button" className="btn ghost sm" onClick={() => setF({ ...f, receiptLogo: '', receiptLogoMode: 'name' })}>Remove logo</button> : null}
          </div>
        </div>
      </Row>
      <Row title="Currency" desc="Company default. Sales invoices support GMD and XOF and always show their transaction currency.">
        <select className="mt-0 w-full sm:w-44" value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} aria-label="Currency">
          {[...new Set([f.currency, ...CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
        </select>
      </Row>
      <Row title="5000 CFA (XOF) in GMD" desc="Enter what 5000 CFA is worth in GMD today, for example 650. Update it whenever the market changes; existing invoices keep their saved rate.">
        <input className="mt-0 w-full sm:w-44" type="number" min="0" step="any" value={f.gmdPer5000Cfa} onChange={(e) => setF({ ...f, gmdPer5000Cfa: e.target.value })} aria-label="GMD value of 5000 CFA" placeholder="e.g., 650" />
      </Row>
      <Row title="Date format" desc="How dates appear in tables, sheets and the activity log.">
        <select className="mt-0 w-full sm:w-44" value={f.dateFormat} onChange={(e) => setF({ ...f, dateFormat: e.target.value as DateFormat })} aria-label="Date format">
          {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Row>
      <Row title="Time zone" desc="Used for times and daily totals. Choose the device option to follow each person's own clock.">
        <select className="mt-0 w-full sm:w-64" value={f.timeZone} onChange={(e) => setF({ ...f, timeZone: e.target.value })} aria-label="Time zone">
          <option value="">This device</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
      </Row>
      <Row title="Language" desc="The language of menus and messages. English is the only language for now.">
        <select className="mt-0 w-full sm:w-44" value="en" disabled aria-label="Language"><option value="en">English</option></select>
      </Row>
      <Row title="Business address" desc="Optional. Printed on receipts when provided.">
        <input className="mt-0 w-full sm:w-72" value={f.businessAddress} maxLength={200} onChange={(e) => setF({ ...f, businessAddress: e.target.value })} aria-label="Business address" />
      </Row>
      <Row title="Business phone" desc="Optional contact number printed on receipts.">
        <input className="mt-0 w-full sm:w-64" value={f.businessPhone} maxLength={40} onChange={(e) => setF({ ...f, businessPhone: e.target.value })} aria-label="Business phone" />
      </Row>
      <Row title="Business email" desc="Optional contact email printed on receipts.">
        <input className="mt-0 w-full sm:w-72" type="email" value={f.businessEmail} maxLength={120} onChange={(e) => setF({ ...f, businessEmail: e.target.value })} aria-label="Business email" />
      </Row>
      <Row title="Receipt footer" desc="Optional thank-you or terms printed at the bottom of receipts.">
        <input className="mt-0 w-full sm:w-72" value={f.receiptFooter} maxLength={200} onChange={(e) => setF({ ...f, receiptFooter: e.target.value })} aria-label="Receipt footer" />
      </Row>
    </div>
    <p className="err mt-3" role="alert">{msg}</p>
    <button className="btn" disabled={busy || logoBusy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</button>
  </>)
}
