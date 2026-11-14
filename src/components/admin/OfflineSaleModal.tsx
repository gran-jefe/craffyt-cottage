'use client'

import React, { useEffect, useState } from 'react'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import {
  ReceiptFileError,
  checkReceiptFile,
  createOfflineOrder,
  uploadMediaFile,
} from '@/lib/storeService'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import type { OrderItem, OrderStatus, PaymentMethod, Product } from '@/types/store'

interface Props {
  open: boolean
  products: Product[]
  onClose: () => void
  onSaved: () => Promise<void>
}

interface LineItemDraft {
  key: string
  productId: string
  customName: string
  quantity: string
  unitPrice: string
}

const OFFLINE_SOURCES = [
  'In person / Walk-in',
  'WhatsApp / DM',
  'Pop-up / Market',
  'Phone / Referral',
  'Other',
]

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'pos', label: 'POS / Card' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
]

type OfflineOrderStatus = Extract<
  OrderStatus,
  'delivered' | 'payment_confirmed' | 'processing' | 'dispatched'
>

const OFFLINE_STATUSES: { value: OfflineOrderStatus; label: string }[] = [
  { value: 'delivered', label: 'Delivered (Completed)' },
  { value: 'payment_confirmed', label: 'Payment confirmed (awaiting pickup or dispatch)' },
  { value: 'processing', label: 'Processing / Packaging' },
  { value: 'dispatched', label: 'Dispatched' },
]

