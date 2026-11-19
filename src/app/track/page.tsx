'use client'

import React, { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Search, Package, CheckCircle2, Truck, Clock, XCircle, Loader2, MessageCircle } from 'lucide-react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { fetchStoreSettings, lookupOrderTracking } from '@/lib/storeService'
import { DEFAULT_STORE_SETTINGS, formatNaira } from '@/lib/defaults'
import type { OrderStatus, OrderTrackingInfo } from '@/types/store'

const STEPS: { key: OrderStatus; label: string; desc: string }[] = [
  {
    key: 'pending_verification',
    label: 'Transfer receipt received',
    desc: 'Awaiting payment verification by Crafty Cottage.',
  },
  {
    key: 'payment_confirmed',
    label: 'Payment confirmed',
    desc: 'Your transfer has been verified.',
  },
  {
    key: 'processing',
    label: 'Preparing and packaging',
    desc: 'Your beaded piece is being inspected and gift-packed for dispatch.',
  },
  {
    key: 'dispatched',
    label: 'Out for delivery',
    desc: 'Handed over to dispatch rider or courier.',
  },
  {
    key: 'delivered',
    label: 'Delivered',
    desc: 'Order completed.',
  },
]

function TrackContent() {
  const params = useSearchParams()
  const initialCode = params.get('code') || ''

  const [codeInput, setCodeInput] = useState(initialCode)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [result, setResult] = useState<OrderTrackingInfo | null>(null)
  const [lookupError, setLookupError] = useState(false)
  const [whatsappNumber, setWhatsappNumber] = useState(DEFAULT_STORE_SETTINGS.whatsappNumber)

  // Use the studio's saved WhatsApp number; the default only covers a failed or missing settings read.
  useEffect(() => {
    fetchStoreSettings()
      .then((cfg) => {
        if (cfg?.whatsappNumber) setWhatsappNumber(cfg.whatsappNumber)
      })
      .catch(() => {})
  }, [])

  async function runLookup(code: string) {
    if (!code.trim()) return
    setLoading(true)
    setSearched(true)
    setLookupError(false)
    try {
      const data = await lookupOrderTracking(code)
      setResult(data)
    } catch {
      // A network failure is not the same as "no such order". Never tell a paying customer it doesn't exist.
      setResult(null)
      setLookupError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (initialCode) runLookup(initialCode)
  }, [initialCode])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    runLookup(codeInput)
  }

  const currentIdx = result ? STEPS.findIndex((s) => s.key === result.status) : -1

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-8">
      <div className="text-center space-y-2">
        <span className="text-xs font-bold uppercase tracking-widest text-[#355416]">
          Order status
        </span>
        <h1 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#111B07]">
          Track your order
        </h1>
        <p className="text-sm text-[#4A5240]">
          Enter your Crafty Cottage reference code (for example, <strong>CC-7K9P2M</strong>).
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="order-code-input" className="sr-only">
          Order reference code
        </label>
        <input
          id="order-code-input"
          type="text"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          placeholder="e.g. CC-7K9P2M"
          className="flex-1 min-w-0 min-h-[48px] px-4 rounded-xl bg-white border border-[#E2DACA] text-sm font-bold tracking-wider uppercase"
        />
        <button
          type="submit"
          disabled={loading}
          className="shrink-0 min-h-[48px] px-5 sm:px-6 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span>Track</span>
        </button>
      </form>

      {lookupError && !loading && (
        <div role="alert" className="bg-white rounded-2xl border border-red-200 p-8 text-center space-y-3">
          <XCircle className="w-8 h-8 text-[#B42318] mx-auto" />
          <h2 className="font-serif-display text-xl font-bold text-[#17210E]">
            We couldn&apos;t reach the order tracker
          </h2>
          <p className="text-sm text-[#4A5240]">
            Your order is safe. This is a connection problem on our side or yours. Please try again.
          </p>
          <button
            type="button"
            onClick={() => runLookup(codeInput)}
            className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold"
          >
            Try again
          </button>
        </div>
      )}

      {searched && !loading && !lookupError && !result && (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-8 text-center space-y-2">
          <Package className="w-8 h-8 text-[#4A5240] mx-auto" />
          <h2 className="font-serif-display text-xl font-bold text-[#17210E]">
            Order not found
          </h2>
          <p className="text-sm text-[#4A5240]">
            Please double-check the reference code from your checkout confirmation screen.
          </p>
          <a
            href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
              `Hello Crafty Cottage, I can't find my order${codeInput ? ` (${codeInput})` : ''} on the tracking page.`
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 min-h-[44px] px-5 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-sm font-bold inline-flex items-center gap-2 transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>Ask us on WhatsApp</span>
          </a>
        </div>
      )}

      {result && (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-6 sm:p-8 space-y-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E2DACA] pb-4">
            <div>
              <span className="text-xs text-[#4A5240] block">Order reference</span>
              <strong className="text-2xl font-extrabold text-[#263E0F] tracking-wider">
                {result.orderCode}
              </strong>
            </div>
            <div className="sm:text-right">
              <span className="text-xs text-[#4A5240] block">
                {result.itemCount} item(s) · {result.deliveryZone}
              </span>
              <strong className="text-lg font-bold text-[#17210E] tabular-nums">
                {formatNaira(result.total)}
              </strong>
            </div>
          </div>

          {result.status === 'cancelled' ? (
            <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-[#B42318]">
              <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Order cancelled</p>
                <p className="mt-0.5">
                  {result.dispatchNote || 'Please contact Crafty Cottage on WhatsApp if you need clarification.'}
                </p>
              </div>
            </div>
          ) : (
            <ol className="space-y-4">
              {STEPS.map((step, idx) => {
                const done = idx <= currentIdx
                const current = idx === currentIdx
                return (
                  <li key={step.key} className="flex items-start gap-3.5">
                    <span
                      className={`w-8 h-8 rounded-full grid place-items-center shrink-0 mt-0.5 border ${
                        done
                          ? 'bg-[#263E0F] text-white border-[#263E0F]'
                          : 'bg-[#FAF8F4] text-[#4A5240] border-[#E2DACA]'
                      }`}
                    >
                      {done ? (
                        step.key === 'dispatched' ? (
                          <Truck className="w-4 h-4" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4" />
                        )
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                    </span>
                    <div className="flex-1">
                      <p className={`text-sm font-bold ${done ? 'text-[#17210E]' : 'text-[#4A5240]'}`}>
                        {step.label}
                        {current && (
                          <span className="ml-2 text-xs bg-[#EAF2DE] text-[#263E0F] px-2 py-0.5 rounded-md">
                            Current stage
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#4A5240] mt-0.5">{step.desc}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}

          {result.dispatchNote && result.status !== 'cancelled' && (
            <div className="p-4 rounded-xl bg-[#FAF8F4] border border-[#E2DACA] text-xs text-[#17210E]">
              <span className="font-bold block mb-0.5">Delivery note and tracking info</span>
              <span>{result.dispatchNote}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function TrackOrderPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1 py-12 sm:py-16">
        <Suspense fallback={<div className="text-center py-12 text-sm text-[#4A5240]">Loading order tracker...</div>}>
          <TrackContent />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  )
}
