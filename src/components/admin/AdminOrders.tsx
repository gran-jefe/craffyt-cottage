'use client'

import React, { useEffect, useState } from 'react'
import {
  Eye,
  CheckCircle2,
  X,
  MessageCircle,
  Loader2,
  Receipt,
  Plus,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  ChevronDown,
  Truck,
  XCircle,
  FileText,
} from 'lucide-react'
import {
  StockShortageError,
  isStockDeducted,
  stockHeldByOrder,
  updateOrderStatus,
} from '@/lib/storeService'
import { formatNaira } from '@/lib/defaults'
import { findVariant, variantPrice } from '@/lib/variants'
import { useCart } from '@/context/CartContext'
import { OfflineSaleModal } from '@/components/admin/OfflineSaleModal'
import { OrderDocumentDialog } from '@/components/admin/OrderDocumentDialog'
import { useDialogFocus } from '@/lib/useDialogFocus'
import type {
  DeliveryZone,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  Product,
  StoreSettings,
} from '@/types/store'
import { formatPhone, whatsappDigits } from '@/lib/phone'

interface Props {
  orders: Order[]
  products: Product[]
  /** Current zones from store settings; empty when settings aren't saved (fee check skipped). */
  deliveryZones: DeliveryZone[]
  /** Bank and contact details printed on invoices and receipts. */
  settings: StoreSettings | null
  onRefresh: () => Promise<void>
  /** Open with this status filter applied (e.g. from the overview's "Review receipts"). */
  initialStatusFilter?: OrderStatus
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  pos: 'POS / Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

const STATUS_LABELS: Record<OrderStatus, { label: string; badge: string }> = {
  pending_verification: { label: 'Pending verification', badge: 'bg-amber-100 text-amber-900' },
  payment_confirmed: { label: 'Payment confirmed', badge: 'bg-[#E3F0EE] text-[#0B3D3A]' },
  processing: { label: 'Processing', badge: 'bg-sky-100 text-sky-900' },
  dispatched: { label: 'Dispatched', badge: 'bg-purple-100 text-purple-900' },
  delivered: { label: 'Delivered', badge: 'bg-emerald-100 text-emerald-900' },
  cancelled: { label: 'Cancelled', badge: 'bg-red-100 text-[#B42318]' },
}

/** Firebase download URLs encode the storage path; demo mode uses data: URLs. */
function isPdfReceipt(url: string): boolean {
  if (url.startsWith('data:')) return url.startsWith('data:application/pdf')
  try {
    return /\.pdf$/i.test(decodeURIComponent(new URL(url).pathname))
  } catch {
    return /\.pdf(\?|$)/i.test(url)
  }
}

/**
 * Browsers refuse to open data: URLs in a new tab or frame, so a PDF stored inline (Spark plan)
 * is decoded into a same-origin blob: URL that can be previewed and opened.
 */
function dataUrlToBlobUrl(dataUrl: string): string | null {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(dataUrl)
  if (!match) return null
  try {
    const binary = atob(match[2])
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return URL.createObjectURL(new Blob([bytes], { type: match[1] }))
  } catch {
    return null
  }
}

function PdfReceipt({ url, orderCode }: { url: string; orderCode: string }) {
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url.startsWith('data:')) {
      setViewUrl(url)
      setFailed(false)
      return
    }
    const blobUrl = dataUrlToBlobUrl(url)
    setViewUrl(blobUrl)
    setFailed(!blobUrl)
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [url])

  if (failed) {
    return (
      <p role="alert" className="py-10 px-4 text-sm text-[#B42318] text-center">
        This PDF receipt couldn&apos;t be read. Ask the customer to resend it on WhatsApp before confirming payment.
      </p>
    )
  }
  if (!viewUrl) return <Loader2 className="w-6 h-6 my-10 animate-spin text-[#0B3D3A]" />

  return (
    <div className="w-full space-y-2">
      <iframe
        src={viewUrl}
        title={`PDF payment receipt for ${orderCode}`}
        className="w-full h-[55vh] rounded-xl bg-white border border-[#E2DACA]"
      />
      <a
        href={viewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="min-h-[44px] inline-flex items-center gap-1.5 px-2 text-sm font-bold text-[#0B3D3A] underline"
      >
        <ExternalLink className="w-4 h-4" />
        <span>Open PDF in a new tab</span>
      </a>
    </div>
  )
}

