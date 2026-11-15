'use client'
import Link from 'next/link'
import type { Role } from './SettingsFrame'
import { TabHead } from './shared'

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || ''

export default function HelpSupport({ role }: { role: Role }) {
  const links = role === 'admin'
    ? [
      ['/admin/stores', 'Set up stores', 'Create the locations where inventory is managed.'],
      ['/admin/products', 'Add products', 'Keep product details and starting quantities up to date.'],
      ['/admin/supplies', 'Assign stock', 'Allocate products and quantities to each store.'],
      ['/admin/team', 'Manage accounts', 'Create store manager accounts and assign their stores.'],
      ['/admin/reports', 'Review reports', 'Read issues sent by store managers and mark them resolved.'],
    ]
    : [
      ['/manager/entry', 'Record daily entries', 'Open a product sheet to record customer supplies, losses, or gifts.'],
      ['/manager/forecast', 'Check stock forecasts', 'Review recent usage and estimated stock coverage.'],
      ['/manager/reports', 'Contact your admin', 'Send a store issue or question to your company administrator.'],
    ]

  return <>
    <TabHead title="Help & Support" desc="Quick links for common tasks and ways to get help with Stockroom." />
    <div className="divide-y divide-line border-y border-line">
      {links.map(([href, title, description]) => <Link key={href} href={href} className="flex items-center gap-4 py-4 text-ink no-underline hover:text-acc">
        <span className="min-w-0 flex-1"><b className="block text-[15px]">{title}</b><span className="mt-0.5 block text-[13px] text-mute">{description}</span></span>
        <span aria-hidden="true" className="text-mute">&#8594;</span>
      </Link>)}
    </div>
    <section className="pt-5">
      <h3 className="mb-1 text-[16px] font-semibold">Contact support</h3>
      {SUPPORT_EMAIL
        ? <p className="m-0 text-sm text-mute">Email <a className="text-acc" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for help with Stockroom.</p>
        : role === 'manager'
          ? <p className="m-0 text-sm text-mute">Send a report to your company administrator using the Reports page.</p>
          : <p className="m-0 text-sm text-mute">Contact your designated Stockroom support representative for additional help.</p>}
    </section>
  </>
}