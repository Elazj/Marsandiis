import type { ReceiptFormat } from '@/components/sales/ReceiptPaper'
import { cfaRateLabel } from '@/lib/money'
import type { ReceiptSnapshot } from '@/lib/sales'

const ink = '0.059 0.165 0.239'
const blue = '0.086 0.451 0.733'
const muted = '0.325 0.439 0.541'
const line = '0.804 0.886 0.949'
const escapePdf = (value: unknown) => String(value ?? '').replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
const amount = (value: unknown, currency: string) => `${(Number(value) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`
const JPEG_PREFIX = 'data:image/jpeg;base64,'

type JpegImage = { width: number; height: number; data: string }

function jpegImage(value?: string | null): JpegImage | null {
  if (!value?.startsWith(JPEG_PREFIX)) return null
  try {
    const data = atob(value.slice(JPEG_PREFIX.length))
    const bytes = Uint8Array.from(data, (char) => char.charCodeAt(0))
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null
    let offset = 2
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue }
      while (bytes[offset] === 0xff) offset += 1
      const marker = bytes[offset++]
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) return null
      const length = (bytes[offset] << 8) | bytes[offset + 1]
      if (length < 2 || offset + length > bytes.length) return null
      const frame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)
      if (frame) {
        const height = (bytes[offset + 3] << 8) | bytes[offset + 4]
        const width = (bytes[offset + 5] << 8) | bytes[offset + 6]
        return width > 0 && height > 0 ? { width, height, data } : null
      }
      offset += length
    }
  } catch {
    return null
  }
  return null
}

class ReceiptPdf {
  width: number
  height: number
  margin: number
  y: number
  pages: string[][] = []
  commands: string[] = []
  thermal: boolean
  logoImage: JpegImage | null

  constructor(format: ReceiptFormat, logo?: string | null) {
    this.thermal = format !== 'a4'
    this.logoImage = jpegImage(logo)
    this.width = format === '58' ? 164.4 : format === '80' ? 226.8 : 595.3
    this.height = 841.9
    this.margin = this.thermal ? 12 : 42
    this.y = this.height - this.margin
  }

  ensure(space: number) {
    if (this.y - space < 30) {
      this.pages.push(this.commands)
      this.commands = []
      this.y = this.height - this.margin
    }
  }