/**
 * Order totals are sent by the customer's browser, and Firestore rules can't sum a list,
 * so re-check the arithmetic here and compare line prices with today's catalogue.
 * Returns plain-language problems for the admin to resolve before confirming payment.
 */
function auditOrderTotals(order: Order, products: Product[], zones: DeliveryZone[]): string[] {
  if (order.channel === 'offline') return [] // admin-entered, may include discounts
  const issues: string[] = []
  const itemsSum = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  if (Math.abs(itemsSum - order.subtotal) >= 1) {
    issues.push(`Items add up to ${formatNaira(itemsSum)}, but the order subtotal says ${formatNaira(order.subtotal)}.`)
  }
  if (Math.abs(order.subtotal + order.deliveryFee - order.total) >= 1) {
    issues.push(
      `Subtotal plus delivery is ${formatNaira(order.subtotal + order.deliveryFee)}, but the order total says ${formatNaira(order.total)}.`
    )
  }
  // The delivery fee comes from the customer's browser too: compare it with the zone they picked.
  if (zones.length > 0) {
    const zone = zones.find((z) => z.label === order.deliveryZone)
    if (!zone) {
      issues.push(
        `Delivery zone "${order.deliveryZone}" isn't one of your current zones (it may have been renamed). Check the ${formatNaira(order.deliveryFee)} delivery fee.`
      )
    } else if (Math.abs(zone.fee - order.deliveryFee) >= 1) {
      issues.push(
        `Delivery was charged at ${formatNaira(order.deliveryFee)}; ${zone.label} costs ${formatNaira(zone.fee)}.`
      )
    }
  }
  const live = new Map(products.map((p) => [p.id, p]))
  for (const item of order.items) {
    const p = live.get(item.productId)
    const name = item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name
    const variant = p ? findVariant(p, item.variantId) : undefined
    if (!p || (item.variantId && !variant)) {
      issues.push(`${name} (${formatNaira(item.price)}) isn't in your inventory. Check its price before confirming.`)
      continue
    }
    const listed = variant ? variantPrice(p, variant) : p.price
    if (item.price < listed) {
      issues.push(`${name} was ordered at ${formatNaira(item.price)}; it is listed at ${formatNaira(listed)} today.`)
    }
  }
  return issues
}

