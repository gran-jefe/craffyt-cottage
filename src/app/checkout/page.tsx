'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  CheckCircle2,
  Copy,
  Check,
  Upload,
  Landmark,
  ShieldCheck,
  Loader2,
  ShoppingBag,
  FileText,
  MessageCircle,
  X,
} from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { cartLineKey, useCart } from '@/context/CartContext'
import { DEFAULT_STORE_SETTINGS, formatNaira, hasPaymentDetails } from '@/lib/defaults'
import {
  RECEIPT_PDF_MAX_BYTES,
  ReceiptFileError,
  checkReceiptFile,
  createOrder,
  fetchProducts,
  fetchStoreSettings,
  formatFileSize,
  uploadMediaFile,
} from '@/lib/storeService'
import type { DeliveryZone, Order, StoreSettings } from '@/types/store'
import { DEFAULT_COUNTRY, parsePhoneForCountry } from '@/lib/phone'
import { PhoneField } from '@/components/PhoneField'

export default function CheckoutPage() {
  const { items, subtotal, clearCart, showToast, reconcileWithProducts } = useCart()
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS)
  const [paymentStatus, setPaymentStatus] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
  const [settingsReloadKey, setSettingsReloadKey] = useState(0)

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState(DEFAULT_COUNTRY)
  const [customerEmail, setCustomerEmail] = useState('')
  const [selectedZoneId, setSelectedZoneId] = useState('')
  /** Delivery options exactly as the admin saved them; null until they've loaded. */
  const [savedZones, setSavedZones] = useState<DeliveryZone[] | null>(null)
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')

  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string>('')
  const [copiedAccount, setCopiedAccount] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [completedOrder, setCompletedOrder] = useState<Order | null>(null)
  const [downloadingInvoice, setDownloadingInvoice] = useState(false)

  async function downloadInvoice() {
    if (!completedOrder) return
    setDownloadingInvoice(true)
    try {
      const { buildOrderPdf, docFileName, saveBlob } = await import('@/lib/orderDocument')
      const blob = await buildOrderPdf('invoice', completedOrder, paymentStatus === 'ready' ? settings : null)
      saveBlob(blob, docFileName('invoice', completedOrder))
      showToast('Invoice downloaded')
    } catch {
      showToast('Could not create the invoice. Please try again.', 'error')
    } finally {
      setDownloadingInvoice(false)
    }
  }
  const [cartChanges, setCartChanges] = useState<string[]>([])
  const [reconciledOnLoad, setReconciledOnLoad] = useState(false)

  // Re-price a saved bag (it can be up to 14 days old) once live products are known.
  useEffect(() => {
    if (reconciledOnLoad || items.length === 0) return
    setReconciledOnLoad(true)
    fetchProducts(false)
      .then((live) => {
        const changes = reconcileWithProducts(live)
        if (changes.length) setCartChanges(changes)
      })
      .catch(() => {})
  }, [items.length, reconcileWithProducts, reconciledOnLoad])

  function clearError(field: string) {
    setErrors((prev) => {
      if (!prev[field] && !prev.submit) return prev
      const next = { ...prev }
      delete next[field]
      delete next.submit
      return next
    })
  }

  /** Shared a11y + styling for a validated control. Border #8C8270 is 3.6:1 on linen (WCAG 1.4.11). */
  function fieldA11y(field: string) {
    const hasError = Boolean(errors[field])
    return {
      'aria-invalid': hasError,
      'aria-describedby': hasError ? `${field}-error` : undefined,
      borderClass: hasError ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#8C8270]',
    }
  }

  // Payment details only render from settings the owner actually saved. Until then the
  // customer sees why they can't pay yet, never a placeholder account.
  useEffect(() => {
    let active = true
    setPaymentStatus('loading')
    fetchStoreSettings()
      .then((cfg) => {
        if (!active) return
        if (cfg) {
          setSettings(cfg)
          // Only real fees from the admin: never fall back to built-in zones a customer could pay by mistake.
          const zones = cfg.deliveryZones.filter((z) => z.label.trim())
          setSavedZones(zones)
          setSelectedZoneId((prev) => (zones.some((z) => z.id === prev) ? prev : zones[0]?.id ?? ''))
        } else {
          setSavedZones([])
        }
        setPaymentStatus(hasPaymentDetails(cfg) ? 'ready' : 'unavailable')
      })
      .catch(() => {
        if (active) setPaymentStatus('error')
      })
    return () => {
      active = false
    }
  }, [settingsReloadKey])

  const paymentReady = paymentStatus === 'ready'

  const zones = savedZones ?? []
  const selectedZone = zones.find((z) => z.id === selectedZoneId)
  const deliveryFee = selectedZone ? selectedZone.fee : 0
  const total = subtotal + deliveryFee

  function handleCopyAccount() {
    const done = () => {
      setCopiedAccount(true)
      showToast('Account number copied.')
      setTimeout(() => setCopiedAccount(false), 2500)
    }
    const fail = () =>
      showToast(`Could not copy. The account number is ${settings.accountNumber}.`, 'error')
    if (!navigator.clipboard) return fail()
    navigator.clipboard.writeText(settings.accountNumber).then(done, fail)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so choosing the same file again after an error still fires onChange.
    e.target.value = ''
    if (!file) return
    const problem = checkReceiptFile(file)
    if (problem) {
      setReceiptFile(null)
      setReceiptPreview('')
      setErrors((prev) => ({ ...prev, receipt: problem }))
      return
    }
    setErrors((prev) => {
      const next = { ...prev }
      delete next.receipt
      return next
    })
    setReceiptFile(file)
    if (file.type.startsWith('image/')) {
      setReceiptPreview(URL.createObjectURL(file))
    } else {
      setReceiptPreview('')
    }
  }

  function validateForm(): boolean {
    const next: Record<string, string> = {}
    if (customerName.trim().length < 2) next.customerName = 'Please enter your full name.'
    const phone = parsePhoneForCountry(phoneCountry, customerPhone)
    if (!phone.ok) next.customerPhone = phone.error
    if (!customerEmail.trim()) {
      next.customerEmail = 'Please enter your email address. We send your receipt there.'
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(customerEmail.trim())) {
      next.customerEmail = 'Please enter a valid email address, e.g. amina@example.com.'
    }
    if (!selectedZone) next.deliveryZone = 'Choose where we should deliver.'
    if (address.trim().length < 5)
      next.address = 'Enter your delivery address, or the landmark or pickup point we should use.'
    if (!receiptFile) next.receipt = 'Please upload your bank transfer receipt screenshot or PDF.'

    setErrors(next)
    const order = ['customerName', 'customerPhone', 'customerEmail', 'deliveryZone', 'address', 'receipt']
    const first = order.find((k) => next[k])
    if (first) document.getElementById(first === 'receipt' ? 'receipt-upload' : first)?.focus()
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!paymentReady || !validateForm() || !receiptFile || items.length === 0) return

    setSubmitting(true)

    // Last check before money is committed: never place an order at a price or quantity
    // the studio can no longer honour. If anything moved, stop and show the new total.
    try {
      const changes = reconcileWithProducts(await fetchProducts(false))
      if (changes.length > 0) {
        setCartChanges(changes)
        setErrors({
          submit:
            'Your bag was updated with current prices and stock. Please check the new total, and transfer the difference if it changed, before placing your order.',
        })
        setSubmitting(false)
        return
      }
    } catch {
      // Catalogue unreachable: carry on, createOrder will surface any real connectivity problem.
    }

    try {
      const receiptUrl = await uploadMediaFile(receiptFile, 'receipts')
      const created = await createOrder({
        customerName,
        // Validated in validateForm; stored in one international format for WhatsApp links.
        customerPhone: (() => {
          const phone = parsePhoneForCountry(phoneCountry, customerPhone)
          return phone.ok ? phone.e164 : customerPhone.trim()
        })(),
        customerEmail,
        deliveryZone: selectedZone ? selectedZone.label : '',
        deliveryFee,
        address,
        notes,
        // Optional keys are only written when set: Firestore rejects undefined values.
        items: items.map((i) => ({
          productId: i.productId,
          ...(i.variantId ? { variantId: i.variantId, variantLabel: i.variantLabel || '' } : {}),
          name: i.name,
          price: i.price,
          quantity: i.quantity,
        })),
        subtotal,
        total,
        receiptUrl,
      })
      clearCart()
      setCompletedOrder(created)
      showToast(`Order ${created.orderCode} submitted!`)
    } catch (err) {
      console.error(err)
      if (err instanceof ReceiptFileError) {
        // The file itself is the problem: say so next to the upload, not as a connection error.
        setErrors({ receipt: err.message })
        document.getElementById('receipt-upload')?.focus()
      } else {
        setErrors({
          submit:
            'We could not complete your checkout right now. Please check your connection and try again. Your details are saved on this page.',
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="flex-1 py-10 sm:py-14">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {completedOrder ? (
            <div className="max-w-xl mx-auto bg-white rounded-2xl border border-[#E2DACA] p-7 sm:p-10 text-center space-y-6 shadow-sm">
              <div className="w-16 h-16 rounded-2xl bg-[#E3F0EE] text-[#146C43] mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-widest text-[#12564F]">
                  Order received
                </span>
                <h1 className="font-serif-display text-3xl font-bold text-[#04201F]">
                  Thank you, {completedOrder.customerName}!
                </h1>
                <p className="text-sm text-[#3F4F4C] leading-relaxed">
                  Your order and transfer receipt have been submitted. Crafty Cottage will confirm your payment shortly and begin preparing your piece.
                </p>
              </div>

              <div className="bg-[#FAF8F4] border border-[#E2DACA] rounded-2xl p-5 space-y-2">
                <span className="text-xs font-semibold text-[#3F4F4C] block">
                  Your order reference code
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-wider text-[#0B3D3A] tabular-nums">
                  {completedOrder.orderCode}
                </div>
                <p className="text-xs text-[#3F4F4C]">
                  Total amount: <strong>{formatNaira(completedOrder.total)}</strong> ·{' '}
                  {completedOrder.deliveryZone}
                </p>
                <button
                  type="button"
                  disabled={downloadingInvoice}
                  onClick={downloadInvoice}
                  className="mt-1 min-h-[44px] px-3 rounded-xl text-sm font-bold text-[#0B3D3A] hover:bg-[#E3F0EE] inline-flex items-center gap-2 transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D3A]"
                >
                  {downloadingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  {downloadingInvoice ? 'Preparing invoice…' : 'Download invoice (PDF)'}
                </button>
              </div>
              <p className="text-xs text-[#3F4F4C] leading-relaxed">
                We&apos;ll send your receipt on WhatsApp once your payment is confirmed.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link
                  href={`/track?code=${encodeURIComponent(completedOrder.orderCode)}`}
                  className="flex-1 min-h-[48px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold flex items-center justify-center transition-colors"
                >
                  Track order status
                </Link>
                <a
                  href={`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
                    `Hello Crafty Cottage! I just placed Order ${completedOrder.orderCode} (${formatNaira(completedOrder.total)}) and uploaded my bank transfer receipt on the website.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 min-h-[48px] px-5 rounded-xl border border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#E3F0EE] text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Let us know on WhatsApp</span>
                </a>
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="max-w-lg mx-auto bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-5">
              <div className="w-14 h-14 rounded-2xl bg-[#E3F0EE] text-[#0B3D3A] mx-auto flex items-center justify-center">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h1 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">
                  Your bag is empty
                </h1>
                <p className="text-sm text-[#3F4F4C]">
                  Add a beaded bag from the Prima collection before heading to checkout.
                </p>
              </div>
              <Link
                href="/#shop"
                className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold transition-colors"
              >
                Browse the collection
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="space-y-2">
                <Link
                  href="/#shop"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3F4F4C] hover:text-[#0B3D3A] py-1"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Continue shopping</span>
                </Link>
                <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#04201F]">
                  Checkout and bank transfer
                </h1>
                <p className="text-sm text-[#3F4F4C]">
                  Pay directly into Crafty Cottage&apos;s bank account and upload your transfer receipt to lock in your order.
                </p>
              </div>

              {cartChanges.length > 0 && (
                <div
                  role="status"
                  className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-950 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-bold">Your bag was updated with current prices and stock</p>
                    <button
                      type="button"
                      onClick={() => setCartChanges([])}
                      aria-label="Dismiss bag update notice"
                      className="min-w-[44px] min-h-[44px] -m-2.5 rounded-lg flex items-center justify-center hover:bg-amber-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <ul className="list-disc pl-5 space-y-0.5">
                    {cartChanges.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p>
                    New total: <strong className="tabular-nums">{formatNaira(total)}</strong>
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" noValidate>
                <div className="lg:col-span-7 space-y-6">
                  <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
                    <h2 className="font-serif-display text-xl font-bold text-[#0F1F1D]">
                      1. Delivery details
                    </h2>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="customerName" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                          Full name *
                        </label>
                        <input
                          id="customerName"
                        autoComplete="name"
                          type="text"
                          value={customerName}
                          onChange={(e) => {
                          setCustomerName(e.target.value)
                          clearError('customerName')
                        }}
                        aria-invalid={fieldA11y('customerName')['aria-invalid']}
                        aria-describedby={fieldA11y('customerName')['aria-describedby']}
                          placeholder="e.g. Amina Yusuf"
                          className={`w-full min-h-[44px] px-3.5 rounded-xl border ${fieldA11y('customerName').borderClass} bg-[#FAF8F4] text-sm`}
                        />
                        {errors.customerName && (
                        <p id="customerName-error" className="text-xs text-[#B42318] mt-1">{errors.customerName}</p>
                        )}
                      </div>

                      <div>
                        <PhoneField
                          id="customerPhone"
                          label="Phone or WhatsApp number *"
                          country={phoneCountry}
                          value={customerPhone}
                          onCountryChange={(iso) => {
                            setPhoneCountry(iso)
                            clearError('customerPhone')
                          }}
                          onChange={(v) => {
                            setCustomerPhone(v)
                            clearError('customerPhone')
                          }}
                          error={errors.customerPhone}
                          hint="We'll message you here about payment and delivery."
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="customerEmail" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                        Email address *
                      </label>
                      <input
                        id="customerEmail"
                        autoComplete="email"
                        autoCapitalize="none"
                        autoCorrect="off"
                        type="email"
                        required
                        aria-required="true"
                        value={customerEmail}
                        onChange={(e) => {
                          setCustomerEmail(e.target.value)
                          clearError('customerEmail')
                        }}
                        aria-invalid={fieldA11y('customerEmail')['aria-invalid']}
                        aria-describedby={fieldA11y('customerEmail')['aria-describedby']}
                        placeholder="amina@example.com"
                        className={`w-full min-h-[44px] px-3.5 rounded-xl border ${fieldA11y('customerEmail').borderClass} bg-[#FAF8F4] text-sm`}
                      />
                      {errors.customerEmail && (
                        <p id="customerEmail-error" className="text-xs text-[#B42318] mt-1">{errors.customerEmail}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="deliveryZone" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                        Delivery location *
                      </label>
                      {savedZones === null ? (
                        <div
                          role="status"
                          className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#E2DACA] bg-[#F4EFE6] text-sm text-[#3F4F4C] flex items-center gap-2"
                        >
                          {paymentStatus !== 'error' && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                          {paymentStatus === 'error'
                            ? 'Couldn’t load delivery options. Use “Try again” below.'
                            : 'Loading delivery options…'}
                        </div>
                      ) : zones.length === 0 ? (
                        <p className="w-full p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-sm text-amber-950">
                          Delivery options haven&apos;t been set up yet. Message us on WhatsApp to arrange delivery.
                        </p>
                      ) : (
                        <select
                          id="deliveryZone"
                          value={selectedZoneId}
                          onChange={(e) => {
                            setSelectedZoneId(e.target.value)
                            clearError('deliveryZone')
                          }}
                          aria-invalid={fieldA11y('deliveryZone')['aria-invalid']}
                          aria-describedby={fieldA11y('deliveryZone')['aria-describedby']}
                          className={`w-full min-h-[44px] px-3.5 rounded-xl border ${fieldA11y('deliveryZone').borderClass} bg-[#FAF8F4] text-sm font-medium`}
                        >
                          {zones.map((zone) => (
                            <option key={zone.id} value={zone.id}>
                              {zone.label} ({zone.fee === 0 ? 'Free' : formatNaira(zone.fee)}){zone.eta ? ` · ${zone.eta}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      {errors.deliveryZone && (
                        <p id="deliveryZone-error" className="text-xs text-[#B42318] mt-1">{errors.deliveryZone}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="address" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                        Delivery address, hostel or landmark *
                      </label>
                      <textarea
                        id="address"
                        autoComplete="street-address"
                        rows={2}
                        value={address}
                        onChange={(e) => {
                          setAddress(e.target.value)
                          clearError('address')
                        }}
                        aria-invalid={fieldA11y('address')['aria-invalid']}
                        aria-describedby={fieldA11y('address')['aria-describedby']}
                        placeholder="e.g. 14 Admiralty Way, Lekki Phase 1, Lagos"
                        className={`w-full p-3.5 rounded-xl border ${fieldA11y('address').borderClass} bg-[#FAF8F4] text-sm`}
                      />
                      {errors.address && (
                        <p id="address-error" className="text-xs text-[#B42318] mt-1">{errors.address}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="notes" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                        Delivery instructions <span className="font-normal text-[#3F4F4C]">(optional)</span>
                      </label>
                      <input
                        id="notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="e.g. Call me before dispatch rider leaves"
                        className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#8C8270] bg-[#FAF8F4] text-sm"
                      />
                    </div>
                  </section>

                  <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-serif-display text-xl font-bold text-[#0F1F1D]">
                          2. Direct bank transfer
                        </h2>
                        <p className="text-xs text-[#3F4F4C] mt-0.5">
                          {paymentReady ? (
                            <>Transfer <strong>{formatNaira(total)}</strong> to the account below, then upload your receipt.</>
                          ) : (
                            <>Your total is <strong>{formatNaira(total)}</strong>. Bank details appear here once confirmed.</>
                          )}
                        </p>
                      </div>
                      <Landmark className="w-6 h-6 text-[#0B3D3A] shrink-0" />
                    </div>

                    {paymentStatus === 'loading' && (
                      <div
                        role="status"
                        aria-label="Loading bank details"
                        className="bg-[#062E2C] rounded-2xl p-5 space-y-3 animate-pulse"
                      >
                        <div className="h-4 w-1/3 rounded-md bg-[#1F5550]" />
                        <div className="h-4 w-1/2 rounded-md bg-[#1F5550]" />
                        <div className="h-8 w-2/3 rounded-md bg-[#1F5550]" />
                      </div>
                    )}

                    {(paymentStatus === 'error' || paymentStatus === 'unavailable') && (
                      <div
                        role="alert"
                        className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-sm text-amber-950 space-y-3"
                      >
                        <p>
                          <strong className="block">
                            {paymentStatus === 'error'
                              ? 'We couldn’t load our bank details'
                              : 'Online payment is paused right now'}
                          </strong>
                          {paymentStatus === 'error'
                            ? 'Please don’t send a transfer yet. Check your connection and try again, or confirm the account with us on WhatsApp.'
                            : 'Our bank details aren’t available yet. Please don’t send a transfer; message us on WhatsApp to complete your order.'}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {paymentStatus === 'error' && (
                            <button
                              type="button"
                              onClick={() => setSettingsReloadKey((k) => k + 1)}
                              className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold transition-colors"
                            >
                              Try again
                            </button>
                          )}
                          <a
                            href={`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
                              `Hello Crafty Cottage, I'd like to pay for my order (${formatNaira(total)}). Please share your bank details.`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="min-h-[44px] px-4 rounded-xl border border-[#0B3D3A] text-[#0B3D3A] hover:bg-amber-100 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                          >
                            <MessageCircle className="w-4 h-4" />
                            <span>Message us on WhatsApp</span>
                          </a>
                        </div>
                      </div>
                    )}

                    {paymentReady && (
                    <div className="bg-[#062E2C] text-[#FAF8F4] rounded-2xl p-5 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-xs text-[#CFC6B2] block">Bank name</span>
                          <strong className="text-white">{settings.bankName}</strong>
                        </div>
                        <div>
                          <span className="text-xs text-[#CFC6B2] block">Account name</span>
                          <strong className="text-white">{settings.accountName}</strong>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-[#1F5550] flex items-center justify-between gap-3">
                        <div>
                          <span className="text-xs text-[#CFC6B2] block">Account number</span>
                          <strong className="text-2xl font-extrabold tracking-wider text-[#E6C975] tabular-nums">
                            {settings.accountNumber}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyAccount}
                          className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#12564F] border border-[#E6C975]/40 text-xs font-bold text-white flex items-center gap-1.5 transition-colors"
                        >
                          {copiedAccount ? <Check className="w-4 h-4 text-[#B8F0CF]" /> : <Copy className="w-4 h-4" />}
                          <span>{copiedAccount ? 'Copied' : 'Copy'}</span>
                        </button>
                      </div>
                    </div>
                    )}

                    <div>
                      <label htmlFor="receipt-upload" className="block text-xs font-bold text-[#0F1F1D] mb-2">
                        Payment receipt (screenshot or PDF) *
                      </label>
                      <label
                        htmlFor="receipt-upload"
                        className={`flex flex-col items-center justify-center gap-2 p-6 rounded-2xl border-2 border-dashed ${errors.receipt ? 'border-[#B42318]' : 'border-[#8C8270]'} hover:border-[#0B3D3A] bg-[#FAF8F4] cursor-pointer transition-colors text-center`}
                      >
                        <Upload className="w-6 h-6 text-[#0B3D3A]" />
                        <span className="text-sm font-bold text-[#0F1F1D]">
                          {receiptFile ? receiptFile.name : 'Tap to choose receipt image or PDF'}
                        </span>
                        <span id="receipt-hint" className="text-xs text-[#3F4F4C]">
                          JPG or PNG up to 10 MB · PDF up to {formatFileSize(RECEIPT_PDF_MAX_BYTES)}
                        </span>
                        <input
                          id="receipt-upload"
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={(e) => {
                            handleFileChange(e)
                            clearError('submit')
                          }}
                          aria-invalid={Boolean(errors.receipt)}
                          aria-describedby={errors.receipt ? 'receipt-error' : 'receipt-hint'}
                          className="sr-only"
                        />
                      </label>

                      {receiptPreview && (
                        <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-[#F4EFE6] border border-[#E2DACA]">
                          <img
                            src={receiptPreview}
                            alt="Uploaded receipt preview"
                            className="w-16 h-16 rounded-lg object-cover border border-[#E2DACA]"
                          />
                          <div className="text-xs text-[#0F1F1D]">
                            <p className="font-bold">Receipt ready to attach</p>
                            <p className="text-[#3F4F4C]">{receiptFile?.name}</p>
                          </div>
                        </div>
                      )}

                      {!receiptPreview && receiptFile && (
                        <div className="mt-3 flex items-center gap-2.5 p-3 rounded-xl bg-[#F4EFE6] border border-[#E2DACA] text-xs font-semibold text-[#0F1F1D]">
                          <FileText className="w-4 h-4 text-[#0B3D3A]" />
                          <span>{receiptFile.name}</span>
                        </div>
                      )}

                      {errors.receipt && (
                        <p id="receipt-error" role="alert" className="text-xs text-[#B42318] mt-1.5">{errors.receipt}</p>
                      )}
                    </div>
                  </section>
                </div>

                <aside className="lg:col-span-5 bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-5 lg:sticky lg:top-24">
                  <h2 className="font-serif-display text-xl font-bold text-[#0F1F1D] border-b border-[#E2DACA] pb-3">
                    Order summary
                  </h2>

                  <ul className="space-y-3 divide-y divide-[#F4EFE6]">
                    {items.map((item) => (
                      <li key={cartLineKey(item)} className="pt-3 first:pt-0 flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-12 h-12 rounded-lg object-cover bg-[#E8DEC8] shrink-0"
                          />
                          <div className="min-w-0">
                            <p className="font-bold text-[#0F1F1D] truncate">{item.name}</p>
                            <p className="text-xs text-[#3F4F4C]">
                              {item.variantLabel ? `${item.variantLabel} · ` : ''}Qty: {item.quantity}
                            </p>
                          </div>
                        </div>
                        <span className="font-bold text-[#0F1F1D] tabular-nums shrink-0">
                          {formatNaira(item.price * item.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-4 border-t border-[#E2DACA] space-y-2 text-sm">
                    <div className="flex justify-between text-[#3F4F4C]">
                      <span>Items subtotal</span>
                      <span className="font-semibold text-[#0F1F1D] tabular-nums">
                        {formatNaira(subtotal)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#3F4F4C]">
                      <span className="min-w-0 truncate pr-3">
                        Delivery{selectedZone ? ` · ${selectedZone.label}` : ''}
                      </span>
                      <span className="font-semibold text-[#0F1F1D] tabular-nums">
                        {!selectedZone ? 'Not chosen' : deliveryFee === 0 ? 'Free' : formatNaira(deliveryFee)}
                      </span>
                    </div>
                    <div className="pt-3 border-t border-[#E2DACA] flex justify-between items-baseline">
                      <span className="font-bold text-[#0F1F1D]">Total to pay</span>
                      <span className="font-serif-display text-2xl font-bold text-[#0B3D3A] tabular-nums">
                        {formatNaira(total)}
                      </span>
                    </div>
                  </div>

                  {errors.submit && (
                    <p role="alert" className="text-xs text-[#B42318] bg-red-50 border border-red-200 p-3 rounded-xl">
                      {errors.submit}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || !paymentReady}
                    aria-describedby={paymentReady ? undefined : 'payment-paused-hint'}
                    className="w-full min-h-[48px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Uploading receipt and placing order...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-4 h-4 text-[#E6C975]" />
                        <span>Place order and send receipt</span>
                      </>
                    )}
                  </button>
                  {!paymentReady && (
                    <p id="payment-paused-hint" className="text-xs text-[#3F4F4C] text-center">
                      {paymentStatus === 'loading'
                        ? 'Loading our bank details…'
                        : 'Ordering is paused until our bank details are available.'}
                    </p>
                  )}
                </aside>
              </form>
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
