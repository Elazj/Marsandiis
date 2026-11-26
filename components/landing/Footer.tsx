'use client'
import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Modal } from '@/components/ui'
import { Container } from './shared'

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ''
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE || ''
const SUPPORT_ADDRESS = process.env.NEXT_PUBLIC_SUPPORT_ADDRESS || ''
const COMPANY_NAME = process.env.NEXT_PUBLIC_COMPANY_NAME || ''

type Sheet = 'privacy' | 'terms' | 'support' | null

const linkCls = 'text-[#b9cfdf] no-underline transition-colors hover:text-white'

export default function Footer() {
  const [sheet, setSheet] = useState<Sheet>(null)

  return (
    <footer className="lp-navy lp-grid" style={{ backgroundColor: '#0f2a3d' }}>
      <Container className="pb-8 pt-14 lg:pt-16">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr_1.1fr] lg:gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2.5 font-head text-[26px] font-semibold text-white no-underline" aria-label="Marsandiis home">
              <Image src="/logo-icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
              Marsandiis
            </Link>
            <p className="mt-3 max-w-[250px] text-[14px] leading-[1.7] text-[#9db8cc]">
              Stock management for businesses with more than one store.
            </p>
          </div>

          <div role="navigation" aria-label="Product">
            <h4 className="mb-4 text-[14px] font-bold text-white">Product</h4>
            <ul className="space-y-2.5 text-[14px]">
              <li><Link className={linkCls} href="/#features">Features</Link></li>
              <li><Link className={linkCls} href="/#how-it-works">How it works</Link></li>
              <li><Link className={linkCls} href="/#pricing">Pricing</Link></li>
            </ul>
          </div>

          <div role="navigation" aria-label="Support">
            <h4 className="mb-4 text-[14px] font-bold text-white">Support</h4>
            <ul className="space-y-2.5 text-[14px]">
              <li><Link className={linkCls} href="/#help">Help center</Link></li>
              <li>
                {SUPPORT_EMAIL
                  ? <a className={linkCls} href={`mailto:${SUPPORT_EMAIL}`}>Contact support</a>
                  : <button className="cursor-pointer border-0 bg-transparent p-0 text-[14px] text-[#b9cfdf] transition-colors hover:text-white" onClick={() => setSheet('support')}>Contact support</button>}
              </li>
              <li><Link className={linkCls} href="/#how-it-works">User guide</Link></li>
            </ul>
          </div>

          <div role="navigation" aria-label="Company">
            <h4 className="mb-4 text-[14px] font-bold text-white">Company</h4>
            <ul className="space-y-2.5 text-[14px]">
              {/* <li><span className="text-[#b9cfdf]">{COMPANY_NAME || 'Marsandiis'}</span></li> */}
              <li><button className="cursor-pointer border-0 bg-transparent p-0 text-[14px] text-[#b9cfdf] transition-colors hover:text-white" onClick={() => setSheet('privacy')}>Privacy</button></li>
              <li><button className="cursor-pointer border-0 bg-transparent p-0 text-[14px] text-[#b9cfdf] transition-colors hover:text-white" onClick={() => setSheet('terms')}>Terms</button></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-[14px] font-bold text-white">Contact</h4>
            <ul className="space-y-2.5 text-[14px] text-[#b9cfdf]">
              <li>{SUPPORT_EMAIL ? <a className={linkCls} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : <span>mahmudj1122@gmail.com</span>}</li>
              <li>{SUPPORT_PHONE ? <a className={linkCls} href={`tel:${SUPPORT_PHONE.replace(/[^+\d]/g, '')}`}>{SUPPORT_PHONE}</a> : <span>+220 83 3897850</span>}</li>
              <li className="leading-relaxed">{SUPPORT_ADDRESS || 'Jambur, West Coast Region.'}</li>
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6">
          <p className="text-[13px] text-[#8faac0]">© 2026 Marsandiis. All rights reserved.</p>
        </div>
      </Container>

      <Modal open={sheet === 'privacy'} title="Privacy" onClose={() => setSheet(null)}>
        <div className="space-y-3 text-sm leading-relaxed text-mute">
          <p>Marsandiis keeps every company&apos;s data in its own private space. Your products, stores, entries and reports are never shared with, or visible to, any other company.</p>
          <p>Accounts are protected by email and password (or Google sign-in), and each person only sees the area their role allows — admins manage the company, store managers record entries for their own stores.</p>
          <p>Your data is stored in a managed PostgreSQL database with encrypted connections. You can export a full backup of your company&apos;s data at any time from Settings → Backup.</p>
          <p className="text-[12px]">This summary describes how the product handles data. A full legal privacy policy will be published here.</p>
        </div>
      </Modal>

      <Modal open={sheet === 'terms'} title="Terms of use" onClose={() => setSheet(null)}>
        <div className="space-y-3 text-sm leading-relaxed text-mute">
          <p>Marsandiis is provided to help your business record and monitor stock. You are responsible for the accuracy of the entries your team records and for keeping your account credentials safe.</p>
          <p>One admin account is created per company. The admin creates store manager accounts (up to three per store) and is responsible for the people they invite.</p>
          <p>Marsandiis is currently free to use while in early access. Paid plans shown on this site are a preview; prices and final terms will be confirmed before any billing begins. No card is required to start.</p>
          <p className="text-[12px]">This summary describes the service as it works today. Full legal terms will be published here.</p>
        </div>
      </Modal>

      <Modal open={sheet === 'support'} title="Contact support" onClose={() => setSheet(null)}>
        <div className="space-y-3 text-sm leading-relaxed text-mute">
          <p>The fastest way to get help is inside the app: sign in and open <b className="text-ink">Settings → Help &amp; Support</b> for quick guides, or send a report from the Reports page.</p>
          <p>Store managers can send issues straight to their company admin from the Reports page. Admins can reach the Marsandiis team through their designated support representative.</p>
          <p className="text-[12px]">A public support email and phone line will be listed here once published.</p>
        </div>
      </Modal>
    </footer>
  )
}