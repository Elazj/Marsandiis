import type { SupabaseClient } from '@supabase/supabase-js'
import { friendly, q } from '@/lib/data'
import type { SalesCurrency } from '@/lib/money'
import { supabaseBrowser } from '@/lib/supabase/client'

export type { SalesCurrency } from '@/lib/money'

export const PAYMENT_METHODS = ['Cash', 'Wave', 'APS', 'NAFA'] as const
export type PaymentMethod = typeof PAYMENT_METHODS[number]
export type PaymentStatus = 'Paid' | 'Partially Paid' | 'Unpaid'
export type SupplyStatus = 'Fully Supplied' | 'Partially Supplied' | 'Pending'

export type InvoiceSummary = {
  id: string
  company_id: string
  invoice_no: string
  customer_id: string
  customer_name: string
  invoice_date: string
  currency: SalesCurrency
  exchange_rate: number
  note: string | null
  created_by: string
  created_at: string
  total_gmd: number
  total_amount: number
  amount_paid: number
  outstanding: number
  payment_status: PaymentStatus
  quantity_sold: number
  quantity_supplied: number
  quantity_pending: number
  supply_status: SupplyStatus
  item_count: number
}

export type InvoiceItem = {
  id: string
  company_id: string
  invoice_id: string
  product_id: string
  quantity_sold: number
  unit_price_gmd: number
  quantity_supplied: number
  total_gmd: number
  quantity_pending: number
  supply_status: SupplyStatus
  created_at: string
  products: { name: string; unit: string; container_no: string } | null
}

export type PaymentRow = {
  id: string
  company_id: string
  invoice_id: string
  amount: number
  method: PaymentMethod
  paid_at: string
  note: string | null
  created_by: string
  created_at: string
}

export type SupplyUpdateRow = {
  id: string
  company_id: string
  invoice_item_id: string
  quantity: number
  supplied_after: number
  note: string | null
  created_by: string
  created_at: string
  profiles: { full_name: string } | null
}

export type CustomerRow = { id: string; company_id: string; name: string; created_at: string }
export type ProductRow = { id: string; name: string; unit: string; container_no: string; default_unit_price_gmd: number }
export type ReceiptRow = { id: string; receipt_no: string; invoice_id: string; payment_id: string | null; kind: 'Invoice' | 'Payment'; issued_at: string }

export type SalesData = {
  invoices: InvoiceSummary[]
  items: InvoiceItem[]
  payments: PaymentRow[]
  customers: CustomerRow[]
  products: ProductRow[]
  receipts: ReceiptRow[]
}

export type ReceiptSnapshot = {
  business: { name: string; logo?: string | null; address?: string | null; phone?: string | null; email?: string | null; footer?: string | null }
  receiptNo: string
  kind: 'Invoice' | 'Payment'
  issuedAt: string
  invoice: {
    id: string; number: string; customer: string; date: string; currency: SalesCurrency
    exchangeRate: number; totalAmount: number; amountPaid: number; outstanding: number
    paymentStatus: PaymentStatus; paymentMethod?: string | null; note?: string | null
  }
  items: { id?: string; productId?: string; productName: string; quantity: number; unitPrice: number; total: number }[]
  payment?: { id: string; amount: number; method: PaymentMethod; paidAt: string; note?: string | null; balanceAfter: number } | null
}

export async function loadSales(sb: SupabaseClient): Promise<SalesData> {
  const [invoices, rawItems, payments, customers, products, receipts] = await Promise.all([
    q(sb.from('invoice_summary').select('*').order('created_at', { ascending: false })),
    q(sb.from('invoice_items').select('*').order('created_at')),
    q(sb.from('payments').select('*').order('paid_at', { ascending: false })),
    q(sb.from('customers').select('*').order('name')),
    q(sb.from('products').select('id, name, unit, container_no, default_unit_price_gmd').order('name')),
    q(sb.from('receipts').select('id, receipt_no, invoice_id, payment_id, kind, issued_at').order('issued_at', { ascending: false })),
  ])
  const productMap = new Map(products.map((product: ProductRow) => [product.id, { name: product.name, unit: product.unit, container_no: product.container_no }]))
  const items = rawItems.map((item: any) => ({ ...item, products: productMap.get(item.product_id) ?? null })) as InvoiceItem[]
  return { invoices, items, payments, customers, products, receipts }
}

