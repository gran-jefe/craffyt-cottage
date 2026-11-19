'use client'

import React, { useState } from 'react'
import { Sparkles, MessageCircle } from 'lucide-react'
import { updateBespokeStatus } from '@/lib/storeService'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import type { BespokeRequest, BespokeStatus } from '@/types/store'
import { formatPhone, whatsappDigits } from '@/lib/phone'

interface Props {
  requests: BespokeRequest[]
  onRefresh: () => Promise<void>
}

const STATUS_BADGES: Record<BespokeStatus, string> = {
  new: 'bg-amber-100 text-amber-900',
  quoted: 'bg-sky-100 text-sky-900',
  in_progress: 'bg-[#E3F0EE] text-[#0B3D3A]',
  completed: 'bg-emerald-100 text-emerald-900',
}

export function AdminBespoke({ requests, onRefresh }: Props) {
  const { showToast } = useCart()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleStatus(id: string, status: BespokeStatus) {
    setBusyId(id)
    try {
      await updateBespokeStatus(id, status)
      await onRefresh()
      showToast('Bespoke request updated.')
    } catch {
      showToast('Could not update this request. Check your connection and try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">
          Bespoke requests
        </h2>
        <p className="text-xs text-[#3F4F4C]">
          Custom colour &amp; silhouette specs submitted through the custom bag form.
        </p>
      </div>

      {requests.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-2">
          <Sparkles className="w-8 h-8 text-[#3F4F4C] mx-auto opacity-60" />
          <p className="font-serif-display text-lg font-bold text-[#0F1F1D]">
            No custom requests yet
          </p>
          <p className="text-sm text-[#3F4F4C]">
            When shoppers submit custom colour specifications on the storefront, they will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {requests.map((req) => {
            const waPhone = whatsappDigits(req.customerPhone)

            return (
              <div
                key={req.id}
                className="bg-white rounded-2xl border border-[#E2DACA] p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-serif-display text-lg font-bold text-[#0F1F1D]">
                      {req.customerName}
                    </h3>
                    <p className="text-xs text-[#3F4F4C]">{formatPhone(req.customerPhone)}</p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2.5 py-0.5 rounded-md capitalize ${STATUS_BADGES[req.status]}`}
                  >
                    {req.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="bg-[#FAF8F4] rounded-xl p-3 border border-[#E2DACA] text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#3F4F4C]">Shape:</span>
                    <strong className="text-[#0F1F1D]">{req.shape}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3F4F4C]">Bead finish:</span>
                    <strong className="text-[#0F1F1D]">{req.beadColour}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#3F4F4C]">Estimate:</span>
                    <strong className="text-[#0B3D3A]">{formatNaira(req.estimatedPrice)}</strong>
                  </div>
                  {req.notes && (
                    <p className="pt-1.5 mt-1.5 border-t border-[#E2DACA] text-[#3F4F4C]">
                      <strong>Notes:</strong> {req.notes}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <select
                    aria-label={`Update status for ${req.customerName}`}
                    disabled={busyId === req.id}
                    value={req.status}
                    onChange={(e) => handleStatus(req.id, e.target.value as BespokeStatus)}
                    className="min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-xs font-semibold"
                  >
                    <option value="new">New</option>
                    <option value="quoted">Quoted</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>

                  {waPhone && (
                    <a
                      href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                        `Hello ${req.customerName}, thank you for your Crafty Cottage bespoke request (${req.shape} in ${req.beadColour}). Let's confirm your timeline and details!`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[44px] px-3.5 rounded-xl bg-[#0B3D3A] text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-[#E6C975]" />
                      <span>Reply on WhatsApp</span>
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
