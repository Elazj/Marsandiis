// @ts-ignore Next.js processes this stylesheet import, but TypeScript has no CSS declaration here.
import './globals.css'
import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'

export const metadata: Metadata = {
  title: {
    default: 'Marsandiis — Smarter Inventory. Stronger Business.',
    template: '%s | Marsandiis',
  },
  description:
    'Marsandiis helps wholesalers, retailers, warehouses and distributors manage stock across every store. Daily entries, low-stock alerts, forecasts and reports — online or offline.',
  applicationName: 'Marsandiis',
  openGraph: {
    type: 'website',
    siteName: 'Marsandiis',
    title: 'Marsandiis — Smarter Inventory. Stronger Business.',
    description:
      'Manage stock across every store from one place. Daily entries, low-stock alerts, forecasts and reports — online or offline.',
    images: [{ url: '/landing/og-image.jpg', width: 1200, height: 630, alt: 'Marsandiis — multi-store inventory management' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Marsandiis — Smarter Inventory. Stronger Business.',
    description: 'Manage stock across every store from one place — online or offline.',
    images: ['/landing/og-image.jpg'],
  },
}

// Makes the app fit every screen, including phones with a notch.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#1673BB',
}

// Runs before first paint so a saved dark or light choice never flashes the wrong theme.
const themeScript = `try{var t=localStorage.getItem('stockroom-theme');if(t)document.documentElement.dataset.theme=t;if(localStorage.getItem('stockroom-compact')==='1')document.documentElement.dataset.compact='1'}catch(e){}`

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}<Analytics /></body>
    </html>
  )
}