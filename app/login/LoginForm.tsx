'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import ThemeToggle from '@/components/ThemeToggle'
import { supabaseBrowser } from '@/lib/supabase/client'
import { SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabase/env'
import { markSessionActive } from '@/lib/session'
import { emailOk, pwErr } from '@/lib/validate'
import { btn, cx, errBase } from '@/lib/tw'
import { I, Cubes, CheckRow } from '@/components/landing/shared'

type Conn = 'checking' | 'ok' | 'missing' | 'unreachable' | 'badkey'
const NET = /failed to fetch|networkerror|load failed|fetch failed/i
const COMPANY_EXISTS = 'Account/company name already exists. Choose a different company name.'

export function LoginForm() {
  const searchParams = useSearchParams()
  const sb = supabaseBrowser()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [f, setF] = useState({ name: '', company: '', email: '', pw: '', pw2: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [msg, setMsg] = useState('')
  const [good, setGood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [conn, setConn] = useState<Conn>('checking')

  // Initialize mode from URL
  useEffect(() => {
    const urlMode = searchParams.get('mode')
    if (urlMode === 'signup') setMode('signup')
  }, [searchParams])

  // Connection check
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reason') === 'idle') {
      setMsg('You were signed out after being inactive.')
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setConn('missing')
      return
    }
    fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => setConn(r.status === 401 || r.status === 403 ? 'badkey' : 'ok'))
      .catch(() => setConn('unreachable'))
  }, [])

  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value })
  const bad = (m: string) => { setGood(false); setMsg(NET.test(m) ? 'Cannot reach the server. See the red notice above for what to check.' : m) }
  const host = SUPABASE_URL.replace(/^https?:\/\//, '')
  const tidy = (v: string) => v.trim().replace(/\s+/g, ' ')

  async function companyTaken(name: string) {
    try { const { data, error } = await sb.rpc('company_name_taken', { p_name: name }); return !error && data === true }
    catch { return false }
  }

  async function submit() {
    setMsg(''); setBusy(true)
    try {
      const email = f.email.trim().toLowerCase()
      if (!emailOk(email)) return bad('Enter a valid email address, like name@company.com.')
      if (mode === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: f.pw })
        if (error) return bad(/not confirmed/i.test(error.message) ? 'Confirm your email first. Check your inbox.' : NET.test(error.message) ? error.message : /banned|disabled/i.test(error.message) ? 'This account has been disabled. Ask your admin.' : 'Email or password is incorrect.')
        if (data.user?.id) markSessionActive(data.user.id)
        window.location.href = '/'
        return
      }
      if (f.name.trim().length < 2) return bad('Enter your full name.')
      const company = tidy(f.company)
      if (company.length < 2) return bad('Enter your company or business name.')
      if (company.length > 80) return bad('The company name can have at most 80 characters.')
      const e = pwErr(f.pw); if (e) return bad(e)
      if (f.pw !== f.pw2) return bad('Passwords do not match.')
      if (await companyTaken(company)) return bad(COMPANY_EXISTS)
      const { error } = await sb.auth.signUp({
        email, password: f.pw,
        options: { emailRedirectTo: window.location.origin + '/auth/callback', data: { full_name: f.name.trim(), role: 'admin', company_name: company, stockroom_admin_welcome_seen: false } },
      })
      if (error) {
        if (/database error saving new user/i.test(error.message)) return bad((await companyTaken(company)) ? COMPANY_EXISTS : 'Could not create the account. Try again in a moment.')
        return bad(error.message)
      }
      setGood(true); setMsg('Check your inbox and confirm your email, then log in.')
    } catch (err: any) {
      bad(err?.message ?? 'Something went wrong. Try again.')
    } finally { setBusy(false) }
  }

  async function google() {
    try { const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + '/auth/callback' } }); if (error) bad(error.message) }
    catch (err: any) { bad(err?.message ?? 'Google sign-in failed.') }
  }

  const signup = mode === 'signup'
  const switchMode = (m: 'login' | 'signup') => { setMode(m); setMsg(''); setShowPassword(false); setShowConfirmPassword(false) }

  const tab = (active: boolean) => cx(
    'flex-1 cursor-pointer rounded-[8px] border-0 px-2 py-2.5 text-[14.5px] font-semibold transition-all',
    active ? 'bg-panel text-acc shadow-sm' : 'bg-transparent text-mute hover:text-ink'
  )

  const notice = 'mb-4 rounded-[10px] border border-bad/20 bg-badsoft px-3.5 py-2.5 text-[13px] leading-relaxed text-bad'
  const label = 'mb-4 block'
  const labelText = 'block text-[13.5px] font-semibold text-ink'
  const eyeBtn = 'absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-mute transition-colors hover:text-acc'

  return (
    <div className="min-h-dvh bg-bg md:grid md:grid-cols-[44fr_56fr] lg:grid-cols-2">
      <div className="fixed right-[calc(14px_+_env(safe-area-inset-right,0px))] top-[calc(14px_+_env(safe-area-inset-top,0px))] z-20">
        <ThemeToggle />
      </div>

      {/* Left: branding panel */}
      <div className="lp-navy relative hidden overflow-hidden md:flex md:flex-col md:justify-between md:p-10 lg:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(22,115,187,0.45)_0%,transparent_55%)]" aria-hidden="true" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(56,168,238,0.25)_0%,transparent_55%)]" aria-hidden="true" />
        <div className="lp-dots absolute inset-0" aria-hidden="true" />
        <Cubes className="absolute -bottom-8 -right-8 w-52 opacity-30" />

        <Link href="/" className="relative flex items-center gap-3 no-underline" aria-label="Marsandiis home">
          <Image src="/logo-icon.svg" alt="" width={38} height={38} className="h-9 w-9 drop-shadow-[0_6px_20px_rgba(22,115,187,0.5)]" />
          <span className="font-head text-[26px] font-semibold text-white">Marsandiis</span>
        </Link>

        <div className="relative max-w-[440px] py-10">
          <h1 className="font-head text-[34px] font-semibold leading-[1.15] text-white lg:text-[42px]">
            Take Control of<br />Your <span className="bg-gradient-to-r from-[#38a8ee] to-[#8fd0f8] bg-clip-text text-transparent">Inventory.</span>
          </h1>
          <p className="mt-5 text-[16px] leading-relaxed text-[#9db8cc]">
            Manage your products, monitor stock levels, and control all your stores from one powerful platform.
          </p>
          <div className="mt-9 space-y-5">
            <CheckRow onNavy title="Every store in one place" sub="Stock, entries and reports across all your branches." />
            <CheckRow onNavy title="Alerts before shelves run empty" sub="Low-stock notices and usage forecasts, days ahead." />
            <CheckRow onNavy title="Works even without internet" sub="Offline entries sync automatically — never twice." />
            <CheckRow onNavy title="Your data stays private" sub="Each company has its own fully separated space." />
          </div>
        </div>

        <p className="relative m-0 text-[12.5px] text-[#7d99af]">© 2025 Marsandiis. All rights reserved.</p>
      </div>

      {/* Right: form panel */}
      <main className="relative flex min-h-dvh items-center justify-center px-5 py-10 sm:px-8 md:min-h-0 md:py-14">
        <div className="lp-dots pointer-events-none absolute inset-0 opacity-60 md:opacity-40" aria-hidden="true" />
        <div className="relative w-full max-w-[460px]">
          <div className="mb-7 text-center md:hidden">
            <Link href="/" className="inline-flex items-center gap-2.5 no-underline" aria-label="Marsandiis home">
              <Image src="/logo-icon.svg" alt="" width={40} height={40} className="h-10 w-10" />
              <span className="font-head text-[26px] font-semibold text-ink">Marsandiis</span>
            </Link>
            <p className="mt-2 text-[14px] text-mute">Stock balances for every store, in one place.</p>
          </div>

          {conn === 'missing' && <div className={notice} role="alert">The Supabase address or key is missing. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (in .env.local, or in Vercel then redeploy).</div>}
          {conn === 'unreachable' && <div className={notice} role="alert">Cannot reach Supabase at <b>{host}</b>. Check that: the project is not paused (open the Supabase dashboard and Restore it); the URL has no typo, quotes or spaces; no ad blocker or firewall blocks supabase.co; and on Vercel you redeployed after setting the variables.</div>}
          {conn === 'badkey' && <div className={notice} role="alert">Supabase rejected the key. Copy the anon (or publishable) key from Project Settings, API, then update NEXT_PUBLIC_SUPABASE_ANON_KEY and redeploy.</div>}

          <div className="rounded-2xl border border-line bg-panel p-6 shadow-[0_18px_50px_rgba(15,42,61,0.10)] sm:p-8">
            <div className="mb-6 flex gap-1 rounded-[11px] bg-bg p-1" role="tablist" aria-label="Authentication mode">
              <button role="tab" aria-selected={!signup} aria-controls="auth-panel" id="login-tab" className={tab(!signup)} onClick={() => switchMode('login')}>
                Log in
              </button>
              <button role="tab" aria-selected={signup} aria-controls="auth-panel" id="signup-tab" className={tab(signup)} onClick={() => switchMode('signup')}>
                Sign up
              </button>
            </div>

            <div id="auth-panel" role="tabpanel" aria-labelledby={signup ? 'signup-tab' : 'login-tab'}>
              <h2 className="font-head text-[24px] font-semibold text-ink">{signup ? 'Create your company' : 'Welcome back'}</h2>
              <p className="mb-6 mt-1.5 text-[13.5px] leading-relaxed text-mute">
                {signup
                  ? 'Create the admin account for your company. Each company has one admin, who then creates store manager accounts from the Team page.'
                  : 'Log in to see your stock, entries and reports.'}
              </p>

              <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
                {signup && (
                  <label className={label}>
                    <span className={labelText}>Full name</span>
                    <input type="text" value={f.name} onChange={set('name')} placeholder="Enter your full name" autoComplete="name" className="lp-input" />
                  </label>
                )}

                {signup && (
                  <label className={label}>
                    <span className={labelText}>Company / business name</span>
                    <input
                      type="text"
                      value={f.company}
                      onChange={set('company')}
                      placeholder="Company / business name"
                      maxLength={80}
                      autoComplete="organization"
                      onBlur={async () => { const c = tidy(f.company); if (c.length >= 2 && await companyTaken(c)) bad(COMPANY_EXISTS) }}
                      className="lp-input"
                    />
                  </label>
                )}

                <label className={label}>
                  <span className={labelText}>Email</span>
                  <input type="email" value={f.email} onChange={set('email')} placeholder="name@example.com" autoComplete="email" className="lp-input" />
                </label>

                <label className={label}>
                  <span className={labelText}>Password</span>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={f.pw}
                      onChange={set('pw')}
                      placeholder={signup ? 'Create a password' : 'Enter your password'}
                      autoComplete={signup ? 'new-password' : 'current-password'}
                      className="lp-input pr-12"
                    />
                    <button type="button" className={eyeBtn} aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
                      <I name={showPassword ? 'eye' : 'eyeoff'} size={19} />
                    </button>
                  </div>
                </label>

                {signup && (
                  <p className="-mt-2 mb-4 text-[12px] leading-relaxed text-mute">
                    At least 8 characters with upper and lower case letters, a number and a symbol.
                  </p>
                )}

                {signup && (
                  <label className={label}>
                    <span className={labelText}>Confirm password</span>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={f.pw2}
                        onChange={set('pw2')}
                        placeholder="Re-enter your password"
                        autoComplete="new-password"
                        className="lp-input pr-12"
                      />
                      <button type="button" className={eyeBtn} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(!showConfirmPassword)}>
                        <I name={showConfirmPassword ? 'eye' : 'eyeoff'} size={19} />
                      </button>
                    </div>
                  </label>
                )}

                <p role="alert" className={cx(errBase, 'mb-3', good ? 'text-acc' : 'text-bad')}>
                  {msg}
                </p>

                <button type="submit" className={cx(btn('primary', 'lg', true), 'h-12')} disabled={busy}>
                  {busy ? 'Please wait…' : signup ? 'Create account' : 'Log in'}
                </button>
              </form>

              {!signup && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-line" />
                    <span className="text-[11px] uppercase tracking-wider text-mute">or</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <button type="button" className={cx(btn('ghost', 'lg', true), 'h-12 gap-2.5')} onClick={google}>
                    <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    Continue with Google
                  </button>
                </>
              )}

              <p className="mb-0 mt-6 text-center text-[13.5px] text-mute">
                {signup ? 'Already have an account?' : 'No account yet?'}{' '}
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 text-[13.5px] font-semibold text-acc hover:underline"
                  onClick={() => switchMode(signup ? 'login' : 'signup')}
                >
                  {signup ? 'Log in' : 'Sign up'}
                </button>
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-[13.5px]">
            <Link href="/" className="inline-flex items-center gap-1.5 font-medium text-mute no-underline transition-colors hover:text-acc">
              <I name="arrow" size={14} className="rotate-180" /> Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}