export async function loadSalesOverview(sb: SupabaseClient) {
  const [invoices, rawItems, payments, customers, products] = await Promise.all([
    q(sb.from('invoice_summary').select('*').order('created_at', { ascending: false })),
    q(sb.from('invoice_items').select('id, invoice_id, product_id, quantity_sold, quantity_supplied, quantity_pending, total_gmd')),
    q(sb.from('payments').select('id, invoice_id, amount, method, paid_at')),
    q(sb.from('customers').select('id')),
    q(sb.from('products').select('id, name')),
  ])
  const productMap = new Map(products.map((product: { id: string; name: string }) => [product.id, { name: product.name, unit: '', container_no: '' }]))
  const items = rawItems.map((item: any) => ({ ...item, products: productMap.get(item.product_id) ?? null }))
  return { invoices, items, payments, customers }
}

export async function loadInvoice(sb: SupabaseClient, id: string) {
  const invoice = await q(sb.from('invoice_summary').select('*').eq('id', id).single())
  const rawItems = await q(sb.from('invoice_items').select('*').eq('invoice_id', id).order('created_at')) as Omit<InvoiceItem, 'products'>[]
  const itemIds = rawItems.map((item) => item.id)
  const productIds = [...new Set(rawItems.map((item) => item.product_id))]
  const [rawUpdates, payments, products, receipts] = await Promise.all([
    itemIds.length ? q(sb.from('invoice_supply_updates').select('*').in('invoice_item_id', itemIds).order('created_at', { ascending: false })) : [],
    q(sb.from('payments').select('*').eq('invoice_id', id).order('paid_at', { ascending: false })),
    productIds.length ? q(sb.from('products').select('id, name, unit, container_no').in('id', productIds)) : [],
    q(sb.from('receipts').select('id, receipt_no, invoice_id, payment_id, kind, issued_at').eq('invoice_id', id).order('issued_at', { ascending: false })),
  ])
  const productRows = products as { id: string; name: string; unit: string; container_no: string }[]
  const productMap = new Map<string, NonNullable<InvoiceItem['products']>>(productRows.map((product) => [product.id, { name: product.name, unit: product.unit, container_no: product.container_no }]))
  const items: InvoiceItem[] = rawItems.map((item) => ({ ...item, products: productMap.get(item.product_id) ?? null }))
  const actorIds = [...new Set(rawUpdates.map((update: SupplyUpdateRow) => update.created_by))]
  const profiles = actorIds.length ? await q(sb.from('profiles').select('id, full_name').in('id', actorIds)) : []
  const profileMap = new Map(profiles.map((profile: { id: string; full_name: string }) => [profile.id, { full_name: profile.full_name }]))
  const supplyUpdates = rawUpdates.map((update: SupplyUpdateRow) => ({ ...update, profiles: profileMap.get(update.created_by) ?? null }))
  return { invoice: invoice as InvoiceSummary, items, payments: payments as PaymentRow[], supplyUpdates: supplyUpdates as SupplyUpdateRow[], receipts: receipts as ReceiptRow[] }
}

export type NewInvoiceItem = { product_id: string; quantity: number; unit_price_gmd?: number | null }
export type NewInvoice = {
  invoice_no: string
  customer_name: string
  invoice_date: string
  currency: SalesCurrency
  items: NewInvoiceItem[]
  initial_payment: number
  payment_method: PaymentMethod | ''
  note: string
}

function rpcError(error: { message: string }) { throw new Error(friendly(error.message)) }

export async function createSalesInvoice(input: NewInvoice) {
  const { data, error } = await supabaseRpc('create_sales_invoice', {
    p_invoice_no: input.invoice_no,
    p_customer_name: input.customer_name,
    p_invoice_date: input.invoice_date,
    p_currency: input.currency,
    p_items: input.items,
    p_initial_payment: input.initial_payment,
    p_payment_method: input.payment_method || null,
    p_note: input.note || null,
  })
  if (error) rpcError(error)
  return data as string
}

