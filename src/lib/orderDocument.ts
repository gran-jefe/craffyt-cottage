import type { Order, PaymentMethod, StoreSettings } from '@/types/store'
import { formatPhone } from '@/lib/phone'

/**
 * Invoices and receipts for an order, as a PDF and as a plain-text message for WhatsApp or
 * email. Built in the browser, so nothing needs a mail server or paid service to work.
 *
 * Invoice: what the customer owes, with the bank details to pay into.
 * Receipt: proof that the order was paid for.
 */
export type OrderDocKind = 'invoice' | 'receipt'

const PAID_STATUSES = new Set(['payment_confirmed', 'processing', 'dispatched', 'delivered'])

export function isOrderPaid(order: Pick<Order, 'status'>): boolean {
  return PAID_STATUSES.has(order.status)
}

/** Receipts only exist once money has been received. */
export function availableDocKinds(order: Pick<Order, 'status'>): OrderDocKind[] {
  if (order.status === 'cancelled') return []
  return isOrderPaid(order) ? ['receipt', 'invoice'] : ['invoice']
}

export function docTitle(kind: OrderDocKind): string {
  return kind === 'invoice' ? 'Invoice' : 'Receipt'
}

/** e.g. INV-CC-7K9P2M, stable for the same order so a resend keeps its number. */
export function docNumber(kind: OrderDocKind, order: Pick<Order, 'orderCode'>): string {
  return `${kind === 'invoice' ? 'INV' : 'RCT'}-${order.orderCode}`
}

export function docFileName(kind: OrderDocKind, order: Pick<Order, 'orderCode'>): string {
  return `Crafty-Cottage-${docTitle(kind)}-${order.orderCode}.pdf`
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  pos: 'POS / card',
  other: 'Other',
}

/** The PDF's built-in font has no ₦ glyph, so documents spell the currency out. */
function ngn(amount: number): string {
  return `NGN ${Math.round(amount).toLocaleString('en-NG')}`
}

function dateText(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' })
}