function todayDateInput(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function createInitialLine(products: Product[]): LineItemDraft {
  const first = products[0]
  return {
    key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    productId: first ? first.id : 'custom',
    customName: '',
    quantity: '1',
    unitPrice: first ? String(first.price) : '',
  }
}

export function OfflineSaleModal({ open, products, onClose, onSaved }: Props) {
  const { showToast } = useCart()
  const [lines, setLines] = useState<LineItemDraft[]>([])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [offlineSource, setOfflineSource] = useState(OFFLINE_SOURCES[0])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [status, setStatus] = useState<OfflineOrderStatus>('delivered')
  const [saleDate, setSaleDate] = useState(todayDateInput())
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [deductStock, setDeductStock] = useState(true)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLines([createInitialLine(products)])
    setCustomerName('')
    setCustomerPhone('')
    setOfflineSource(OFFLINE_SOURCES[0])
    setPaymentMethod('cash')
    setStatus('delivered')
    setSaleDate(todayDateInput())
    setDeliveryFee('0')
    setAddress('')
    setNotes('')
    setDeductStock(true)
    setReceiptUrl('')
    setError('')
  }, [open, products])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, saving, onClose])

  const panelRef = useDialogFocus<HTMLDivElement>(open)

  if (!open) return null

  function updateLine(key: string, patch: Partial<LineItemDraft>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }

  function handleProductChange(key: string, nextProductId: string) {
    const matched = products.find((p) => p.id === nextProductId)
    updateLine(key, {
      productId: nextProductId,
      unitPrice: matched ? String(matched.price) : '',
      customName: nextProductId === 'custom' ? '' : '',
    })
  }

  function addLine() {
    setLines((prev) => [...prev, createInitialLine(products)])
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const problem = checkReceiptFile(file)
    if (problem) {
      setError(problem)
      return
    }
    setUploadingReceipt(true)
    setError('')
    try {
      const url = await uploadMediaFile(file, 'receipts')
      setReceiptUrl(url)
      showToast('Receipt slip attached.')
    } catch (err) {
      setError(
        err instanceof ReceiptFileError
          ? err.message
          : 'Could not upload the receipt slip. Check your connection and try again.'
      )
    } finally {
      setUploadingReceipt(false)
    }
  }

  const parsedItems: { valid: boolean; item?: OrderItem; product?: Product }[] = lines.map((line) => {
    const qty = Number(line.quantity)
    const price = Number(line.unitPrice)
    const matched = products.find((p) => p.id === line.productId)
    const name = line.productId === 'custom' ? line.customName.trim() : matched?.name || ''
    const valid =
      Boolean(name) &&
      Number.isInteger(qty) &&
      qty >= 1 &&
      Number.isFinite(price) &&
      price > 0
    return {
      valid,
      product: matched,
      item: valid
        ? {
            productId: line.productId === 'custom' ? 'custom' : line.productId,
            name,
            price,
            quantity: qty,
          }
        : undefined,
    }
  })

  const subtotal = parsedItems.reduce(
    (sum, entry) => sum + (entry.item ? entry.item.price * entry.item.quantity : 0),
    0
  )
  const numericFee = Math.max(0, Number(deliveryFee) || 0)
  const total = subtotal + numericFee

  const hasCatalogItems = lines.some((l) => l.productId !== 'custom')
  const stockExceedsWarning =
    deductStock &&
    parsedItems.some((entry) => entry.product && entry.item && entry.item.quantity > entry.product.stock)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (parsedItems.some((entry) => !entry.valid || !entry.item)) {
      setError('Each item needs a product name, a whole quantity of at least 1, and a valid unit price.')
      return
    }

    const items = parsedItems.map((entry) => entry.item!)
    if (subtotal <= 0) {
      setError('Order subtotal must be greater than ₦0.')
      return
    }

    const today = todayDateInput()
    const soldAt = saleDate && saleDate !== today ? `${saleDate}T12:00:00.000Z` : undefined

    setSaving(true)
    try {
      const created = await createOfflineOrder({
        customerName: customerName.trim() || 'Walk-in Customer',
        customerPhone: customerPhone.trim(),
        offlineSource,
        deliveryZone: offlineSource,
        deliveryFee: numericFee,
        address: address.trim(),
        notes: notes.trim(),
        items,
        subtotal,
        total,
        paymentMethod,
        status,
        receiptUrl: receiptUrl.trim(),
        deductStock: hasCatalogItems && deductStock,
        soldAt,
      })
      await onSaved()
      onClose()
      showToast(
        `Offline record ${created.orderCode} saved${
          hasCatalogItems && deductStock ? ' and stock updated' : ''
        }!`
      )
    } catch {
      setError('Could not save offline record. Verify your admin permissions and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111B07]/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="offline-sale-modal-title"
      onClick={() => !saving && onClose()}
    >
      <div
        ref={panelRef}
        className="bg-white rounded-2xl border border-[#E2DACA] max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E2DACA] pb-3">
          <div>
            <h3 id="offline-sale-modal-title" className="font-serif-display text-xl font-bold text-[#17210E]">
              Record an offline sale
            </h3>
            <p className="text-xs text-[#4A5240]">
              Log an in-person, pop-up market, or DM purchase and optionally deduct inventory.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close offline purchase dialog"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#263E0F] outline-none"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Items Purchased */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#355416]">
                Products bought *
              </span>
              <button
                type="button"
                onClick={addLine}
                className="min-h-[44px] px-3 rounded-lg border border-[#263E0F]/40 text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add item</span>
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => (
                <div
                  key={line.key}
                  className="bg-[#FAF8F4] border border-[#E2DACA] rounded-2xl p-3 space-y-2.5"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end">
                    <div className="sm:col-span-6">
                      <label htmlFor={`offline-prod-${line.key}`} className="block text-xs font-bold mb-1">
                        Product {lines.length > 1 ? `#${index + 1}` : ''}
                      </label>
                      <select
                        id={`offline-prod-${line.key}`}
                        value={line.productId}
                        onChange={(e) => handleProductChange(line.key, e.target.value)}
                        className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-xs font-semibold"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.stock} in stock · {formatNaira(p.price)})
                          </option>
                        ))}
                        <option value="custom">Custom or unlisted item</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor={`offline-qty-${line.key}`} className="block text-xs font-bold mb-1">
                        Qty
                      </label>
                      <input
                        id={`offline-qty-${line.key}`}
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-3">
                      <label htmlFor={`offline-price-${line.key}`} className="block text-xs font-bold mb-1">
                        Unit price (₦)
                      </label>
                      <input
                        id={`offline-price-${line.key}`}
                        type="number"
                        min="1"
                        value={line.unitPrice}
                        onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })}
                        placeholder="45000"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-xs font-bold tabular-nums"
                      />
                    </div>

                    <div className="sm:col-span-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => removeLine(line.key)}
                        disabled={lines.length === 1}
                        aria-label="Remove line item"
                        className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] bg-white hover:bg-red-50 text-[#B42318] disabled:opacity-30 flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {line.productId === 'custom' && (
                    <div>
                      <label htmlFor={`offline-custom-${line.key}`} className="block text-xs font-bold mb-1">
                        Custom item name *
                      </label>
                      <input
                        id={`offline-custom-${line.key}`}
                        type="text"
                        value={line.customName}
                        onChange={(e) => updateLine(line.key, { customName: e.target.value })}
                        placeholder="e.g. Custom Beaded Clutch (Emerald)"
                        className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {hasCatalogItems && (
              <div className="space-y-1">
                <label className="flex items-center gap-2.5 text-xs font-semibold text-[#17210E] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={deductStock}
                    onChange={(e) => setDeductStock(e.target.checked)}
                    className="w-4 h-4 accent-[#263E0F]"
                  />
                  <span>Deduct sold quantities from inventory stock</span>
                </label>
                {stockExceedsWarning && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Note: Quantity exceeds current stock on at least one product. Stock will be set to 0 rather than negative.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Buyer & Channel Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="offline-customer-name" className="block text-xs font-bold mb-1">
                Buyer name
              </label>
              <input
                id="offline-customer-name"
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Walk-in Customer"
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
              />
            </div>

            <div>
              <label htmlFor="offline-customer-phone" className="block text-xs font-bold mb-1">
                Phone / WhatsApp (Optional)
              </label>
              <input
                id="offline-customer-phone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="e.g. 0803 123 4567"
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
              />
            </div>

            <div>
              <label htmlFor="offline-source" className="block text-xs font-bold mb-1">
                Purchase channel
              </label>
              <select
                id="offline-source"
                value={offlineSource}
                onChange={(e) => setOfflineSource(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm font-medium"
              >
                {OFFLINE_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="offline-payment" className="block text-xs font-bold mb-1">
                Payment method
              </label>
              <select
                id="offline-payment"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm font-medium"
              >
                {PAYMENT_METHODS.map((pm) => (
                  <option key={pm.value} value={pm.value}>
                    {pm.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="offline-status" className="block text-xs font-bold mb-1">
                Fulfilment status
              </label>
              <select
                id="offline-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as OfflineOrderStatus)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm font-medium"
              >
                {OFFLINE_STATUSES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="offline-date" className="block text-xs font-bold mb-1">
                Sale date
              </label>
              <input
                id="offline-date"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
              />
            </div>

            <div>
              <label htmlFor="offline-delivery-fee" className="block text-xs font-bold mb-1">
                Delivery fee (₦)
              </label>
              <input
                id="offline-delivery-fee"
                type="number"
                min="0"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm tabular-nums"
              />
            </div>

            <div>
              <label htmlFor="offline-address" className="block text-xs font-bold mb-1">
                Pickup / Delivery Note (Optional)
              </label>
              <input
                id="offline-address"
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. Picked up on UI campus"
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
            <div>
              <label htmlFor="offline-notes" className="block text-xs font-bold mb-1">
                Notes (Optional)
              </label>
              <input
                id="offline-notes"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Discount applied, colour preference, etc."
                className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
              />
            </div>

            <div>
              <span className="block text-xs font-bold mb-1">Receipt or POS slip (optional)</span>
              <label
                htmlFor="offline-receipt-upload"
                className="min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] hover:border-[#263E0F] text-xs font-semibold text-[#17210E] flex items-center gap-2 cursor-pointer"
              >
                {uploadingReceipt ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#263E0F]" />
                ) : (
                  <Upload className="w-4 h-4 text-[#263E0F]" />
                )}
                <span className="truncate">
                  {uploadingReceipt
                    ? 'Uploading slip...'
                    : receiptUrl
                    ? 'Receipt attached (click to replace)'
                    : 'Attach POS slip or transfer receipt'}
                </span>
                <input
                  id="offline-receipt-upload"
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleReceiptUpload}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {/* Totals Summary */}
          <div className="bg-[#FAF8F4] border border-[#E2DACA] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-[#4A5240] space-x-3">
              <span>
                Items subtotal: <strong className="text-[#17210E] tabular-nums">{formatNaira(subtotal)}</strong>
              </span>
              {numericFee > 0 && (
                <span>
                  Delivery: <strong className="text-[#17210E] tabular-nums">{formatNaira(numericFee)}</strong>
                </span>
              )}
            </div>
            <div className="text-right">
              <span className="text-xs text-[#4A5240] block">Total recorded sale</span>
              <strong className="font-serif-display text-xl font-bold text-[#263E0F] tabular-nums">
                {formatNaira(total)}
              </strong>
            </div>
          </div>

          {error && (
            <p role="alert" className="text-xs text-[#B42318] bg-red-50 border border-red-200 p-3 rounded-xl">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] text-xs font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || uploadingReceipt}
              className="min-h-[44px] px-6 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{saving ? 'Saving...' : 'Save offline sale'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
