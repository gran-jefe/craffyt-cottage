'use client'

import React, { useState } from 'react'
import { Save, Loader2, Plus, Trash2 } from 'lucide-react'
import { saveStoreSettings } from '@/lib/storeService'
import { useCart } from '@/context/CartContext'
import type { StoreSettings } from '@/types/store'

interface Props {
  initialSettings: StoreSettings
  onRefresh: () => Promise<void>
}

export function AdminSettings({ initialSettings, onRefresh }: Props) {
  const { showToast } = useCart()
  const [form, setForm] = useState<StoreSettings>(initialSettings)
  const [saving, setSaving] = useState(false)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await saveStoreSettings(form)
      await onRefresh()
      showToast('Store & bank transfer details saved!')
    } catch {
      showToast('Could not save settings.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-serif-display text-2xl font-bold text-[#17210E]">
          Bank Account &amp; Delivery Settings
        </h2>
        <p className="text-xs text-[#4A5240]">
          Update the bank transfer account details and delivery zone fees displayed to customers at checkout.
        </p>
      </div>

      {/* Bank Details */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-bold text-[#17210E]">
          Bank transfer details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="set-bank" className="block text-xs font-bold mb-1">
              Bank name
            </label>
            <input
              id="set-bank"
              type="text"
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-acc-name" className="block text-xs font-bold mb-1">
              Account name
            </label>
            <input
              id="set-acc-name"
              type="text"
              value={form.accountName}
              onChange={(e) => setForm({ ...form, accountName: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-acc-num" className="block text-xs font-bold mb-1">
              Account number
            </label>
            <input
              id="set-acc-num"
              type="text"
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm font-bold tracking-wider"
            />
          </div>
        </div>
      </section>

      {/* Studio Contact */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-bold text-[#17210E]">
          Studio contact details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="set-wa" className="block text-xs font-bold mb-1">
              WhatsApp Number (234...)
            </label>
            <input
              id="set-wa"
              type="text"
              value={form.whatsappNumber}
              onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-ig" className="block text-xs font-bold mb-1">
              Instagram handle
            </label>
            <input
              id="set-ig"
              type="text"
              value={form.instagramHandle}
              onChange={(e) => setForm({ ...form, instagramHandle: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
            />
          </div>
          <div>
            <label htmlFor="set-loc" className="block text-xs font-bold mb-1">
              Studio address
            </label>
            <input
              id="set-loc"
              type="text"
              value={form.studioLocation}
              onChange={(e) => setForm({ ...form, studioLocation: e.target.value })}
              className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
            />
          </div>
        </div>
      </section>

      {/* Delivery Zones */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif-display text-lg font-bold text-[#17210E]">
            Delivery Zones &amp; Fees
          </h3>
          <button
            type="button"
            onClick={() =>
              setForm({
                ...form,
                deliveryZones: [
                  ...form.deliveryZones,
                  { id: `zone-${Date.now()}`, label: 'New delivery zone', fee: 3000, eta: '2–3 days' },
                ],
              })
            }
            className="min-h-[44px] px-3 rounded-lg border border-[#263E0F] text-[#263E0F] text-xs font-bold flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add zone</span>
          </button>
        </div>

        <div className="space-y-3">
          {form.deliveryZones.map((zone, idx) => (
            <div key={zone.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
              <input
                type="text"
                aria-label="Zone name"
                value={zone.label}
                onChange={(e) => {
                  const next = [...form.deliveryZones]
                  next[idx] = { ...zone, label: e.target.value }
                  setForm({ ...form, deliveryZones: next })
                }}
                className="sm:col-span-5 min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-[#FAF8F4] text-xs font-semibold"
              />
              <input
                type="number"
                aria-label="Delivery fee in Naira"
                min="0"
                value={zone.fee}
                onChange={(e) => {
                  const next = [...form.deliveryZones]
                  next[idx] = { ...zone, fee: Math.max(0, Number(e.target.value)) }
                  setForm({ ...form, deliveryZones: next })
                }}
                className="sm:col-span-3 min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-[#FAF8F4] text-xs"
              />
              <input
                type="text"
                aria-label="Estimated delivery time"
                value={zone.eta}
                onChange={(e) => {
                  const next = [...form.deliveryZones]
                  next[idx] = { ...zone, eta: e.target.value }
                  setForm({ ...form, deliveryZones: next })
                }}
                className="sm:col-span-3 min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-[#FAF8F4] text-xs"
              />
              <button
                type="button"
                aria-label="Remove delivery zone"
                onClick={() =>
                  setForm({
                    ...form,
                    deliveryZones: form.deliveryZones.filter((_, i) => i !== idx),
                  })
                }
                className="sm:col-span-1 min-h-[44px] rounded-lg border border-[#E2DACA] text-[#B42318] flex items-center justify-center"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <button
        type="submit"
        disabled={saving}
        className="min-h-[48px] px-7 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#E6C975]" />}
        <span>{saving ? 'Saving settings...' : 'Save settings'}</span>
      </button>
    </form>
  )
}