function trackingUrl(order: Pick<Order, 'orderCode'>): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/track?code=${encodeURIComponent(order.orderCode)}`
}

function paymentText(order: Order): string {
  if (order.paymentMethod) return PAYMENT_LABELS[order.paymentMethod]
  return order.channel === 'offline' ? 'In person' : 'Bank transfer'
}

/** Short message to go with the PDF, or to send on its own when a file can't be attached. */
export function orderDocMessage(kind: OrderDocKind, order: Order, settings: StoreSettings | null): string {
  const brand = settings?.brandName || 'Crafty Cottage'
  const firstName = order.customerName.trim().split(/\s+/)[0] || 'there'
  const lines = [
    `Hello ${firstName},`,
    '',
    kind === 'receipt'
      ? `Thank you for your payment. Here is your receipt for ${brand} order ${order.orderCode}.`
      : `Here is your invoice for ${brand} order ${order.orderCode}.`,
    '',
    ...order.items.map(
      (i) => `${i.quantity} x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}: ${ngn(i.price * i.quantity)}`
    ),
  ]
  if (order.deliveryFee > 0) lines.push(`Delivery: ${ngn(order.deliveryFee)}`)
  lines.push(`${kind === 'receipt' ? 'Total paid' : 'Amount due'}: ${ngn(order.total)}`)
  if (kind === 'invoice' && settings?.accountNumber) {
    lines.push('', 'Pay by bank transfer to:', `${settings.bankName}`, `${settings.accountName}`, `${settings.accountNumber}`)
  }
  if (order.channel !== 'offline') lines.push('', `Track your order: ${trackingUrl(order)}`)
  lines.push('', `${docTitle(kind)} number: ${docNumber(kind, order)}`, '', `Thank you for shopping handmade.`, brand)
  return lines.join('\n')
}

const TEAL: [number, number, number] = [11, 61, 58]
const INK: [number, number, number] = [15, 31, 29]
const MUTED: [number, number, number] = [63, 79, 76]
const LINE: [number, number, number] = [226, 218, 202]
const GOLD: [number, number, number] = [230, 201, 117]

/** Builds the invoice or receipt as an A4 PDF. jsPDF is loaded only when this runs. */
export async function buildOrderPdf(kind: OrderDocKind, order: Order, settings: StoreSettings | null): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 18
  const brand = settings?.brandName || 'Crafty Cottage'
  const paid = kind === 'receipt'

  doc.setProperties({ title: `${brand} ${docTitle(kind)} ${order.orderCode}`, author: brand })

  // Header band
  doc.setFillColor(...TEAL)
  doc.rect(0, 0, W, 34, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setCharSpace(1.2)
  doc.text(brand.toUpperCase(), M, 17)
  doc.setCharSpace(0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...GOLD)
  doc.text(settings?.tagline || 'Hand-beaded in Nigeria', M, 24)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(docTitle(kind).toUpperCase(), W - M, 19, { align: 'right' })

  // Status stamp
  let y = 46
  doc.setFontSize(9)
  const stamp = paid ? 'PAID' : order.status === 'pending_verification' && order.receiptUrl ? 'PAYMENT BEING VERIFIED' : 'AMOUNT DUE'
  const stampW = doc.getTextWidth(stamp) + 8
  doc.setDrawColor(...(paid ? TEAL : ([180, 35, 24] as [number, number, number])))
  doc.setTextColor(...(paid ? TEAL : ([180, 35, 24] as [number, number, number])))
  doc.setLineWidth(0.5)
  doc.roundedRect(W - M - stampW, y - 5, stampW, 7.5, 1.5, 1.5, 'S')
  doc.text(stamp, W - M - stampW / 2, y, { align: 'center' })

  // Document details (left) and billed-to (right)
  const label = (text: string, x: number, yy: number) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(text.toUpperCase(), x, yy)
  }
  const value = (text: string, x: number, yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(text, x, yy)
  }

  y = 60
  const col2 = W / 2 + 4
  label(`${docTitle(kind)} number`, M, y)
  value(docNumber(kind, order), M, y + 5, true)
  label('Order reference', M, y + 13)
  value(order.orderCode, M, y + 18)
  label('Order date', M, y + 26)
  value(dateText(order.createdAt), M, y + 31)
  label(paid ? 'Receipt date' : 'Invoice date', M, y + 39)
  value(dateText(paid ? order.updatedAt : new Date().toISOString()), M, y + 44)

  label(paid ? 'Received from' : 'Billed to', col2, y)
  const billed = [
    order.customerName,
    order.customerPhone ? formatPhone(order.customerPhone) : '',
    order.customerEmail || '',
    ...(order.address ? doc.splitTextToSize(order.address, W - M - col2) as string[] : []),
    order.channel === 'offline' ? order.offlineSource || 'In-person sale' : order.deliveryZone,
  ].filter(Boolean)
  billed.forEach((line, i) => value(line, col2, y + 5 + i * 5, i === 0))

  // Items table
  y = Math.max(y + 54, y + 10 + billed.length * 5)
  const cols = { item: M, qty: W - M - 62, unit: W - M - 30, amount: W - M }
  const tableHeader = () => {
    doc.setFillColor(244, 239, 230)
    doc.rect(M, y - 5, W - 2 * M, 8, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text('ITEM', cols.item + 2, y)
    doc.text('QTY', cols.qty, y, { align: 'right' })
    doc.text('UNIT PRICE', cols.unit, y, { align: 'right' })
    doc.text('AMOUNT', cols.amount - 2, y, { align: 'right' })
    y += 9
  }
  tableHeader()

  for (const item of order.items) {
    const name = doc.splitTextToSize(item.name, cols.qty - cols.item - 14) as string[]
    const rowH = name.length * 4.6 + (item.variantLabel ? 4.6 : 0) + 3
    if (y + rowH > H - 50) {
      doc.addPage()
      y = 24
      tableHeader()
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(name, cols.item + 2, y)
    let ly = y + (name.length - 1) * 4.6
    if (item.variantLabel) {
      ly += 4.6
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...MUTED)
      doc.text(item.variantLabel, cols.item + 2, ly)
    }
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(String(item.quantity), cols.qty, y, { align: 'right' })
    doc.text(ngn(item.price), cols.unit, y, { align: 'right' })
    doc.text(ngn(item.price * item.quantity), cols.amount - 2, y, { align: 'right' })
    y = ly + 3
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.2)
    doc.line(M, y, W - M, y)
    y += 6
  }

  // Totals
  const totalRow = (text: string, amount: string, strong = false) => {
    doc.setFont('helvetica', strong ? 'bold' : 'normal')
    doc.setFontSize(strong ? 12 : 10)
    doc.setTextColor(...(strong ? TEAL : INK))
    doc.text(text, cols.unit - 22, y, { align: 'right' })
    doc.text(amount, cols.amount - 2, y, { align: 'right' })
    y += strong ? 8 : 6
  }
  if (y > H - 70) {
    doc.addPage()
    y = 24
  }
  totalRow('Subtotal', ngn(order.subtotal))
  totalRow(order.channel === 'offline' ? 'Delivery' : `Delivery (${order.deliveryZone || 'n/a'})`.slice(0, 48), order.deliveryFee > 0 ? ngn(order.deliveryFee) : 'Free')
  doc.setDrawColor(...TEAL)
  doc.setLineWidth(0.4)
  doc.line(cols.unit - 50, y - 3, W - M, y - 3)
  y += 2
  totalRow(paid ? 'Total paid' : 'Amount due', ngn(order.total), true)

  // Payment block
  y += 4
  doc.setDrawColor(...LINE)
  doc.setLineWidth(0.3)
  if (paid) {
    label('Payment', M, y)
    value(`${paymentText(order)}, received in full`, M, y + 5)
    y += 14
  } else if (settings?.accountNumber) {
    doc.setFillColor(250, 248, 244)
    doc.roundedRect(M, y - 5, W - 2 * M, 26, 2, 2, 'FD')
    label('Pay by bank transfer to', M + 4, y + 1)
    value(settings.bankName, M + 4, y + 7)
    value(settings.accountName, M + 4, y + 12.5)
    value(settings.accountNumber, M + 4, y + 18, true)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text(`Use ${order.orderCode} as the transfer description.`, W - M - 4, y + 18, { align: 'right' })
    y += 30
  }

  if (order.notes) {
    label('Note', M, y)
    const note = doc.splitTextToSize(order.notes, W - 2 * M) as string[]
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...INK)
    doc.text(note.slice(0, 6), M, y + 5)
  }

  // Footer on every page
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...LINE)
    doc.setLineWidth(0.3)
    doc.line(M, H - 26, W - M, H - 26)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...TEAL)
    doc.text('Thank you for shopping handmade.', M, H - 19)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    const contact = [
      settings?.whatsappNumber ? `WhatsApp ${formatPhone('+' + settings.whatsappNumber.replace(/\D/g, ''))}` : '',
      settings?.instagramHandle ? `Instagram @${settings.instagramHandle.replace(/^@/, '')}` : '',
    ]
      .filter(Boolean)
      .join('   ·   ')
    if (contact) doc.text(contact, M, H - 14)
    if (order.channel !== 'offline') doc.text(`Track this order: ${trackingUrl(order)}`, M, H - 9)
    if (pages > 1) doc.text(`Page ${p} of ${pages}`, W - M, H - 9, { align: 'right' })
  }

  return doc.output('blob')
}

/** Saves a file through the browser's normal download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
