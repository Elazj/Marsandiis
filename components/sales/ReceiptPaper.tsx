import { cfaRateLabel, money } from '@/lib/money'
import type { ReceiptSnapshot } from '@/lib/sales'

export type ReceiptFormat = 'a4' | '58' | '80'

export function ReceiptPaper({ snapshot, format }: { snapshot: ReceiptSnapshot; format: ReceiptFormat }) {
  const { business, invoice, payment } = snapshot
  const contacts = [business.address, business.phone, business.email].filter(Boolean)
  return <article className={`receipt-paper receipt-${format}`} aria-label={`${snapshot.kind} receipt ${snapshot.receiptNo}`}>
    <header className="receipt-head">
      {business.logo ? <img src={business.logo} alt={`${business.name} logo`} /> : null}
      <div><h2>{business.name}</h2>{contacts.length ? <p>{contacts.join(' · ')}</p> : null}</div>
    </header>
    <div className="receipt-title">{snapshot.kind === 'Payment' ? 'PAYMENT RECEIPT' : 'INVOICE RECEIPT'}</div>
    <dl className="receipt-meta">
      <div><dt>Receipt no.</dt><dd>{snapshot.receiptNo}</dd></div>
      <div><dt>Issued</dt><dd>{new Date(snapshot.issuedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
      <div><dt>Invoice</dt><dd>{invoice.number}</dd></div>
      <div><dt>Invoice date</dt><dd>{invoice.date}</dd></div>
      <div><dt>Customer</dt><dd>{invoice.customer}</dd></div>
      <div><dt>Currency</dt><dd>{invoice.currency}</dd></div>
      {invoice.currency === 'XOF' ? <div><dt>Exchange rate</dt><dd>{cfaRateLabel(invoice.exchangeRate)}</dd></div> : null}
    </dl>

    {payment ? <section className="receipt-payment-callout">
      <div><span>Amount received</span><b>{money(payment.amount, invoice.currency)}</b></div>
      <div><span>Balance after payment</span><b>{money(payment.balanceAfter, invoice.currency)}</b></div>
      <p>Paid on {new Date(payment.paidAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} by {payment.method}</p>
      {payment.note ? <p>Note: {payment.note}</p> : null}
    </section> : null}

    <table className="receipt-items">
      <thead><tr><th>Product</th><th className="n">Qty</th><th className="n">Unit price</th><th className="n">Total</th></tr></thead>
      <tbody>{snapshot.items.map((item, index) => <tr key={item.id ?? `${item.productId}-${index}`}><td>{item.productName}</td><td className="n">{item.quantity}</td><td className="n">{money(item.unitPrice, invoice.currency)}</td><td className="n">{money(item.total, invoice.currency)}</td></tr>)}</tbody>
    </table>

    <div className="receipt-totals">
      <div><span>Subtotal</span><span>{money(snapshot.items.reduce((sum, item) => sum + Number(item.total), 0), invoice.currency)}</span></div>
      <div><span>Total invoice</span><b>{money(invoice.totalAmount, invoice.currency)}</b></div>
      {!payment ? <><div><span>Amount paid</span><span>{money(invoice.amountPaid, invoice.currency)}</span></div><div><span>Outstanding balance</span><b>{money(invoice.outstanding, invoice.currency)}</b></div></> : null}
    </div>
    <dl className="receipt-status">
      <div><dt>Payment status</dt><dd>{invoice.paymentStatus}</dd></div>
      <div><dt>Payment method</dt><dd>{payment?.method ?? invoice.paymentMethod ?? 'Not recorded'}</dd></div>
      {!payment ? <div><dt>Outstanding balance</dt><dd>{money(invoice.outstanding, invoice.currency)}</dd></div> : null}
    </dl>
    {invoice.note ? <p className="receipt-note">Invoice note: {invoice.note}</p> : null}
    <footer className="receipt-foot">{business.footer || 'Thank you for your business.'}<span>Receipt {snapshot.receiptNo} · {snapshot.kind === 'Payment' ? 'Payment receipt' : 'Invoice receipt'}</span></footer>
  </article>
}
