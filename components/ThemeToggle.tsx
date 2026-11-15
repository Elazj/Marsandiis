'use client'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/icons'

// Switches between dark and light and remembers the choice. With no choice saved it follows the device.
export default function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    const t = document.documentElement.dataset.theme
    setDark(t ? t === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches)
  }, [])
  const flip = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('stockroom-theme', next) } catch {}
    setDark(!dark)
  }
  const label = dark ? 'Switch to light mode' : 'Switch to dark mode'
  return (
    <button className={compact ? 'inline-grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-ink hover:bg-bg' : 'btn ghost sm'} onClick={flip} aria-pressed={dark} aria-label={label} title={label}>
      {compact ? <Icon name={dark ? 'sun' : 'moon'} /> : label}
    </button>
  )
}
