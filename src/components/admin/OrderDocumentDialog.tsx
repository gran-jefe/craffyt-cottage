'use client'

import React, { useEffect, useState } from 'react'
import { Download, Loader2, Mail, MessageCircle, X, AlertTriangle } from 'lucide-react'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { formatNaira } from '@/lib/defaults'
import { whatsappDigits } from '@/lib/phone'
import {
  availableDocKinds,
  buildOrderPdf,
  docFileName,
  docNumber,
  docTitle,
  orderDocMessage,
  saveBlob,
  type OrderDocKind,
} from '@/lib/orderDocument'
import type { Order, StoreSettings } from '@/types/store'

interface Props {
  order: Order
  settings: StoreSettings | null
  onClose: () => void
  /** Non-blocking confirmation for the admin. */
  onNotify: (message: string) => void
}

type Channel = 'whatsapp' | 'email'

/**
 * Makes the order's invoice or receipt and gets it to the customer. On phones the PDF itself is
 * handed to the share sheet (pick WhatsApp or Gmail and it arrives attached). On computers,
 * where browsers can't attach files to WhatsApp or email, the PDF downloads and the chat or
 * email opens with the message written, ready to attach it.
 */
export function OrderDocumentDialog({ order, settings, onClose, onNotify }: Props) {
  const kinds = availableDocKinds(order)
  const [kind, setKind] = useState<OrderDocKind>(kinds[0] ?? 'invoice')
  const [pdf, setPdf] = useState<{ kind: OrderDocKind; blob: Blob } | null>(null)
  const [buildError, setBuildError] = useState(false)
  const [sending, setSending] = useState<Channel | null>(null)
  const ref = useDialogFocus<HTMLDivElement>(true)

  // Build ahead of the click: phones only allow the share sheet straight after a tap.
  useEffect(() => {
    let active = true
    setPdf(null)
    setBuildError(false)
    buildOrderPdf(kind, order, settings)
      .then((blob) => active && setPdf({ kind, blob }))
      .catch(() => active && setBuildError(true))
    return () => {
      active = false
    }
  }, [kind, order, settings])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const ready = pdf?.kind === kind ? pdf.blob : null
  const fileName = docFileName(kind, order)
  const message = orderDocMessage(kind, order, settings)
  const subject = `${docTitle(kind)} for your Crafty Cottage order ${order.orderCode}`
  const waPhone = whatsappDigits(order.customerPhone) ?? ''
  const email = order.customerEmail?.trim() ?? ''

  function download() {
    if (!ready) return
    saveBlob(ready, fileName)
    onNotify(`${docTitle(kind)} downloaded`)
  }

  async function send(channel: Channel) {
    if (!ready) return
    setSending(channel)
    try {
      const file = new File([ready], fileName, { type: 'application/pdf' })
      const touch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
      if (touch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: subject, text: message })
          onNotify(`${docTitle(kind)} shared`)
          return
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return // admin closed the share sheet
          // Fall through to download and link.
        }
      }
      saveBlob(ready, fileName)
      const href =
        channel === 'whatsapp'
          ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
          : `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
      window.open(href, channel === 'whatsapp' ? '_blank' : '_self', 'noopener')
      onNotify(
        channel === 'whatsapp'
          ? 'PDF downloaded. Attach it in the WhatsApp chat that just opened.'
          : 'PDF downloaded. Attach it to the email that just opened.'
      )
    } finally {
      setSending(null)
    }
  }

  const secondary =
    'min-h-[44px] px-4 rounded-xl border border-[#E2DACA] bg-white hover:border-[#0B3D3A] hover:bg-[#FAF8F4] text-sm font-bold text-[#0F1F1D] inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D3A]'
  const primary =
    'min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] active:bg-[#021817] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B3D3A]'

  return (
    <div
      className="fixed inset-0 z-50 bg-[#04201F]/75 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-dialog-title"
      onClick={onClose}
    >
      <div
        ref={ref}
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#E2DACA] max-h-[90vh] overflow-y-auto p-5 space-y-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="doc-dialog-title" className="font-serif-display text-lg font-bold text-[#0F1F1D]">
              Invoice and receipt
            </h3>
            <p className="text-xs text-[#3F4F4C]">
              {order.orderCode} · {order.customerName} · {formatNaira(order.total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] flex items-center justify-center hover:bg-[#FAF8F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D3A]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {kinds.length > 1 ? (
          <fieldset>
            <legend className="text-xs font-bold text-[#0F1F1D] mb-1.5">Document</legend>
            <div className="grid grid-cols-2 gap-2">
              {kinds.map((k) => (
                <label
                  key={k}
                  className={`min-h-[44px] px-3 rounded-xl border text-sm font-semibold flex items-center gap-2 cursor-pointer transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0B3D3A] ${
                    kind === k ? 'border-[#0B3D3A] bg-[#E3F0EE] text-[#0B3D3A]' : 'border-[#E2DACA] text-[#0F1F1D] hover:border-[#0B3D3A]'
                  }`}
                >
                  <input type="radio" name="doc-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  {docTitle(k)}
                </label>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[#3F4F4C] leading-relaxed">
              Receipt confirms payment. Invoice lists what was ordered and the amount.
            </p>
          </fieldset>
        ) : (
          <p className="text-sm text-[#0F1F1D] bg-[#FAF8F4] border border-[#E2DACA] rounded-xl p-3 leading-relaxed">
            <strong>Invoice</strong> with your bank details. A receipt becomes available once you verify the payment.
          </p>
        )}

        <div className="text-xs text-[#3F4F4C]" aria-live="polite">
          {buildError ? (
            <span className="text-[#B42318] inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Couldn&apos;t create the PDF. Close this and try again.
            </span>
          ) : ready ? (
            <>
              <strong className="text-[#0F1F1D]">{docNumber(kind, order)}</strong> is ready.
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing PDF…
            </span>
          )}
        </div>

        <div className="grid gap-2">
          <button type="button" disabled={!ready || !waPhone || Boolean(sending)} onClick={() => send('whatsapp')} className={primary}>
            {sending === 'whatsapp' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4 text-[#E6C975]" />}
            Send on WhatsApp
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={!ready || !email || Boolean(sending)} onClick={() => send('email')} className={secondary}>
              {sending === 'email' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Email
            </button>
            <button type="button" disabled={!ready} onClick={download} className={secondary}>
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
          {(!waPhone || !email) && (
            <p className="text-xs text-[#3F4F4C]">
              {!email && 'No email on this order, so email is off. '}
              {!waPhone && 'No WhatsApp number on this order. '}
              Download the PDF to send it another way.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
