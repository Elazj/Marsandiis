'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui'
import { localDay } from '@/lib/data'
import {
  EXPENSE_CATEGORIES, EXPENSE_LABELS, PAYMENT_METHODS, editSalaryPayment, financeDate,
  recordBankDeposit, recordMiscExpense, recordPayrollBatch, type ExpenseCategory,
  type PaymentMethod, type SalaryPayment, type SalesCurrency,
} from '@/lib/finances'

export function SalaryForm({ payment, onClose, onSaved }: {
  payment?: SalaryPayment
  onClose: () => void
  onSaved: () => void
}) {
  const [payPeriod, setPayPeriod] = useState(payment?.pay_period.slice(0, 7) ?? localDay(new Date()).slice(0, 7))
  const [amount, setAmount] = useState(payment ? String(payment.amount) : '')
  const [employeeCount, setEmployeeCount] = useState(payment ? String(payment.employee_count) : '')
  const [currency, setCurrency] = useState<SalesCurrency>(payment?.currency ?? 'GMD')
  const [paidAt, setPaidAt] = useState(payment ? localDay(payment.paid_at) : localDay(new Date()))
  const [method, setMethod] = useState<PaymentMethod>(payment?.payment_method ?? 'Cash')
  const [reference, setReference] = useState(payment?.payment_reference ?? '')
  const [note, setNote] = useState(payment?.note ?? '')
  const [clientId] = useState(() => crypto.randomUUID())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    const value = Number(amount)
    const count = Number(employeeCount)
    if (!payPeriod) return setErr('Choose the salary pay period.')
    if (!(value > 0) || !isFinite(value)) return setErr('Enter the total salary amount above zero.')
    if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return setErr('Use at most two decimal places for the salary total.')
    if (!Number.isInteger(count) || count < 1 || count > 100000) return setErr('Enter the number of employees paid, between 1 and 100000.')
    if (!paidAt) return setErr('Choose the date paid.')
    setBusy(true)
    try {
      const input = {
        payPeriod: `${payPeriod}-01`,
        amount: value,
        employeeCount: count,
        currency,
        paidAt: financeDate(paidAt),
        method,
        reference: reference.trim(),
        note: note.trim(),
      }
      if (payment) await editSalaryPayment(payment.id, input)
      else await recordPayrollBatch({ ...input, clientId })
      onSaved()
    } catch (error) {
      setErr(error instanceof Error ? error.message : payment ? 'Could not update the salary payment.' : 'Could not record the salary payment.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title={payment ? 'Edit salary payment' : 'Record salary payment'} onClose={onClose}>
    <form onSubmit={submit}>
      <p className="note mt-0">Record one payroll total for all employees paid on this date.</p>
      {payment && payment.employee_name !== 'Payroll batch' ? <p className="mute">Original record: {payment.employee_name}</p> : null}
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Total amount paid<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>
        <label>Number of employees paid<input type="number" min="1" max="100000" step="1" value={employeeCount} onChange={(event) => setEmployeeCount(event.target.value)} placeholder="e.g., 5" required /></label>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as SalesCurrency)}><option value="GMD">GMD</option><option value="XOF">XOF</option></select></label>
        <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Pay period<input type="month" value={payPeriod} onChange={(event) => setPayPeriod(event.target.value)} required /></label>
        <label>Date paid<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required /></label>
      </div>
      <label>Payment reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></label>
      <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? (payment ? 'Saving…' : 'Recording…') : payment ? 'Save changes' : 'Record salary total'}</button></div>
    </form>
  </Modal>
}

