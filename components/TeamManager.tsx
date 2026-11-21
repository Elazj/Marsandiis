'use client'
import { useState } from 'react'
import { Confirm, Hd, Modal } from '@/components/ui'
import { logAct, q, toast, useLive } from '@/lib/data'
import { accountsApi, listManagerAccounts } from '@/lib/accounts'
import { emailOk, genPassword, pwErr } from '@/lib/validate'
import { btn, chip, chipOut, cx, err, panel } from '@/lib/tw'

type Person = { id: string; full_name: string; email: string | null; store_id: string | null; disabled: boolean }
type Store = { id: string; name: string; active: boolean }

const copy = async (text: string) => {
  try { await navigator.clipboard.writeText(text); toast('Copied') } catch { toast('Copy failed. Select the text and copy it by hand.') }
}

// Sign in details the admin can copy and send to the manager.
function Credentials({ email, password }: { email: string; password: string }) {
  const text = `Marsandiis sign in\nAddress: ${location.origin}/login\nEmail: ${email}\nPassword: ${password}`
  return (<>
    <pre className="mb-3 whitespace-pre-wrap break-all rounded-[10px] bg-bg p-3 text-[13px]">{text}</pre>
    <button className={btn('ghost', 'sm')} onClick={() => copy(text)}>Copy these details</button>
  </>)
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [showPassword, setShowPassword] = useState(false)
  return (
    <label>Password
      <div className="mt-1 flex gap-2">
        <span className="relative min-w-0 flex-1">
          <input className="mt-0 w-full pr-11" type={showPassword ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="new-password" spellCheck={false} placeholder="Enter a password" />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded border-0 bg-transparent p-1 text-mute hover:text-ink" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {showPassword
                ? <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>
                : <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a13.7 13.7 0 0 1-3.1 3.8M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7a10.7 10.7 0 0 0 4-.8" /></>}
            </svg>
          </button>
        </span>
        <button type="button" className={cx(btn('ghost', 'sm'), 'whitespace-nowrap')} onClick={() => onChange(genPassword())}>Generate</button>
      </div>
      <span className="mt-1 block text-xs">At least 8 characters with upper and lower case letters, a number and a symbol. The manager can change it later in Settings.</span>
    </label>
  )
}

function CreateForm({ stores, counts, onClose, onDone }: { stores: Store[]; counts: Record<string, number>; onClose: () => void; onDone: () => void }) {
  const open = stores.filter((s) => s.active)
  const [f, setF] = useState({ name: '', email: '', store: open.find((s) => (counts[s.id] ?? 0) < 3)?.id ?? '', password: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [made, setMade] = useState<{ email: string; password: string } | null>(null)
  async function save() {
    const name = f.name.trim(), email = f.email.trim().toLowerCase()
    if (name.length < 2) return setMsg('Enter the full name.')
    if (!emailOk(email)) return setMsg('Enter a valid email address.')
    if (!f.store) return setMsg('Choose a store.')
    const pe = pwErr(f.password); if (pe) return setMsg(pe)
    setBusy(true); setMsg('')
    const e = await accountsApi('POST', { name, email, storeId: f.store, password: f.password })
    setBusy(false)
    if (e) return setMsg(e)
    await logAct(`Created store manager account for ${name} (${email})`)
    onDone(); setMade({ email, password: f.password })
  }
  if (!open.length) return <><p className="mt-0 text-mute">Add a store first under Stores, then create the account.</p><div className="mt-2 flex justify-end"><button className={btn('ghost')} onClick={onClose}>Close</button></div></>
  if (made) return (<>
    <p className="mt-0 text-mute">Account created. The manager can sign in right away.</p>
    <Credentials email={made.email} password={made.password} />
    <div className="mt-2 flex justify-end"><button className={btn()} onClick={onClose}>Done</button></div>
  </>)
  return (<>
    <label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={80} autoComplete="name" placeholder="e.g., Alex Johnson" /></label>
    <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" placeholder="name@example.com" /></label>
    <label>Store (up to 3 accounts each)
      <select value={f.store} onChange={(e) => setF({ ...f, store: e.target.value })}>
        {open.map((s) => <option key={s.id} value={s.id} disabled={(counts[s.id] ?? 0) >= 3}>{s.name} ({counts[s.id] ?? 0}/3 accounts)</option>)}
      </select>
    </label>
    <PasswordField value={f.password} onChange={(v) => setF({ ...f, password: v })} />
    <p className={err} role="alert">{msg}</p>
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      <button className={btn('ghost')} onClick={onClose}>Cancel</button>
      <button className={btn()} disabled={busy} onClick={save}>{busy ? 'Creating…' : 'Create account'}</button>
    </div>
  </>)
}

function PasswordForm({ person, onClose }: { person: Person; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  async function save() {
    const pe = pwErr(pw); if (pe) return setMsg(pe)
    setBusy(true); setMsg('')
    const e = await accountsApi('PATCH', { id: person.id, action: 'password', password: pw })
    setBusy(false)
    if (e) return setMsg(e)
    await logAct(`Set a new password for ${person.full_name}`)
    setDone(true)
  }
  if (done) return (<>
    <p className="mt-0 text-mute">Password updated.</p>
    <Credentials email={person.email ?? ''} password={pw} />
    <div className="mt-2 flex justify-end"><button className={btn()} onClick={onClose}>Done</button></div>
  </>)
  return (<>
    <p className="mt-0 text-mute">Set a new password for <b>{person.full_name}</b>.</p>
    <PasswordField value={pw} onChange={setPw} />
    <p className={err} role="alert">{msg}</p>
    <div className="mt-2 flex flex-wrap justify-end gap-2">
      <button className={btn('ghost')} onClick={onClose}>Cancel</button>
      <button className={btn()} disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Set password'}</button>
    </div>
  </>)
}

export default function TeamManager({ embedded = false }: { embedded?: boolean }) {
  const { data: d, err: loadErr, reload } = useLive<any>(async (sb) => ({
    people: await listManagerAccounts(),
    stores: await q(sb.from('stores').select('id, name, active').order('name')),
  }), ['profiles', 'stores'])
  const [creating, setCreating] = useState(false)
  const [pwFor, setPwFor] = useState<Person | null>(null)
  const [toggle, setToggle] = useState<Person | null>(null)
  const [del, setDel] = useState<Person | null>(null)

  if (loadErr) return <p className={err}>{/does not exist|column/i.test(loadErr) ? 'The database needs one update: run supabase/migration-004.sql in the Supabase SQL editor, then reload.' : loadErr}</p>
  if (!d) return <p className="text-mute">Loading…</p>
  const people: Person[] = d.people, stores: Store[] = d.stores
  const counts: Record<string, number> = {}
  people.forEach((p) => { if (p.store_id) counts[p.store_id] = (counts[p.store_id] ?? 0) + 1 })
  const sName = (id: string | null) => stores.find((s) => s.id === id)?.name ?? 'No store'

  async function move(p: Person, storeId: string) {
    if (!storeId || storeId === p.store_id) return
    const error = await accountsApi('PATCH', { id: p.id, action: 'store', storeId })
    if (error) return toast(error)
    toast(`${p.full_name} now works at ${sName(storeId)}`)
    await logAct(`Moved ${p.full_name} to ${sName(storeId)}`)
    reload()
  }

  return (<>
    {embedded
      ? <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="m-0 font-head text-2xl">User Management</h2><p className="mb-0 mt-1.5 text-sm text-mute">Store manager accounts of your company. Up to 3 accounts per store.</p></div>
          <button className={btn()} onClick={() => setCreating(true)}>Add manager</button>
        </div>
      : <Hd title="Team" sub="Create store manager accounts, set their passwords and choose their store.">
          <button className={btn()} onClick={() => setCreating(true)}>Create account</button>
        </Hd>}
    <div className={embedded ? '' : panel}>
      {people.length ? (
        <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
          <thead><tr><th>Name</th><th>Email</th><th>Store</th><th>Status</th><th /></tr></thead>
          <tbody>{people.map((p) => (
            <tr key={p.id}>
              <td>{p.full_name}</td>
              <td>{p.email}</td>
              <td>
                <select className="mt-0 w-auto min-w-[170px]" aria-label={`Store for ${p.full_name}`} value={p.store_id ?? ''} onChange={(e) => move(p, e.target.value)}>
                  {!p.store_id ? <option value="">No store yet</option> : null}
                  {stores.filter((s) => s.active || s.id === p.store_id).map((s) => (
                    <option key={s.id} value={s.id} disabled={s.id !== p.store_id && (counts[s.id] ?? 0) >= 3}>{s.name} ({counts[s.id] ?? 0}/3)</option>
                  ))}
                </select>
              </td>
              <td><span className={p.disabled ? chipOut : chip}>{p.disabled ? 'Disabled' : 'Active'}</span></td>
              <td><div className="flex gap-1.5">
                <button className={btn('ghost', 'sm')} onClick={() => setPwFor(p)}>Set password</button>
                <button className={btn('ghost', 'sm')} onClick={() => setToggle(p)}>{p.disabled ? 'Enable' : 'Disable'}</button>
                <button className={btn('ghost', 'sm')} onClick={() => setDel(p)}>Delete</button>
              </div></td>
            </tr>
          ))}</tbody>
        </table></div>
      ) : <p className="m-0 text-mute">No store manager accounts yet. Choose Create account to add the first one.</p>}
    </div>
    <p className="mt-3 text-[13px] text-mute">Accounts you create work straight away, with no email confirmation. Disabling an account stops the manager signing in without deleting their entries.</p>

    <Modal open={creating} title="Create store manager account" onClose={() => setCreating(false)}>
      <CreateForm stores={stores} counts={counts} onClose={() => setCreating(false)} onDone={reload} />
    </Modal>
    <Modal open={!!pwFor} title="Set password" onClose={() => setPwFor(null)}>
      {pwFor ? <PasswordForm person={pwFor} onClose={() => setPwFor(null)} /> : null}
    </Modal>
    <Confirm open={!!toggle} title={toggle?.disabled ? 'Enable account' : 'Disable account'} label={toggle?.disabled ? 'Enable' : 'Disable'} onClose={() => setToggle(null)}
      text={toggle?.disabled ? `Let ${toggle?.full_name} sign in again?` : `${toggle?.full_name} will not be able to sign in. Their entries stay. You can enable the account again at any time.`}
      onConfirm={async () => { const e = await accountsApi('PATCH', { id: toggle!.id, action: toggle!.disabled ? 'enable' : 'disable' }); if (!e) { await logAct(`${toggle!.disabled ? 'Enabled' : 'Disabled'} the account of ${toggle!.full_name}`); reload() } return e }} />
    <Confirm open={!!del} title="Delete account" label="Delete account" onClose={() => setDel(null)}
      text={`Delete the account of ${del?.full_name}? This cannot be undone. An account that has recorded entries cannot be deleted. Disable it instead.`}
      onConfirm={async () => { const e = await accountsApi('DELETE', { id: del!.id }); if (!e) { await logAct(`Deleted the account of ${del!.full_name}`); reload() } return e }} />
  </>)
}
