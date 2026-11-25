import type { SupabaseClient } from '@supabase/supabase-js'
import { friendly, q } from '@/lib/data'
import type { SalesCurrency } from '@/lib/money'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/sales'
import { supabaseBrowser } from '@/lib/supabase/client'

export { PAYMENT_METHODS }
export type { PaymentMethod, SalesCurrency }

export const EXPENSE_CATEGORIES = ['rent', 'electricity', 'fuel', 'car_maintenance', 'other'] as const
export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

export const EXPENSE_LABELS: Record<ExpenseCategory, string> = {
  rent: 'Rent',
  electricity: 'Cash power / electricity',
  fuel: 'Fuel',
  car_maintenance: 'Car maintenance',
  other: 'Other expense',
}

export type SalaryPayment = {
  id: string
  company_id: string
  employee_id: string | null
  employee_name: string
  employee_count: number
  pay_period: string
  amount: number
  currency: SalesCurrency
  paid_at: string
  payment_method: PaymentMethod
  payment_reference: string | null
  note: string | null
  client_id: string
  created_by: string
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
}

export type MiscExpense = {
  id: string
  company_id: string
  category: ExpenseCategory
  amount: number
  currency: SalesCurrency
  paid_at: string
  payee: string | null
  description: string | null
  payment_method: PaymentMethod
  reference: string | null
  client_id: string
  created_by: string
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
}

export type BankDeposit = {
  id: string
  company_id: string
  bank_name: string
  account_reference: string | null
  amount: number
  currency: SalesCurrency
  deposited_at: string
  reference: string | null
  note: string | null
  client_id: string
  created_by: string
  created_at: string
  voided_at: string | null
  voided_by: string | null
  void_reason: string | null
}

export type FinanceData = { salaries: SalaryPayment[]; expenses: MiscExpense[]; deposits: BankDeposit[] }

export type CurrencyFinanceTotals = {
  received: number
  receivedCount: number
  salaries: number
  salaryCount: number
  employeeCount: number
  expenses: number
  expenseCount: number
  deposits: number
  depositCount: number
  totalOutgoing: number
  netCashFlow: number
  vaultOutgoing: number
  receivedThroughEnd: number
  deductionsThroughEnd: number
  cashInVault: number
}

export type FinanceDaily = {
  day: string
  currency: SalesCurrency
  received: number
  salaries: number
  expenses: number
  deposits: number
  netCashFlow: number
}

export type FinanceExpenseCategory = { category: ExpenseCategory; currency: SalesCurrency; amount: number }

export type FinanceSummary = {
  from: string
  until: string
  currencies: Record<SalesCurrency, CurrencyFinanceTotals>
  expenseCategories: FinanceExpenseCategory[]
  daily: FinanceDaily[]
}

const emptyTotals = (): CurrencyFinanceTotals => ({
  received: 0, receivedCount: 0, salaries: 0, salaryCount: 0, employeeCount: 0,
  expenses: 0, expenseCount: 0, deposits: 0, depositCount: 0,
  totalOutgoing: 0, netCashFlow: 0, vaultOutgoing: 0,
  receivedThroughEnd: 0, deductionsThroughEnd: 0, cashInVault: 0,
})

export function emptyFinanceSummary(from = '', until = ''): FinanceSummary {
  return { from, until, currencies: { GMD: emptyTotals(), XOF: emptyTotals() }, expenseCategories: [], daily: [] }
}

function normalizeSummary(value: any): FinanceSummary {
  if (!value || typeof value !== 'object') throw new Error('Could not read finance totals.')
  const rawCurrencies = value.currencies ?? {}
  const normalizeTotals = (raw: any): CurrencyFinanceTotals => ({
    received: Number(raw?.received) || 0,
    receivedCount: Number(raw?.receivedCount) || 0,
    salaries: Number(raw?.salaries) || 0,
    salaryCount: Number(raw?.salaryCount) || 0,
    employeeCount: Number(raw?.employeeCount) || 0,
    expenses: Number(raw?.expenses) || 0,
    expenseCount: Number(raw?.expenseCount) || 0,
    deposits: Number(raw?.deposits) || 0,
    depositCount: Number(raw?.depositCount) || 0,
    totalOutgoing: Number(raw?.totalOutgoing) || 0,
    netCashFlow: Number(raw?.netCashFlow) || 0,
    vaultOutgoing: Number(raw?.vaultOutgoing) || 0,
    receivedThroughEnd: Number(raw?.receivedThroughEnd) || 0,
    deductionsThroughEnd: Number(raw?.deductionsThroughEnd) || 0,
    cashInVault: Number(raw?.cashInVault) || 0,
  })
  return {
    from: String(value.from ?? ''),
    until: String(value.until ?? ''),
    currencies: { GMD: normalizeTotals(rawCurrencies.GMD), XOF: normalizeTotals(rawCurrencies.XOF) },
    expenseCategories: Array.isArray(value.expenseCategories) ? value.expenseCategories.map((row: any) => ({
      category: row.category as ExpenseCategory,
      currency: row.currency as SalesCurrency,
      amount: Number(row.amount) || 0,
    })) : [],
    daily: Array.isArray(value.daily) ? value.daily.map((row: any) => ({
      day: String(row.day),
      currency: row.currency as SalesCurrency,
      received: Number(row.received) || 0,
      salaries: Number(row.salaries) || 0,
      expenses: Number(row.expenses) || 0,
      deposits: Number(row.deposits) || 0,
      netCashFlow: Number(row.netCashFlow) || 0,
    })) : [],
  }
}