export function BankDepositForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [bankName, setBankName] = useState('')
  const [accountReference, setAccountReference] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<SalesCurrency>('GMD')
  const [depositedAt, setDepositedAt] = useState(localDay(new Date()))
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [clientId] = useState(() => crypto.randomUUID())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    const value = Number(amount)
    if (bankName.trim().length < 2) return setErr('Enter a bank name of at least two characters.')
    if (!(value > 0) || !isFinite(value)) return setErr('Enter a deposit amount above zero.')
    if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return setErr('Use at most two decimal places for the deposit amount.')
    if (!depositedAt) return setErr('Choose the deposit date.')
    setBusy(true)
    try {
      await recordBankDeposit({
        bankName: bankName.trim(),
        accountReference: accountReference.trim(),
        amount: value,
        currency,
        depositedAt: financeDate(depositedAt),
        reference: reference.trim(),
        note: note.trim(),
        clientId,
      })
      onSaved()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not record the bank deposit.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title="Record bank deposit" onClose={onClose}>
    <form onSubmit={submit}>
      <p className="note mt-0">Record money deposited into a bank account. This is a transfer, not new income or an expense.</p>
      <label>Bank name<input value={bankName} onChange={(event) => setBankName(event.target.value)} maxLength={120} placeholder="e.g., bank or microfinance institution" required /></label>
      <label>Bank account reference (optional)<input value={accountReference} onChange={(event) => setAccountReference(event.target.value)} maxLength={120} placeholder="Account label or last digits" /></label>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>
        <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as SalesCurrency)}><option value="GMD">GMD</option><option value="XOF">XOF</option></select></label>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Date deposited<input type="date" value={depositedAt} onChange={(event) => setDepositedAt(event.target.value)} required /></label>
        <label>Deposit reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></label>
      </div>
      <label>Note (optional)<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={2} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record deposit'}</button></div>
    </form>
  </Modal>
}

export function ExpenseForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<ExpenseCategory>('rent')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<SalesCurrency>('GMD')
  const [paidAt, setPaidAt] = useState(localDay(new Date()))
  const [method, setMethod] = useState<PaymentMethod>('Cash')
  const [payee, setPayee] = useState('')
  const [description, setDescription] = useState('')
  const [reference, setReference] = useState('')
  const [clientId] = useState(() => crypto.randomUUID())
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    const value = Number(amount)
    if (!(value > 0) || !isFinite(value)) return setErr('Enter an expense amount above zero.')
    if (Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) return setErr('Use at most two decimal places for the expense amount.')
    if (category === 'other' && description.trim().length < 2) return setErr('Describe the other expense before saving.')
    if (!paidAt) return setErr('Choose the date paid.')
    setBusy(true)
    try {
      await recordMiscExpense({
        category,
        amount: value,
        currency,
        paidAt: financeDate(paidAt),
        method,
        payee: payee.trim(),
        description: description.trim(),
        reference: reference.trim(),
        clientId,
      })
      onSaved()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not record the expense.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title="Record miscellaneous expense" onClose={onClose}>
    <form onSubmit={submit}>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as ExpenseCategory)}>{EXPENSE_CATEGORIES.map((value) => <option key={value} value={value}>{EXPENSE_LABELS[value]}</option>)}</select></label>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label>
        <label>Currency<select value={currency} onChange={(event) => setCurrency(event.target.value as SalesCurrency)}><option value="GMD">GMD</option><option value="XOF">XOF</option></select></label>
      </div>
      <div className="grid gap-x-3 sm:grid-cols-2">
        <label>Date paid<input type="date" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} required /></label>
        <label>Payment method<select value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label>Payee / supplier (optional)<input value={payee} onChange={(event) => setPayee(event.target.value)} maxLength={160} /></label>
      <label>Description{category === 'other' ? '' : ' (optional)'}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={2} required={category === 'other'} /></label>
      <label>Reference (optional)<input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={120} /></label>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy}>{busy ? 'Recording…' : 'Record expense'}</button></div>
    </form>
  </Modal>
}

export function VoidFinanceDialog({ title, subject, onClose, onVoided }: {
  title: string
  subject: string
  onClose: () => void
  onVoided: (reason: string) => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setErr('')
    if (reason.trim().length < 2) return setErr('Enter a reason of at least two characters.')
    setBusy(true)
    try {
      await onVoided(reason.trim())
      onClose()
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Could not void this finance record.')
    } finally {
      setBusy(false)
    }
  }

  return <Modal open title={title} onClose={onClose}>
    <form onSubmit={submit}>
      <p className="mute mt-0">{subject}</p>
      <label>Reason for voiding<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} rows={3} required /></label>
      <p className="note">The record stays in the audit history but is excluded from all cash totals.</p>
      <p className="err" role="alert">{err}</p>
      <div className="mfoot"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn danger" disabled={busy}>{busy ? 'Voiding…' : 'Void record'}</button></div>
    </form>
  </Modal>
}