  text(value: unknown, size = 10, bold = false, x = this.margin, color = ink) {
    this.commands.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${this.y.toFixed(2)} Tm (${escapePdf(value)}) Tj ET`)
  }

  right(value: unknown, size = 10, bold = false, color = ink) {
    this.rightAt(value, this.width - this.margin, size, bold, color)
  }

  rightAt(value: unknown, right: number, size = 10, bold = false, color = ink) {
    const content = String(value ?? '')
    const x = right - content.length * size * (bold ? 0.55 : 0.5)
    this.text(content, size, bold, x, color)
  }

  wrap(value: unknown, size = 10, bold = false, indent = 0, leading = size * 1.35): number {
    const words = String(value ?? '').split(/\s+/).filter(Boolean)
    const available = this.width - this.margin * 2 - indent
    let current = ''
    let count = 0
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (candidate.length * size * (bold ? 0.55 : 0.5) > available && current) {
        this.ensure(leading)
        this.text(current, size, bold, this.margin + indent)
        this.y -= leading
        count += 1
        current = word
      } else current = candidate
    }
    if (current) {
      this.ensure(leading)
      this.text(current, size, bold, this.margin + indent)
      this.y -= leading
      count += 1
    }
    return count
  }

  rule(gap = 10) {
    this.ensure(gap + 1)
    this.commands.push(`${line} RG 0.5 w ${this.margin} ${this.y} m ${this.width - this.margin} ${this.y} l S`)
    this.y -= gap
  }

  row(label: string, value: string, bold = false, large = false) {
    this.ensure(large ? 24 : 18)
    this.text(label, large ? 11 : 9, false, this.margin, muted)
    this.right(value, large ? 13 : 10, bold)
    this.y -= large ? 24 : 18
  }

  logo() {
    const x = this.margin
    const y = this.y - 34
    if (this.logoImage) {
      this.commands.push(`q 34 0 0 34 ${x} ${y} cm /Im1 Do Q`)
      return
    }
    this.commands.push(`q ${blue} rg ${x} ${y} 34 34 re f Q`)
    this.commands.push(`q 1 1 1 rg ${x + 17} ${y + 7} m ${x + 27} ${y + 12} ${x + 17} ${y + 17} ${x + 7} ${y + 12} l h f Q`)
    this.commands.push(`q 1 1 1 rg ${x + 7} ${y + 12} m ${x + 17} ${y + 17} ${x + 17} ${y + 27} ${x + 7} ${y + 22} l h f Q`)
    this.commands.push(`q 0.88 0.88 0.88 rg ${x + 17} ${y + 17} m ${x + 27} ${y + 12} ${x + 27} ${y + 22} ${x + 17} ${y + 27} l h f Q`)
  }
}

export function receiptPdfBlob(snapshot: ReceiptSnapshot, format: ReceiptFormat): Blob {
  const { business, invoice, payment } = snapshot
  const pdf = new ReceiptPdf(format, business.logo)
  const showLogo = !!pdf.logoImage || business.logo === '/logo-icon.svg'
  if (showLogo) pdf.logo()
  const businessX = pdf.margin + (showLogo ? pdf.thermal ? 42 : 48 : 0)
  const businessY = pdf.y - 10
  pdf.text(business.name, pdf.thermal ? 10 : 15, true, businessX)
  pdf.y = businessY - 17
  const contacts = [business.address, business.phone, business.email].filter(Boolean).join(' · ')
  if (contacts) pdf.wrap(contacts, pdf.thermal ? 6.5 : 8, false, pdf.thermal ? 42 : 48, 9)
  pdf.y = Math.min(pdf.y - 10, pdf.height - pdf.margin - 58)
  pdf.rule(16)
  const title = snapshot.kind === 'Payment' ? 'PAYMENT RECEIPT' : 'INVOICE RECEIPT'
  const titleSize = pdf.thermal ? 11 : 16
  pdf.text(title, titleSize, true, (pdf.width - title.length * titleSize * 0.58) / 2)
  pdf.y -= 22
  pdf.row('Receipt no.', snapshot.receiptNo, true)
  pdf.row('Issued', new Date(snapshot.issuedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
  pdf.row('Invoice', invoice.number, true)
  pdf.row('Invoice date', invoice.date)
  pdf.row('Customer', invoice.customer)
  pdf.row('Currency', invoice.currency)
  if (invoice.currency === 'XOF') pdf.row('Exchange rate', cfaRateLabel(invoice.exchangeRate))
  pdf.rule(12)

  if (payment) {
    pdf.text('PAYMENT RECEIVED', pdf.thermal ? 8 : 10, true, pdf.margin, blue)
    pdf.y -= 20
    pdf.row('Amount paid', amount(payment.amount, invoice.currency), true, true)
    pdf.row('Balance after payment', amount(payment.balanceAfter, invoice.currency), true)
    pdf.row('Payment method', payment.method)
    pdf.row('Payment date', new Date(payment.paidAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
    if (payment.note) pdf.wrap(`Note: ${payment.note}`, 8, false, 0, 11)
    pdf.rule(14)
  }

  pdf.text('PRODUCTS', pdf.thermal ? 8 : 10, true, pdf.margin, blue)
  pdf.y -= 16
  for (const item of snapshot.items) {
    if (pdf.thermal) {
      pdf.ensure(42)
      pdf.wrap(item.productName, 8, true, 0, 11)
      pdf.wrap(`${item.quantity} x ${amount(item.unitPrice, invoice.currency)}`, 7, false, 0, 10)
      pdf.text(amount(item.total, invoice.currency), 8, true)
      pdf.y -= 8
    } else {
      const lines = Math.max(1, Math.ceil(item.productName.length / 34))
      pdf.ensure(lines * 12 + 10)
      pdf.text(item.productName, 9, false)
      pdf.text(String(item.quantity), 9, false, pdf.width * 0.45)
      pdf.rightAt(amount(item.unitPrice, invoice.currency), pdf.width * 0.72, 8)
      pdf.right(amount(item.total, invoice.currency), 8, true)
      pdf.y -= lines * 12 + 5
      pdf.rule(5)
    }
  }
  pdf.y -= 5
  pdf.row('Subtotal', amount(snapshot.items.reduce((sum, item) => sum + Number(item.total), 0), invoice.currency))
  pdf.row('Total invoice', amount(invoice.totalAmount, invoice.currency), true)
  pdf.row('Amount paid at issue', amount(invoice.amountPaid, invoice.currency))
  pdf.row('Outstanding balance', amount(payment ? payment.balanceAfter : invoice.outstanding, invoice.currency), true)
  pdf.row('Payment status', invoice.paymentStatus)
  pdf.row('Payment method', payment?.method ?? invoice.paymentMethod ?? 'Not recorded')
  if (invoice.note) {
    pdf.y -= 5
    pdf.wrap(`Invoice note: ${invoice.note}`, 8, false, 0, 11)
  }
  pdf.y -= 10
  pdf.wrap(business.footer || 'Thank you for your business.', pdf.thermal ? 7 : 9, true, 0, 12)
  pdf.pages.push(pdf.commands)

  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ]
  if (pdf.logoImage) {
    const image = pdf.logoImage
    objects.push(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.data.length} >>\nstream\n${image.data}\nendstream`)
  }
  const pageIds = pdf.pages.map((_, index) => (pdf.logoImage ? 6 : 5) + index * 2)
  objects[1] = `<< /Type /Pages /Count ${pdf.pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] >>`
  pdf.pages.forEach((commands, index) => {
    const footer = `BT /F1 ${pdf.thermal ? 5.5 : 7} Tf ${muted} rg 1 0 0 1 ${pdf.margin} 16 Tm (${escapePdf(`${snapshot.receiptNo} - Page ${index + 1} of ${pdf.pages.length}`)}) Tj ET`
    const background = `q 1 1 1 rg 0 0 ${pdf.width.toFixed(2)} ${pdf.height.toFixed(2)} re f Q`
    const stream = [background, ...commands, footer].join('\n')
    const pageId = pageIds[index]
    objects[pageId - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdf.width.toFixed(2)} ${pdf.height.toFixed(2)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${pdf.logoImage ? ' /XObject << /Im1 5 0 R >>' : ''} >> /Contents ${pageId + 1} 0 R >>`
    objects[pageId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
  })

  let output = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(output.length)
    output += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xref = output.length
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index += 1) output += `${String(offsets[index]).padStart(10, '0')} 00000 n \n`
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
  // PDF offsets count bytes, so emit Latin-1 bytes instead of UTF-8.
  const bytes = Uint8Array.from(output, (char) => char.charCodeAt(0))
  return new Blob([bytes], { type: 'application/pdf' })
}

export function downloadReceiptPdf(snapshot: ReceiptSnapshot, format: ReceiptFormat) {
  const url = URL.createObjectURL(receiptPdfBlob(snapshot, format))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${snapshot.receiptNo}-${format === 'a4' ? 'A4' : `${format}mm`}.pdf`
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