export type EditInvoiceItem = NewInvoiceItem & { id?: string }
export type EditInvoice = {
  invoice_no: string
  customer_name: string
  invoice_date: string
  items: EditInvoiceItem[]
  note: string
}

export async function updateSalesInvoice(invoiceId: string, input: EditInvoice) {
  const { error } = await supabaseRpc('update_sales_invoice', {
    p_invoice: invoiceId,
    p_invoice_no: input.invoice_no,
    p_customer_name: input.customer_name,
    p_invoice_date: input.invoice_date,
    p_items: input.items,
    p_note: input.note || null,
  })
  if (error) rpcError(error)
}

export async function deleteSalesInvoice(invoiceId: string) {
  const { error } = await supabaseRpc('delete_sales_invoice', { p_invoice: invoiceId })
  if (error) rpcError(error)
}

export async function recordInvoicePayment(invoiceId: string, amount: number, method: PaymentMethod, paidAt: string, note: string) {
  const { data, error } = await supabaseRpc('record_invoice_payment', {
    p_invoice: invoiceId, p_amount: amount, p_method: method, p_paid_at: paidAt, p_note: note || null,
  })
  if (error) rpcError(error)
  return data as string
}

export async function updateInvoiceSupply(itemId: string, quantity: number, note: string) {
  const { error } = await supabaseRpc('update_invoice_item_supply', { p_item: itemId, p_quantity: quantity, p_note: note || null })
  if (error) rpcError(error)
}

const supabaseRpc = (name: string, args: Record<string, unknown>) => supabaseBrowser().rpc(name, args)

export type SalesMetrics = {
  invoiceCount: number
  customerCount: number
  productsSold: number
  quantitySupplied: number
  quantityPending: number
  revenue: Record<SalesCurrency, number>
  received: Record<SalesCurrency, number>
  outstanding: Record<SalesCurrency, number>
  byMethod: Record<PaymentMethod, { count: number; GMD: number; XOF: number }>
  supply: Record<SupplyStatus, number>
}

export function calculateSalesMetrics(invoices: InvoiceSummary[], items: Pick<InvoiceItem, 'product_id' | 'quantity_supplied' | 'quantity_pending'>[], payments: Pick<PaymentRow, 'invoice_id' | 'amount' | 'method'>[], customerCount: number): SalesMetrics {
  const currencyOf = new Map(invoices.map((invoice) => [invoice.id, invoice.currency]))
  const metrics: SalesMetrics = {
    invoiceCount: invoices.length,
    customerCount,
    productsSold: new Set(items.map((item) => item.product_id)).size,
    quantitySupplied: items.reduce((sum, item) => sum + Number(item.quantity_supplied), 0),
    quantityPending: items.reduce((sum, item) => sum + Number(item.quantity_pending), 0),
    revenue: { GMD: 0, XOF: 0 },
    received: { GMD: 0, XOF: 0 },
    outstanding: { GMD: 0, XOF: 0 },
    byMethod: { Cash: { count: 0, GMD: 0, XOF: 0 }, Wave: { count: 0, GMD: 0, XOF: 0 }, APS: { count: 0, GMD: 0, XOF: 0 }, NAFA: { count: 0, GMD: 0, XOF: 0 } },
    supply: { 'Fully Supplied': 0, 'Partially Supplied': 0, Pending: 0 },
  }
  invoices.forEach((invoice) => {
    metrics.revenue[invoice.currency] += Number(invoice.total_amount)
    metrics.received[invoice.currency] += Number(invoice.amount_paid)
    metrics.outstanding[invoice.currency] += Number(invoice.outstanding)
    metrics.supply[invoice.supply_status] += 1
  })
  payments.forEach((payment) => {
    const currency = currencyOf.get(payment.invoice_id)
    if (!currency) return
    metrics.byMethod[payment.method].count += 1
    metrics.byMethod[payment.method][currency] += Number(payment.amount)
  })
  return metrics
}

export function receiptSnapshot(value: unknown): ReceiptSnapshot {
  return value as ReceiptSnapshot
}
