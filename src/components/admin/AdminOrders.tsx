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
} from 'lucide-react'
import { updateOrderStatus } from '@/lib/storeService'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import { OfflineSaleModal } from '@/components/admin/OfflineSaleModal'
import { useDialogFocus } from '@/lib/useDialogFocus'
import type { Order, OrderChannel, OrderStatus, PaymentMethod, Product } from '@/types/store'

interface Props {
  orders: Order[]
  products: Product[]
  onRefresh: () => Promise<void>
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  pos: 'POS / Card',
  bank_transfer: 'Bank transfer',
  other: 'Other',
}

const STATUS_LABELS: Record<OrderStatus, { label: string; badge: string }> = {
  pending_verification: { label: 'Pending verification', badge: 'bg-amber-100 text-amber-900' },
  payment_confirmed: { label: 'Payment confirmed', badge: 'bg-[#EAF2DE] text-[#263E0F]' },
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
 * Order totals are sent by the customer's browser, and Firestore rules can't sum a list,
 * so re-check the arithmetic here and compare line prices with today's catalogue.
 * Returns plain-language problems for the admin to resolve before confirming payment.
 */
function auditOrderTotals(order: Order, products: Product[]): string[] {
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
  const live = new Map(products.map((p) => [p.id, p]))
  for (const item of order.items) {
    const p = live.get(item.productId)
    if (p && item.price < p.price) {
      issues.push(`${item.name} was ordered at ${formatNaira(item.price)}; it is listed at ${formatNaira(p.price)} today.`)
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

export function AdminOrders({ orders, products, onRefresh }: Props) {
  const { showToast } = useCart()
  const [filterChannel, setFilterChannel] = useState<'all' | OrderChannel>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | OrderStatus>('all')
  const [offlineModalOpen, setOfflineModalOpen] = useState(false)
  const [receiptModalOrder, setReceiptModalOrder] = useState<Order | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
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

  async function handleStatusChange(order: Order, nextStatus: OrderStatus): Promise<boolean> {
    if (updatingId) return false
    setUpdatingId(order.id)
    try {
      const note = noteDrafts[order.id] ?? order.dispatchNote ?? ''
      await updateOrderStatus(order, nextStatus, note)
      await onRefresh()
      showToast(
        nextStatus === 'payment_confirmed'
          ? `Payment verified for ${order.orderCode} and inventory stock updated!`
          : `Order ${order.orderCode} updated to ${STATUS_LABELS[nextStatus].label}.`
      )
      return true
    } catch {
      showToast(`Could not update ${order.orderCode}. Check your connection and try again.`, 'error')
      return false
    } finally {
      setUpdatingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-2xl font-bold text-[#17210E]">
            Orders &amp; Offline Sales
          </h2>
          <p className="text-xs text-[#4A5240]">
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
            className="min-h-[44px] px-4 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#E6C975]" />
            <span>Record offline sale</span>
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-3">
          <Receipt className="w-8 h-8 text-[#4A5240] mx-auto opacity-60" />
          <p className="font-serif-display text-lg font-bold text-[#17210E]">
            {orders.length === 0 ? 'No orders or offline sales yet' : 'No orders match this filter'}
          </p>
          <p className="text-sm text-[#4A5240]">
            {orders.length === 0
              ? 'Customer checkout orders will appear here, or you can log an offline studio/DM purchase.'
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
                className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] text-xs font-bold text-[#17210E]"
              >
                Reset filters
              </button>
            )}
            <button
              type="button"
              onClick={() => setOfflineModalOpen(true)}
              className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold inline-flex items-center gap-1.5"
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
            const phoneDigits = order.customerPhone.replace(/\D/g, '')
            const waPhone = phoneDigits.startsWith('0')
              ? `234${phoneDigits.slice(1)}`
              : phoneDigits
            const zoneOrSource = order.offlineSource || order.deliveryZone
            const totalIssues = order.status === 'pending_verification' ? auditOrderTotals(order, products) : []

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-[#E2DACA] p-5 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#F4EFE6] pb-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-extrabold text-base text-[#263E0F] tracking-wide">
                        {order.orderCode}
                      </span>
                      <span className={`text-xs font-bold px-2.5 py-0.5 rounded-md ${meta.badge}`}>
                        {meta.label}
                      </span>
                      {isOffline && (
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-md bg-[#F4EFE6] text-[#263E0F] border border-[#E2DACA]">
                          Offline{order.paymentMethod ? ` · ${PAYMENT_METHOD_LABELS[order.paymentMethod]}` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-[#17210E] mt-1">
                      {order.customerName}
                      {order.customerPhone && (
                        <>
                          {' '}
                          · <span className="font-normal text-[#4A5240]">{order.customerPhone}</span>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-[#4A5240]">
                      {zoneOrSource}
                      {order.address ? ` · ${order.address}` : ''}
                    </p>
                  </div>

                  <div className="text-left sm:text-right">
                    <span className="text-xl font-serif-display font-bold text-[#17210E] tabular-nums block">
                      {formatNaira(order.total)}
                    </span>
                    <span className="text-xs text-[#4A5240]">
                      {new Date(order.createdAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <TotalsWarning issues={totalIssues} />

                {/* Ordered Items */}
                <ul className="text-xs text-[#17210E] space-y-1 bg-[#FAF8F4] p-3 rounded-xl border border-[#E2DACA]">
                  {order.items.map((item, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span>
                        <strong>{item.quantity}x</strong> {item.name}
                      </span>
                      <span className="font-semibold tabular-nums">
                        {formatNaira(item.price * item.quantity)}
                      </span>
                    </li>
                  ))}
                  {order.deliveryFee > 0 && (
                    <li className="flex justify-between text-[#4A5240] pt-1 border-t border-[#E2DACA]/60">
                      <span>Delivery fee</span>
                      <span className="font-semibold tabular-nums">
                        {formatNaira(order.deliveryFee)}
                      </span>
                    </li>
                  )}
                  {order.notes && (
                    <li className="pt-1.5 mt-1.5 border-t border-[#E2DACA] text-[#4A5240]">
                      <strong>Note:</strong> {order.notes}
                    </li>
                  )}
                </ul>

                {/* Actions Row */}
                <div className="flex flex-wrap items-center gap-2.5">
                  {order.receiptUrl && (
                    <button
                      type="button"
                      onClick={() => setReceiptModalOrder(order)}
                      className="min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] hover:border-[#263E0F] text-xs font-bold text-[#17210E] flex items-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect receipt</span>
                    </button>
                  )}

                  {order.status === 'pending_verification' && (
                    <button
                      type="button"
                      disabled={updatingId === order.id}
                      onClick={() => handleStatusChange(order, 'payment_confirmed')}
                      className="min-h-[44px] px-4 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      {updatingId === order.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#E6C975]" />
                      )}
                      <span>Verify payment</span>
                    </button>
                  )}

                  <select
                    aria-label={`Change status for ${order.orderCode}`}
                    disabled={updatingId === order.id}
                    value={order.status}
                    onChange={(e) => {
                      const next = e.target.value as OrderStatus
                      if (next === 'cancelled') {
                        setConfirmCancelId(order.id)
                        return
                      }
                      handleStatusChange(order, next)
                    }}
                    className="min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-xs font-semibold"
                  >
                    {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABELS[st].label}
                      </option>
                    ))}
                  </select>

                  <input
                    type="text"
                    value={noteDrafts[order.id] ?? order.dispatchNote ?? ''}
                    onChange={(e) =>
                      setNoteDrafts((d) => ({ ...d, [order.id]: e.target.value }))
                    }
                    aria-label={`Dispatch or rider note for ${order.orderCode}`}
                    placeholder="Dispatch / rider note..."
                    className="flex-1 min-w-[180px] min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-xs"
                  />

                  <button
                    type="button"
                    disabled={updatingId === order.id}
                    onClick={() => handleStatusChange(order, order.status)}
                    className="min-h-[44px] px-3 rounded-xl border border-[#E2DACA] hover:bg-[#F4EFE6] text-xs font-bold"
                  >
                    Save note
                  </button>

                  {waPhone && (
                    <a
                      href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                        `Hello ${order.customerName}, thank you for your Crafty Cottage order (${order.orderCode}).`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3 rounded-xl border border-[#263E0F]/40 text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold flex items-center gap-1"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </a>
                  )}
                </div>

                {confirmCancelId === order.id && (
                  <div
                    role="alertdialog"
                    aria-labelledby={`cancel-title-${order.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-red-50 border border-red-200"
                  >
                    <p id={`cancel-title-${order.id}`} className="text-sm text-[#7A1B14]">
                      <strong>Cancel {order.orderCode}?</strong> The customer will see
                      &quot;Order cancelled&quot; on the tracking page. Stock is not returned automatically.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCancelId(null)}
                        className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold text-[#17210E] hover:bg-[#F4EFE6]"
                      >
                        Keep order
                      </button>
                      <button
                        type="button"
                        disabled={updatingId === order.id}
                        onClick={async () => {
                          if (await handleStatusChange(order, 'cancelled')) setConfirmCancelId(null)
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
          className="fixed inset-0 z-50 bg-[#111B07]/75 backdrop-blur-xs flex items-center justify-center p-4"
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
                <p className="text-xs text-[#4A5240]">
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
                <a
                  href={receiptModalOrder.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="py-10 text-sm font-bold text-[#263E0F] underline"
                >
                  Open PDF receipt in a new tab
                </a>
              ) : (
                <img
                  src={receiptModalOrder.receiptUrl}
                  alt={`Payment receipt for ${receiptModalOrder.orderCode}`}
                  className="max-w-full rounded-xl"
                />
              )}
            </div>

            {receiptModalOrder.status === 'pending_verification' && (
              <TotalsWarning issues={auditOrderTotals(receiptModalOrder, products)} />
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
                className="w-full min-h-[44px] rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
      <OfflineSaleModal
        open={offlineModalOpen}
        products={products}
        onClose={() => setOfflineModalOpen(false)}
        onSaved={onRefresh}
      />
    </div>
  )
}
