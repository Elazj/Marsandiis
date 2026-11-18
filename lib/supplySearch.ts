import { q } from '@/lib/data'
import { supabaseBrowser } from '@/lib/supabase/client'

export type SupplySearchResult = {
  id: string
  supply_id: string
  supply_ref: string
  customer: string
  quantity: number
  created_at: string
  profiles?: { full_name: string | null } | null
  supplies?: {
    products?: { name: string; unit: string; container_no: string } | null
    stores?: { name: string } | null
  } | null
}

export async function searchSupplyEntries(term: string, limit = 50): Promise<SupplySearchResult[]> {
  const safe = term.trim().replace(/[\\%_]/g, '\\$&')
  if (!safe) return []

  return q(
    supabaseBrowser().from('sheet_rows')
      .select('id, supply_id, supply_ref, customer, quantity, created_at, profiles(full_name), supplies(products(name, unit, container_no), stores(name))')
      .ilike('supply_ref', `%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
}