function TotalsWarning({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null
  return (
    <div role="note" className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5">
      <p className="flex items-center gap-1.5 font-bold text-sm">
        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
        Check this total before confirming payment
      </p>
      <ul className="list-disc pl-5 space-y-0.5">
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      <p>A price may have changed since the order was placed. Match the transfer to what you expect to receive.</p>
    </div>
  )
}

/** The single forward step offered for each status. Pending is handled via the receipt review. */
const NEXT_STEP: Partial<Record<OrderStatus, { next: OrderStatus; label: string }>> = {
  payment_confirmed: { next: 'processing', label: 'Start preparing' },
  processing: { next: 'dispatched', label: 'Mark as dispatched' },
  dispatched: { next: 'delivered', label: 'Mark as delivered' },
}

interface OrderActionsProps {
  order: Order
  busy: boolean
  anyBusy: boolean
  waPhone: string
  noteDraft: string
  onNoteChange: (value: string) => void
  onStatusChange: (next: OrderStatus) => Promise<boolean>
  onOpenReceipt: () => void
  onOpenDocument: () => void
  onRequestCancel: () => void
}

/**
 * One primary action per order (the next step in its lifecycle), quiet secondary links, and
 * rarely-needed tools (notes, manual corrections, cancel) tucked behind "More".
 */
function OrderActions({
  order,
  busy,
  anyBusy,
  waPhone,
  noteDraft,
  onNoteChange,
  onStatusChange,
  onOpenReceipt,
  onOpenDocument,
  onRequestCancel,
}: OrderActionsProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [dispatching, setDispatching] = useState(false)
  const step = NEXT_STEP[order.status]
  const isPending = order.status === 'pending_verification'
  const noteChanged = noteDraft.trim() !== (order.dispatchNote ?? '').trim()
  const morePanelId = `order-more-${order.id}`
  const noteId = `order-note-${order.id}`
  const dispatchNoteId = `order-dispatch-note-${order.id}`

  const primaryClass =
    'min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] active:bg-[#021817] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed'
  const secondaryClass =
    'min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] bg-white hover:border-[#0B3D3A] hover:bg-[#FAF8F4] text-xs font-bold text-[#0F1F1D] inline-flex items-center gap-1.5 transition-colors'

  async function advance(next: OrderStatus) {
    if (await onStatusChange(next)) {
      setDispatching(false)
    }
  }

  return (
    <div className="space-y-3">
      {dispatching ? (
        <div className="p-3.5 rounded-xl bg-[#FAF8F4] border border-[#E2DACA] space-y-3">
          <div>
            <label htmlFor={dispatchNoteId} className="block text-xs font-bold text-[#0F1F1D] mb-1">
              Rider or tracking note <span className="font-normal text-[#3F4F4C]">(optional)</span>
            </label>
            <input
              id={dispatchNoteId}
              autoFocus
              type="text"
              maxLength={500}
              value={noteDraft}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder="e.g. GIG waybill 1234567, or rider Tunde 0803 000 0000"
              aria-describedby={`${dispatchNoteId}-hint`}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#8C8270] bg-white text-sm"
            />
            <p id={`${dispatchNoteId}-hint`} className="mt-1 text-xs text-[#3F4F4C]">
              The customer sees this on their tracking page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => advance('dispatched')} className={primaryClass}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4 text-[#E6C975]" />}
              <span>{busy ? 'Updating…' : 'Confirm dispatch'}</span>
            </button>
            <button type="button" disabled={busy} onClick={() => setDispatching(false)} className={secondaryClass}>
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {isPending && (
            <button
              type="button"
              disabled={anyBusy}
              onClick={order.receiptUrl ? onOpenReceipt : () => advance('payment_confirmed')}
              className={primaryClass}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-[#E6C975]" />}
              <span>{order.receiptUrl ? 'Review receipt and verify' : 'Verify payment'}</span>
            </button>
          )}

          {step && (
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => (step.next === 'dispatched' ? setDispatching(true) : advance(step.next))}
              className={primaryClass}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 text-[#E6C975]" />}
              <span>{busy ? 'Updating…' : step.label}</span>
            </button>
          )}

          {!isPending && order.receiptUrl && (
            <button type="button" onClick={onOpenReceipt} className={secondaryClass}>
              <Eye className="w-3.5 h-3.5" />
              <span>View receipt</span>
            </button>
          )}

          {order.status !== 'cancelled' && (
            <button type="button" onClick={onOpenDocument} className={secondaryClass}>
              <FileText className="w-3.5 h-3.5 text-[#0B3D3A]" />
              <span>{order.status === 'pending_verification' ? 'Invoice' : 'Receipt'}</span>
            </button>
          )}

          {waPhone && (
            <a
              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                `Hello ${order.customerName}, thank you for your Crafty Cottage order (${order.orderCode}).`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className={secondaryClass}
            >
              <MessageCircle className="w-3.5 h-3.5 text-[#0B3D3A]" />
              <span>WhatsApp</span>
            </a>
          )}

          <button
            type="button"
            aria-expanded={moreOpen}
            aria-controls={morePanelId}
            onClick={() => setMoreOpen((o) => !o)}
            className="ml-auto min-h-[44px] px-3 rounded-xl text-xs font-bold text-[#3F4F4C] hover:text-[#0F1F1D] hover:bg-[#F4EFE6] inline-flex items-center gap-1 transition-colors"
          >
            <span>More</span>
            <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${moreOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>
      )}

      {moreOpen && !dispatching && (
        <div
          id={morePanelId}
          className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-[#F4EFE6]"
        >
          <div className="md:col-span-7">
            <label htmlFor={noteId} className="block text-xs font-bold text-[#0F1F1D] mb-1">
              Delivery note <span className="font-normal text-[#3F4F4C]">(shown on the tracking page)</span>
            </label>
            <div className="flex gap-2">
              <input
                id={noteId}
                type="text"
                maxLength={500}
                value={noteDraft}
                onChange={(e) => onNoteChange(e.target.value)}
                placeholder="Rider, waybill or pickup details"
                className="flex-1 min-w-0 min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-xs"
              />
              <button
                type="button"
                disabled={anyBusy || !noteChanged}
                onClick={() => onStatusChange(order.status)}
                className={`${secondaryClass} shrink-0 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Save note
              </button>
            </div>
          </div>

          <div className="md:col-span-5">
            <label htmlFor={`order-status-${order.id}`} className="block text-xs font-bold text-[#0F1F1D] mb-1">
              Correct the status
            </label>
            <select
              id={`order-status-${order.id}`}
              disabled={anyBusy}
              value={order.status}
              aria-describedby={`order-status-${order.id}-hint`}
              onChange={(e) => {
                const next = e.target.value as OrderStatus
                if (next === 'cancelled') onRequestCancel()
                else onStatusChange(next)
              }}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-xs font-semibold"
            >
              {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st].label}
                </option>
              ))}
            </select>
            <p id={`order-status-${order.id}-hint`} className="mt-1 text-xs text-[#3F4F4C]">
              Only to fix a mistake. Moving to a paid status takes the items off stock if they aren’t already.
            </p>
          </div>

          {order.status !== 'cancelled' && (
            <div className="md:col-span-12">
              <button
                type="button"
                disabled={anyBusy}
                onClick={onRequestCancel}
                className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-[#B42318] hover:bg-red-50 inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>Cancel order</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AdminOrders({ orders, products, deliveryZones, settings, onRefresh, initialStatusFilter }: Props) {
  const { showToast } = useCart()
  const [filterChannel, setFilterChannel] = useState<'all' | OrderChannel>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | OrderStatus>(initialStatusFilter ?? 'all')
  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null)
  const [docOrder, setDocOrder] = useState<Order | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [restockOnCancel, setRestockOnCancel] = useState(true)
  const receiptRef = useDialogFocus<HTMLDivElement>(Boolean(receiptModalOrder))

  useEffect(() => {
    if (!receiptModalOrder) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !updatingId) setReceiptModalOrder(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [receiptModalOrder, updatingId])

  const offlineCount = orders.filter((o) => o.channel === 'offline').length
  const onlineCount = orders.length - offlineCount

  const filtered = orders.filter((o) => {
    const channel: OrderChannel = o.channel === 'offline' ? 'offline' : 'online'
    const matchesChannel = filterChannel === 'all' || channel === filterChannel
    const matchesStatus = filterStatus === 'all' || o.status === filterStatus
    return matchesChannel && matchesStatus
  })

  async function handleStatusChange(
    order: Order,
    nextStatus: OrderStatus,
    options: { restock?: boolean } = {}
  ): Promise<boolean> {
    if (updatingId) return false
    setUpdatingId(order.id)
    try {
      const note = noteDrafts[order.id] ?? order.dispatchNote ?? ''
      const { stockChange } = await updateOrderStatus(order, nextStatus, note, options)
      await onRefresh()
      const units = Math.abs(stockChange)
      const unitText = `${units} ${units === 1 ? 'item' : 'items'}`
      const stockText =
        stockChange > 0 ? ` ${unitText} put back in stock.` : stockChange < 0 ? ` ${unitText} taken off stock.` : ''
      showToast(
        nextStatus === 'payment_confirmed' && order.status === 'pending_verification'
          ? `Payment verified for ${order.orderCode}.${stockText}`
          : nextStatus === 'cancelled'
            ? `${order.orderCode} cancelled.${stockText}`
            : `${order.orderCode} is now ${STATUS_LABELS[nextStatus].label.toLowerCase()}.${stockText}`
      )
      return true
    } catch (err) {
      showToast(
        err instanceof StockShortageError
          ? `${order.orderCode}: ${err.message}`
          : `Could not update ${order.orderCode}. Check your connection and try again.`,
        'error'
      )
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">
            Orders and offline sales
          </h2>
          <p className="text-xs text-[#3F4F4C]">
            Verify online transfer receipts, record offline walk-in or DM sales, and update delivery status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter orders by channel"
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value as 'all' | OrderChannel)}
            className="min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold"
          >
            <option value="all">All channels ({orders.length})</option>
            <option value="online">Online ({onlineCount})</option>
            <option value="offline">Offline ({offlineCount})</option>
          </select>

          <select
            aria-label="Filter orders by status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as 'all' | OrderStatus)}
            className="min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold"
          >
            <option value="all">All statuses ({orders.length})</option>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((key) => (
              <option key={key} value={key}>
                {STATUS_LABELS[key].label} ({orders.filter((o) => o.status === key).length})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setOfflineModalOpen(true)}
            className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#E6C975]" />
            <span>Record offline sale</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-3">
          <Receipt className="w-8 h-8 text-[#3F4F4C] mx-auto opacity-60" />
          <p className="font-serif-display text-lg font-bold text-[#0F1F1D]">
            {orders.length === 0 ? 'No orders or offline sales yet' : 'No orders match this filter'}
          </p>
          <p className="text-sm text-[#3F4F4C]">
            {orders.length === 0
              ? 'Customer checkout orders will appear here, or you can log an in-person or DM purchase.'
              : 'Try resetting the channel or status filter, or record a new offline purchase.'}
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-1">
            {(filterChannel !== 'all' || filterStatus !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setFilterChannel('all')
                  setFilterStatus('all')
                }}
                className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] text-xs font-bold text-[#0F1F1D]"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={() => setOfflineModalOpen(true)}
              className="min-h-[44px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-[#E6C975]" />
              <span>Record offline sale</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((order) => {
            const meta = STATUS_LABELS[order.status]
            const isOffline = order.channel === 'offline'
            const waPhone = whatsappDigits(order.customerPhone) ?? ''
            const zoneOrSource = order.offlineSource || order.deliveryZone
            // Units this order is holding off the shelf right now (what a cancel could put back).
            const heldUnits = isStockDeducted(order)
              ? Array.from(stockHeldByOrder(order.items).values()).reduce((n, h) => n + h.quantity, 0)
              : 0
            const totalIssues =
              order.status === 'pending_verification' ? auditOrderTotals(order, products, deliveryZones) : []

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-[#E2DACA] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F4EFE6] pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base text-[#0B3D3A] tracking-wide">
                        {order.orderCode}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${meta.badge}`}>
                        {meta.label}
                      </span>
                      {isOffline && (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#F4EFE6] text-[#0B3D3A] border border-[#E2DACA]">
                          Offline{order.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[order.paymentMethod]}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-[#0F1F1D] mt-1">
                      {order.customerName}
                      {order.customerPhone && (
                        <>
                          {' '}
                          · <span className="font-normal text-[#3F4F4C]">{formatPhone(order.customerPhone)}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-[#3F4F4C]">
                      {zoneOrSource}
                      {order.address ? ` · ${order.address}` : ''}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xl font-serif-display font-bold text-[#0F1F1D] tabular-nums block">
                      {formatNaira(order.total)}
                    </span>
                    <span className="text-xs text-[#3F4F4C]">
                      {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <TotalsWarning issues={totalIssues} />

                {/* Ordered Items */}
                <ul className="text-xs text-[#0F1F1D] space-y-1 bg-[#FAF8F4] p-3 rounded-xl border border-[#E2DACA]">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span>
                        <strong>{item.quantity}x</strong> {item.name}
                        {item.variantLabel && <span className="text-[#3F4F4C]"> · {item.variantLabel}</span>}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatNaira(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                  {order.deliveryFee > 0 && (
                    <li className="flex justify-between text-[#3F4F4C] pt-1 border-t border-[#E2DACA]/60">
                      <span>Delivery fee</span>
                      <span className="font-semibold tabular-nums">
                        {formatNaira(order.deliveryFee)}
                      </span>
                    </li>
                  )}
                  {order.notes && (
                    <li className="pt-1.5 mt-1.5 border-t border-[#E2DACA] text-[#3F4F4C]">
                      <strong>Note:</strong> {order.notes}
                    </li>
                  )}
                </ul>

                <OrderActions
                  order={order}
                  busy={updatingId === order.id}
                  anyBusy={Boolean(updatingId)}
                  waPhone={waPhone}
                  noteDraft={noteDrafts[order.id] ?? order.dispatchNote ?? ''}
                  onNoteChange={(value) => setNoteDrafts((d) => ({ ...d, [order.id]: value }))}
                  onStatusChange={(next) => handleStatusChange(order, next)}
                  onOpenReceipt={() => setReceiptModalOrder(order)}
                  onOpenDocument={() => setDocOrder(order)}
                  onRequestCancel={() => {
                    // Default: put stock back, except after delivery (the bag is with the customer).
                    setRestockOnCancel(order.status !== 'delivered')
                    setConfirmCancelId(order.id)
                  }}
                />

                {confirmCancelId === order.id && (
                  <div
                    role="alertdialog"
                    aria-labelledby={`cancel-title-${order.id}`}
                    aria-describedby={`cancel-desc-${order.id}`}
                    className="p-3.5 rounded-xl bg-red-50 border border-red-200 space-y-3"
                    onKeyDown={(e) => {
                      if (e.key === 'Escape' && updatingId !== order.id) setConfirmCancelId(null)
                    }}
                  >
                    <div className="text-sm text-[#7A1B14] space-y-0.5">
                      <p id={`cancel-title-${order.id}`} className="font-bold">
                        Cancel {order.orderCode}?
                      </p>
                      <p id={`cancel-desc-${order.id}`}>
                        The customer will see &quot;Order cancelled&quot; on the tracking page.
                        {heldUnits === 0 &&
                          (order.status === 'pending_verification'
                            ? ' No stock was taken for this order, so there is nothing to put back.'
                            : ' This order isn’t holding any stock.')}
                      </p>
                    </div>

                    {heldUnits > 0 && (
                      <label className="flex items-start gap-2.5 min-h-[44px] p-2.5 -mx-1 rounded-lg bg-white/70 border border-red-100 cursor-pointer text-sm text-[#0F1F1D]">
                        <input
                          type="checkbox"
                          checked={restockOnCancel}
                          onChange={(e) => setRestockOnCancel(e.target.checked)}
                          className="mt-0.5 w-4 h-4 accent-[#0B3D3A] shrink-0"
                        />
                        <span>
                          <strong className="block">
                            Put {heldUnits} {heldUnits === 1 ? 'item' : 'items'} back in stock
                          </strong>
                          <span className="text-xs text-[#3F4F4C]">
                            {order.status === 'delivered'
                              ? 'Only tick this if the customer has returned the bag to you.'
                              : 'Untick if the bag is damaged or no longer available to sell.'}
                          </span>
                        </span>
                      </label>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold text-[#0F1F1D] hover:bg-[#F4EFE6]"
                      >
                        Keep order
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={async () => {
                          const restock = heldUnits > 0 && restockOnCancel
                          if (await handleStatusChange(order, 'cancelled', { restock })) setConfirmCancelId(null)
                        }}
                        className="min-h-[44px] px-4 rounded-xl bg-[#B42318] hover:bg-[#912018] text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-60"
                      >
                        {updatingId === order.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        <span>Yes, cancel order</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Receipt Inspection Modal */}
      {receiptModalOrder && (
        <div
          className="fixed inset-0 z-50 bg-[#04201F]/75 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-modal-title"
          onClick={() => !updatingId && setReceiptModalOrder(null)}
        >
          <div
            ref={receiptRef}
            className="bg-white rounded-2xl border border-[#E2DACA] max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id="receipt-modal-title" className="font-serif-display text-lg font-bold">
                  Transfer receipt: {receiptModalOrder.orderCode}
                </h3>
                <p className="text-xs text-[#3F4F4C]">
                  Expected amount: <strong>{formatNaira(receiptModalOrder.total)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceiptModalOrder(null)}
                aria-label="Close receipt preview"
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#FAF8F4] rounded-2xl border border-[#E2DACA] p-2 max-h-[60vh] overflow-auto flex items-center justify-center">
              {isPdfReceipt(receiptModalOrder.receiptUrl) ? (
                <PdfReceipt url={receiptModalOrder.receiptUrl} orderCode={receiptModalOrder.orderCode} />
              ) : (
                <img
                  src={receiptModalOrder.receiptUrl}
                  alt={`Payment receipt for ${receiptModalOrder.orderCode}`}
                  className="max-w-full rounded-xl"
                />
              )}
            </div>

            {receiptModalOrder.status === 'pending_verification' && (
              <TotalsWarning issues={auditOrderTotals(receiptModalOrder, products, deliveryZones)} />
            )}

            {receiptModalOrder.status === 'pending_verification' && (
              <button
                type="button"
                disabled={updatingId === receiptModalOrder.id}
                onClick={async () => {
                  if (await handleStatusChange(receiptModalOrder, 'payment_confirmed')) {
                    setReceiptModalOrder(null)
                  }
                }}
                className="w-full min-h-[44px] rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {updatingId === receiptModalOrder.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[#E6C975]" />
                )}
                <span>
                  {updatingId === receiptModalOrder.id ? 'Confirming payment...' : 'Confirm payment & deduct stock'}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
      {docOrder && (
        <OrderDocumentDialog
          order={docOrder}
          settings={settings}
          onClose={() => setDocOrder(null)}
          onNotify={(message) => showToast(message)}
        />
      )}
      <OfflineSaleModal
        open={offlineModalOpen}
        products={products}
        onClose={() => setOfflineModalOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  )
}
