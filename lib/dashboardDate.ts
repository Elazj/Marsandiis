const STORAGE_KEY = 'stockroom-admin-dashboard-date-range'
const LEGACY_STORAGE_KEY = 'stockroom-admin-dashboard-date'
const CHANGE_EVENT = 'stockroom-admin-dashboard-date-range-change'

export type AdminDashboardDateRange = { start: string; end: string }

export function localDateString(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && localDateString(new Date(`${value}T12:00:00`)) === value
}

function validRange(value: AdminDashboardDateRange) {
  return validDate(value.start) && validDate(value.end) && value.start <= value.end
}

export function defaultAdminDashboardDateRange(): AdminDashboardDateRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 6)
  return { start: localDateString(start), end: localDateString(end) }
}

export function readAdminDashboardDateRange(): AdminDashboardDateRange {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const range = JSON.parse(saved) as AdminDashboardDateRange
      if (validRange(range)) return range
    }
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (legacy && validDate(legacy)) return { start: legacy, end: legacy }
  } catch {}
  return defaultAdminDashboardDateRange()
}

export function setAdminDashboardDateRange(value: AdminDashboardDateRange) {
  if (!validRange(value)) return
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) } catch {}
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: value }))
}

export function subscribeAdminDashboardDateRange(onChange: (value: AdminDashboardDateRange) => void) {
  const changed = (event: Event) => onChange((event as CustomEvent<AdminDashboardDateRange>).detail ?? readAdminDashboardDateRange())
  const stored = (event: StorageEvent) => { if (event.key === STORAGE_KEY) onChange(readAdminDashboardDateRange()) }
  window.addEventListener(CHANGE_EVENT, changed)
  window.addEventListener('storage', stored)
  return () => {
    window.removeEventListener(CHANGE_EVENT, changed)
    window.removeEventListener('storage', stored)
  }
}