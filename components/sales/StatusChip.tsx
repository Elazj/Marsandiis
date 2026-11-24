import type { PaymentStatus, SupplyStatus } from '@/lib/sales'

export function StatusChip({ status }: { status: PaymentStatus | SupplyStatus }) {
  const tone = status === 'Partially Paid' || status === 'Partially Supplied' ? ' low' : status === 'Unpaid' || status === 'Pending' ? ' out' : ''
  return <span className={'chip' + tone}>{status}</span>
}