export async function loadFinances(sb: SupabaseClient): Promise<FinanceData> {
  const [salaryRows, expenseRows, depositRows] = await Promise.all([
    q(sb.from('salary_payments').select('*').order('paid_at', { ascending: false })),
    q(sb.from('misc_expenses').select('*').order('paid_at', { ascending: false })),
    q(sb.from('bank_deposits').select('*').order('deposited_at', { ascending: false })),
  ])
  return {
    salaries: (salaryRows as any[]).map((row) => ({ ...row, amount: Number(row.amount) || 0, employee_count: Number(row.employee_count) || 1 })),
    expenses: (expenseRows as any[]).map((row) => ({ ...row, amount: Number(row.amount) || 0 })),
    deposits: (depositRows as any[]).map((row) => ({ ...row, amount: Number(row.amount) || 0 })),
  }
}

export async function loadFinanceSummary(sb: SupabaseClient, from: string, until: string): Promise<FinanceSummary> {
  const value = await q(sb.rpc('get_finance_summary', { p_from: from, p_until: until }))
  return normalizeSummary(value)
}

export type NewPayrollBatch = {
  payPeriod: string
  amount: number
  employeeCount: number
  currency: SalesCurrency
  paidAt: string
  method: PaymentMethod
  reference: string
  note: string
  clientId: string
}

export type SalaryPaymentEdit = Omit<NewPayrollBatch, 'clientId'>

export type NewMiscExpense = {
  category: ExpenseCategory
  amount: number
  currency: SalesCurrency
  paidAt: string
  method: PaymentMethod
  payee: string
  description: string
  reference: string
  clientId: string
}

function rpcError(error: { message: string }) { throw new Error(friendly(error.message)) }

export async function recordPayrollBatch(input: NewPayrollBatch) {
  const { data, error } = await supabaseBrowser().rpc('record_payroll_batch', {
    p_pay_period: input.payPeriod,
    p_amount: input.amount,
    p_employee_count: input.employeeCount,
    p_currency: input.currency,
    p_paid_at: input.paidAt,
    p_payment_method: input.method,
    p_payment_reference: input.reference || null,
    p_note: input.note || null,
    p_client_id: input.clientId,
  })
  if (error) rpcError(error)
  return data as string
}

export async function editSalaryPayment(id: string, input: SalaryPaymentEdit) {
  const { error } = await supabaseBrowser().rpc('edit_salary_payment', {
    p_payment: id,
    p_pay_period: input.payPeriod,
    p_amount: input.amount,
    p_employee_count: input.employeeCount,
    p_currency: input.currency,
    p_paid_at: input.paidAt,
    p_payment_method: input.method,
    p_payment_reference: input.reference || null,
    p_note: input.note || null,
  })
  if (error) rpcError(error)
}

export async function recordMiscExpense(input: NewMiscExpense) {
  const { data, error } = await supabaseBrowser().rpc('record_misc_expense', {
    p_category: input.category,
    p_amount: input.amount,
    p_currency: input.currency,
    p_paid_at: input.paidAt,
    p_payment_method: input.method,
    p_payee: input.payee || null,
    p_description: input.description || null,
    p_reference: input.reference || null,
    p_client_id: input.clientId,
  })
  if (error) rpcError(error)
  return data as string
}

export type NewBankDeposit = {
  bankName: string
  accountReference: string
  amount: number
  currency: SalesCurrency
  depositedAt: string
  reference: string
  note: string
  clientId: string
}

export async function recordBankDeposit(input: NewBankDeposit) {
  const { data, error } = await supabaseBrowser().rpc('record_bank_deposit', {
    p_bank_name: input.bankName,
    p_amount: input.amount,
    p_currency: input.currency,
    p_deposited_at: input.depositedAt,
    p_account_reference: input.accountReference || null,
    p_reference: input.reference || null,
    p_note: input.note || null,
    p_client_id: input.clientId,
  })
  if (error) rpcError(error)
  return data as string
}

export async function voidSalaryPayment(id: string, reason: string) {
  const { error } = await supabaseBrowser().rpc('void_salary_payment', { p_payment: id, p_reason: reason })
  if (error) rpcError(error)
}

export async function voidMiscExpense(id: string, reason: string) {
  const { error } = await supabaseBrowser().rpc('void_misc_expense', { p_expense: id, p_reason: reason })
  if (error) rpcError(error)
}

export async function voidBankDeposit(id: string, reason: string) {
  const { error } = await supabaseBrowser().rpc('void_bank_deposit', { p_deposit: id, p_reason: reason })
  if (error) rpcError(error)
}

export function financeDate(value: string) {
  return new Date(`${value}T12:00:00`).toISOString()
}

export function payPeriodLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], { month: 'long', year: 'numeric' })
}
