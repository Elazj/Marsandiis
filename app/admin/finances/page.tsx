'use client'
import { useEffect, useMemo, useState } from 'react'
import { Kpi } from '@/components/Kpi'
import { BankDepositForm, ExpenseForm, SalaryForm, VoidFinanceDialog } from '@/components/finances/FinanceForms'
import { csv, download, fmtT, localDay, toast, useLive } from '@/lib/data'
import { defaultAdminDashboardDateRange, localDateString, readAdminDashboardDateRange, setAdminDashboardDateRange, subscribeAdminDashboardDateRange, type AdminDashboardDateRange } from '@/lib/dashboardDate'
import {
  EXPENSE_LABELS, PAYMENT_METHODS, emptyFinanceSummary, loadFinances, loadFinanceSummary,
  payPeriodLabel, voidBankDeposit, voidMiscExpense, voidSalaryPayment,
  type BankDeposit, type MiscExpense, type PaymentMethod, type SalaryPayment, type SalesCurrency,
} from '@/lib/finances'
import { money } from '@/lib/money'

type Tab = 'salaries' | 'expenses' | 'deposits'
type VoidTarget = { kind: 'salary'; row: SalaryPayment } | { kind: 'expense'; row: MiscExpense } | { kind: 'deposit'; row: BankDeposit }

