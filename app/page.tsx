import { redirect } from 'next/navigation'
import { supabaseServer } from '@/lib/supabase/server'
import LandingPage from '@/components/landing/LandingPage'

export default async function Home({ searchParams }: { searchParams: Promise<{ session_started?: string }> }) {
  const { session_started } = await searchParams
  const sb = await supabaseServer()
  if (sb) {
    const { data: { user } } = await sb.auth.getUser()
    if (user) {
      const { data: p } = await sb.from('profiles').select('role').eq('id', user.id).single()
      redirect('/' + (p?.role ?? 'manager') + (session_started === '1' ? '?session_started=1' : ''))
    }
  }
  return <LandingPage />
}