export default function FinancesPage() {
  const [selectedRange, setSelectedRange] = useState<AdminDashboardDateRange>({ start: '', end: '' })
  useEffect(() => {
    setSelectedRange(readAdminDashboardDateRange())
    return subscribeAdminDashboardDateRange(setSelectedRange)
  }, [])
  const range = selectedRange.start && selectedRange.end ? selectedRange : defaultAdminDashboardDateRange()
  const from = new Date(`${range.start}T00:00:00`).toISOString()
  const untilDate = new Date(`${range.end}T00:00:00`)
  untilDate.setDate(untilDate.getDate() + 1)
  const until = untilDate.toISOString()
  const financeTables = ['salary_payments', 'misc_expenses', 'bank_deposits']
  const { data, err, reload } = useLive(loadFinances, financeTables, 'admin-finances', 5_000, false)
  const { data: summary, err: summaryErr, reload: reloadSummary } = useLive(
    (sb) => loadFinanceSummary(sb, from, until),
    ['payments', 'salary_payments', 'misc_expenses', 'bank_deposits'],
    `admin-finance-summary-${range.start}-${range.end}`,
    5_000,
    false,
  )
  const [tab, setTab] = useState<Tab>('salaries')
  const [search, setSearch] = useState('')
  const [currency, setCurrency] = useState<'all' | SalesCurrency>('all')
  const [method, setMethod] = useState<'all' | PaymentMethod>('all')
  const [salaryForm, setSalaryForm] = useState<{ payment?: SalaryPayment } | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [depositOpen, setDepositOpen] = useState(false)
  const [voidTarget, setVoidTarget] = useState<VoidTarget | null>(null)

  const term = search.trim().toLowerCase()
  const salaries = useMemo(() => (data?.salaries ?? []).filter((row) =>
    (!term || row.employee_name.toLowerCase().includes(term) || (row.payment_reference ?? '').toLowerCase().includes(term) || (row.note ?? '').toLowerCase().includes(term))
    && (currency === 'all' || row.currency === currency)
    && (method === 'all' || row.payment_method === method)
  ), [data, term, currency, method])
  const expenses = useMemo(() => (data?.expenses ?? []).filter((row) =>
    (!term || EXPENSE_LABELS[row.category].toLowerCase().includes(term) || (row.payee ?? '').toLowerCase().includes(term) || (row.description ?? '').toLowerCase().includes(term) || (row.reference ?? '').toLowerCase().includes(term))
    && (currency === 'all' || row.currency === currency)
    && (method === 'all' || row.payment_method === method)
  ), [data, term, currency, method])
  const deposits = useMemo(() => (data?.deposits ?? []).filter((row) =>
    (!term || row.bank_name.toLowerCase().includes(term) || (row.account_reference ?? '').toLowerCase().includes(term) || (row.reference ?? '').toLowerCase().includes(term) || (row.note ?? '').toLowerCase().includes(term))
    && (currency === 'all' || row.currency === currency)
  ), [data, term, currency])

  const totals = summary ?? emptyFinanceSummary(from, until)
  const startLabel = new Date(`${range.start}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' })
  const endLabel = new Date(`${range.end}T12:00:00`).toLocaleDateString([], { dateStyle: 'medium' })
  const dateLabel = range.start === range.end ? startLabel : `${startLabel} to ${endLabel}`

  function refresh() {
    void reload()
    void reloadSummary()
  }

  function exportHistory() {
    const rows: (string | number)[][] = tab === 'salaries' ? [
      ['Payroll record', 'Employees paid', 'Pay period', 'Date paid', 'Currency', 'Total amount', 'Method', 'Reference', 'Note', 'Status', 'Void reason'],
      ...salaries.map((row) => [row.employee_name, row.employee_count, row.pay_period, row.paid_at, row.currency, row.amount, row.payment_method, row.payment_reference ?? '', row.note ?? '', row.voided_at ? 'Voided' : 'Recorded', row.void_reason ?? '']),
    ] : tab === 'expenses' ? [
      ['Category', 'Payee', 'Description', 'Date paid', 'Currency', 'Amount', 'Method', 'Reference', 'Status', 'Void reason'],
      ...expenses.map((row) => [EXPENSE_LABELS[row.category], row.payee ?? '', row.description ?? '', row.paid_at, row.currency, row.amount, row.payment_method, row.reference ?? '', row.voided_at ? 'Voided' : 'Recorded', row.void_reason ?? '']),
    ] : [
      ['Bank', 'Account reference', 'Date deposited', 'Currency', 'Amount', 'Reference', 'Note', 'Status', 'Void reason'],
      ...deposits.map((row) => [row.bank_name, row.account_reference ?? '', row.deposited_at, row.currency, row.amount, row.reference ?? '', row.note ?? '', row.voided_at ? 'Voided' : 'Recorded', row.void_reason ?? '']),
    ]
    download(`finances-${tab}-${localDay(new Date())}.csv`, csv(rows))
  }

  if (err) return <p className="err" role="alert">{err}</p>
  if (!data) return <p className="mute">Loading finances…</p>

  return <>
    <div className="hero">
      <div><h1>Finances</h1><p>Record salary totals, bank deposits and miscellaneous expenses, and follow cash in hand without mixing GMD and XOF.</p></div>
      <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 sm:w-[360px]">
        <span className="live-pill col-start-1 row-start-2"><i />Live</span>
        <button className="btn ghost col-start-2 row-start-1" onClick={() => setExpenseOpen(true)}>Record expense</button>
        <button className="btn ghost col-start-2 row-start-2" onClick={() => setDepositOpen(true)}>Record deposit</button>
        <button className="btn col-start-2 row-start-3" onClick={() => setSalaryForm({})}>Record salary total</button>
      </div>
    </div>

    <div className="panel mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0">Cash flow: {dateLabel}</h2><p className="mute mb-0">Uses the dashboard date range. Customer cash received is based on payment dates, not invoice dates.</p></div><span className="chip">Selected period</span></div>
      {range.end < localDateString() ? <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-warnsoft px-3 py-[10px] text-sm text-warn" role="status">
        <span>This range ends on {endLabel}. Sales payments and finance records after that date are not included.</span>
        <button className="btn ghost sm" onClick={() => setAdminDashboardDateRange(defaultAdminDashboardDateRange())}>Show current 7 days</button>
      </div> : null}
      {summaryErr ? <p className="err" role="alert">{summaryErr}</p> : null}
      {!summary ? <p className="mute">Loading cash totals…</p> : <>
        <div className="content-grid mb-4">
          {(['GMD', 'XOF'] as const).map((code) => {
            const value = totals.currencies[code]
            return <section className="panel" key={code} aria-label={`${code} cash in vault`}>
              <h2 className="mt-0">{code} cash in hand / vault</h2>
              <div className="kpis">
                <Kpi icon="finances" label={`Cash in vault through ${endLabel}`} value={money(value.cashInVault, code)} tone={value.cashInVault < 0 ? 'warn' : undefined} />
                <Kpi icon="finances" label="All customer cash received" value={money(value.receivedThroughEnd, code)} />
                <Kpi icon="out" label="All salaries, expenses and deposits" value={money(value.deductionsThroughEnd, code)} />
              </div>
              <p className="note mb-0">All recorded cash received up to the end of this range, minus all active salary payments, miscellaneous expenses and bank deposits. Older records are included.</p>
            </section>
          })}
        </div>
        <h3>Cash flow for selected period</h3>
        <div className="content-grid">
          {(['GMD', 'XOF'] as const).map((code) => {
            const value = totals.currencies[code]
            return <section className="panel" key={code} aria-label={`${code} finance totals`}>
              <h2 className="mt-0">{code} · {code === 'GMD' ? 'Gambian Dalasi' : 'CFA Franc'}</h2>
              <div className="kpis">
                <Kpi icon="finances" label="Customer cash received" value={money(value.received, code)} />
                <Kpi icon="salary" label="Salaries paid" value={money(value.salaries, code)} />
                <Kpi icon="expense" label="Miscellaneous expenses" value={money(value.expenses, code)} />
                <Kpi icon="finances" label="Bank deposits" value={money(value.deposits, code)} />
                <Kpi icon="out" label="Total outgoing" value={money(value.totalOutgoing, code)} />
                <Kpi icon="out" label="Total vault deductions" value={money(value.vaultOutgoing, code)} />
                <Kpi icon="net" label="Net cash flow" value={money(value.netCashFlow, code)} tone={value.netCashFlow < 0 ? 'warn' : undefined} />
              </div>
              <p className="note mb-0">{value.receivedCount} payment{value.receivedCount === 1 ? '' : 's'} received · {value.employeeCount} employee{value.employeeCount === 1 ? '' : 's'} paid in {value.salaryCount} salary record{value.salaryCount === 1 ? '' : 's'} · {value.expenseCount} expense{value.expenseCount === 1 ? '' : 's'} · {value.depositCount} bank deposit{value.depositCount === 1 ? '' : 's'}</p>
            </section>
          })}
        </div>
      </>}
      <p className="note mb-0">Net cash flow is money received minus salaries and expenses for the selected period. Vault deductions also include bank deposits. Bank deposits remain transfers, not business expenses.</p>
    </div>

    <div className="tabs" role="tablist" aria-label="Finance records">
      <button role="tab" aria-selected={tab === 'salaries'} className={tab === 'salaries' ? 'on' : ''} onClick={() => setTab('salaries')}>Salary payments</button>
      <button role="tab" aria-selected={tab === 'expenses'} className={tab === 'expenses' ? 'on' : ''} onClick={() => setTab('expenses')}>Miscellaneous expenses</button>
      <button role="tab" aria-selected={tab === 'deposits'} className={tab === 'deposits' ? 'on' : ''} onClick={() => setTab('deposits')}>Bank deposits</button>
    </div>

    <section className="panel">
      <div className={`grid items-end gap-x-3 sm:grid-cols-2 ${tab === 'deposits' ? 'lg:grid-cols-[1fr_140px_auto]' : 'lg:grid-cols-[1fr_140px_140px_auto]'}`}>
        <label className="m-0">Search {tab === 'salaries' ? 'payroll record, reference or note' : tab === 'expenses' ? 'category, payee, description or reference' : 'bank, account, reference or note'}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search finance history" /></label>
        <label className="m-0">Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as typeof currency)}><option value="all">All currencies</option><option value="GMD">GMD</option><option value="XOF">XOF</option></select></label>
        {tab !== 'deposits' ? <label className="m-0">Method<select value={method} onChange={(event) => setMethod(event.target.value as typeof method)}><option value="all">All methods</option>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label> : null}
        <button className="btn ghost sm" onClick={exportHistory}>Export CSV</button>
      </div>
      <div className="mt-4 wrap"><table>
        {tab === 'salaries' ? <>
          <thead><tr><th>Payroll record</th><th>Employees paid</th><th>Pay period</th><th>Date paid</th><th>Method</th><th>Reference</th><th className="n">Total paid</th><th>Status</th><th /></tr></thead>
          <tbody>{salaries.map((row) => <tr key={row.id}>
            <td><b>{row.employee_name}</b>{row.note ? <span className="block max-w-72 truncate text-xs text-mute" title={row.note}>{row.note}</span> : null}</td>
            <td>{row.employee_count}</td><td>{payPeriodLabel(row.pay_period)}</td><td>{fmtT(row.paid_at)}</td><td>{row.payment_method}</td><td>{row.payment_reference || '—'}</td>
            <td className="n"><b>{money(row.amount, row.currency)}</b></td><td>{row.voided_at ? <span className="chip">Voided</span> : <span className="chip ok">Recorded</span>}</td>
            <td>{row.voided_at ? <span className="text-xs text-mute" title={row.void_reason ?? ''}>Voided</span> : <div className="flex flex-wrap gap-2"><button className="btn ghost sm" onClick={() => setSalaryForm({ payment: row })}>Edit</button><button className="btn ghost sm" onClick={() => setVoidTarget({ kind: 'salary', row })}>Void</button></div>}</td>
          </tr>)}</tbody>
        </> : tab === 'expenses' ? <>
          <thead><tr><th>Category</th><th>Payee / description</th><th>Date paid</th><th>Method</th><th>Reference</th><th className="n">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{expenses.map((row) => <tr key={row.id}>
            <td><b>{EXPENSE_LABELS[row.category]}</b></td><td><span className="block">{row.payee || '—'}</span>{row.description ? <span className="block max-w-72 truncate text-xs text-mute" title={row.description}>{row.description}</span> : null}</td>
            <td>{fmtT(row.paid_at)}</td><td>{row.payment_method}</td><td>{row.reference || '—'}</td>
            <td className="n"><b>{money(row.amount, row.currency)}</b></td><td>{row.voided_at ? <span className="chip">Voided</span> : <span className="chip ok">Recorded</span>}</td>
            <td>{row.voided_at ? <span className="text-xs text-mute" title={row.void_reason ?? ''}>Voided</span> : <button className="btn ghost sm" onClick={() => setVoidTarget({ kind: 'expense', row })}>Void</button>}</td>
          </tr>)}</tbody>
        </> : <>
          <thead><tr><th>Bank</th><th>Account reference</th><th>Date deposited</th><th>Deposit reference</th><th className="n">Amount</th><th>Status</th><th /></tr></thead>
          <tbody>{deposits.map((row) => <tr key={row.id}>
            <td><b>{row.bank_name}</b>{row.note ? <span className="block max-w-72 truncate text-xs text-mute" title={row.note}>{row.note}</span> : null}</td>
            <td>{row.account_reference || '—'}</td><td>{fmtT(row.deposited_at)}</td><td>{row.reference || '—'}</td>
            <td className="n"><b>{money(row.amount, row.currency)}</b></td><td>{row.voided_at ? <span className="chip">Voided</span> : <span className="chip ok">Recorded</span>}</td>
            <td>{row.voided_at ? <span className="text-xs text-mute" title={row.void_reason ?? ''}>Voided</span> : <button className="btn ghost sm" onClick={() => setVoidTarget({ kind: 'deposit', row })}>Void</button>}</td>
          </tr>)}</tbody>
        </>}
      </table></div>
      {!(tab === 'salaries' ? salaries.length : tab === 'expenses' ? expenses.length : deposits.length) ? <p className="mute mb-0">No {tab === 'salaries' ? 'salary payments' : tab === 'expenses' ? 'expenses' : 'bank deposits'} match these filters.</p> : null}
    </section>

    {salaryForm ? <SalaryForm key={salaryForm.payment?.id ?? 'new'} payment={salaryForm.payment} onClose={() => setSalaryForm(null)} onSaved={() => { const editing = !!salaryForm.payment; setSalaryForm(null); refresh(); toast(editing ? 'Salary payment updated.' : 'Salary payment recorded.') }} /> : null}
    {expenseOpen ? <ExpenseForm onClose={() => setExpenseOpen(false)} onSaved={() => { setExpenseOpen(false); refresh(); toast('Expense recorded.') }} /> : null}
    {depositOpen ? <BankDepositForm onClose={() => setDepositOpen(false)} onSaved={() => { setDepositOpen(false); refresh(); toast('Bank deposit recorded.') }} /> : null}
    {voidTarget ? <VoidFinanceDialog
      title={voidTarget.kind === 'salary' ? 'Void salary payment' : voidTarget.kind === 'expense' ? 'Void miscellaneous expense' : 'Void bank deposit'}
      subject={`${voidTarget.kind === 'salary' ? voidTarget.row.employee_name : voidTarget.kind === 'expense' ? EXPENSE_LABELS[voidTarget.row.category] : voidTarget.row.bank_name} · ${money(voidTarget.row.amount, voidTarget.row.currency)}`}
      onClose={() => setVoidTarget(null)}
      onVoided={async (reason) => {
        if (voidTarget.kind === 'salary') await voidSalaryPayment(voidTarget.row.id, reason)
        else if (voidTarget.kind === 'expense') await voidMiscExpense(voidTarget.row.id, reason)
        else await voidBankDeposit(voidTarget.row.id, reason)
        refresh()
        toast('Finance record voided and excluded from totals.')
      }}
    /> : null}
  </>
}
