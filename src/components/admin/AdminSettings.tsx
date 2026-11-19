'use client'

import React, { useState } from 'react'
import { Save, Loader2, Plus, Trash2, AlertCircle } from 'lucide-react'
import { saveStoreSettings } from '@/lib/storeService'
import { NUBAN_PATTERN } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import type { StoreSettings } from '@/types/store'

interface Props {
  initialSettings: StoreSettings
  /** True when the current settings failed to load: saving would overwrite real data with blanks. */
  locked?: boolean
  onRefresh: () => Promise<void>
}

type FieldKey = 'bankName' | 'accountName' | 'accountNumber' | 'whatsappNumber'

function validateSettings(s: StoreSettings): Partial<Record<FieldKey, string>> {
  const errors: Partial<Record<FieldKey, string>> = {}
  if (s.bankName.trim().length < 2) errors.bankName = 'Enter the bank customers should pay into.'
  if (s.accountName.trim().length < 2) errors.accountName = 'Enter the account name exactly as the bank shows it.'
  if (!NUBAN_PATTERN.test(s.accountNumber.trim()))
    errors.accountNumber = 'Account numbers are exactly 10 digits, with no spaces.'
  if (!/^234\d{10}$/.test(s.whatsappNumber.trim()))
    errors.whatsappNumber = 'Use the international format without +, e.g. 2348031234567.'
  return errors
}

const FIELD_ORDER: FieldKey[] = ['bankName', 'accountName', 'accountNumber', 'whatsappNumber']
const FIELD_IDS: Record<FieldKey, string> = {
  bankName: 'set-bank',
  accountName: 'set-acc-name',
  accountNumber: 'set-acc-num',
  whatsappNumber: 'set-wa',
}

function FieldError({ field, message }: { field: FieldKey; message?: string }) {
  if (!message) return null
  return (
    <p id={`${FIELD_IDS[field]}-error`} className="mt-1 flex items-center gap-1.5 text-xs text-[#B42318]">
      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
      {message}
    </p>
  )
}

export function AdminSettings({ initialSettings, locked = false, onRefresh }: Props) {
  const { showToast } = useCart()
  const [form, setForm] = useState<StoreSettings>(initialSettings)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [confirmingBank, setConfirmingBank] = useState(false)

  function a11y(field: FieldKey) {
    const message = errors[field]
    return {
      'aria-invalid': Boolean(message),
      'aria-describedby': message ? `${FIELD_IDS[field]}-error` : undefined,
      className: `w-full min-h-[44px] px-3 rounded-xl border bg-[#FAF8F4] text-sm ${
        message ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#E2DACA]'
      }`,
    }
  }

  function update<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setForm((f) => ({ ...f, [key]: value }))
    // Any edit invalidates a pending read-back: the admin must confirm what will actually be saved.
    setConfirmingBank(false)
    if (key in errors) setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  const bankChanged =
    form.bankName.trim() !== initialSettings.bankName.trim() ||
    form.accountName.trim() !== initialSettings.accountName.trim() ||
    form.accountNumber.trim() !== initialSettings.accountNumber.trim()

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (locked || saving) return
    const nextErrors = validateSettings(form)
    setErrors(nextErrors)
    const first = FIELD_ORDER.find((k) => nextErrors[k])
    if (first) {
      setConfirmingBank(false)
      document.getElementById(FIELD_IDS[first])?.focus()
      return
    }
    // Changing where customers send money gets an explicit read-back before it goes live.
    if (bankChanged && !confirmingBank) {
      setConfirmingBank(true)
      requestAnimationFrame(() => document.getElementById('bank-confirm-title')?.focus())
      return
    }
    await persist()
  }

  async function persist() {
    setSaving(true)
    try {
      await saveStoreSettings({
        ...form,
        bankName: form.bankName.trim(),
        accountName: form.accountName.trim(),
        accountNumber: form.accountNumber.trim(),
        whatsappNumber: form.whatsappNumber.trim(),
      })
      setConfirmingBank(false)
      await onRefresh()
      showToast(
        bankChanged
          ? 'Saved. Checkout now shows the new bank account.'
          : 'Store and delivery settings saved.'
      )
    } catch {
      showToast('Could not save settings. Check your connection and try again.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6 max-w-3xl">
      <div>
        <h2 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">
          Bank account and delivery settings
        </h2>
        <p className="text-xs text-[#3F4F4C]">
          Update the bank transfer account details and delivery zone fees displayed to customers at checkout.
        </p>
      </div>

      {locked && (
        <p role="alert" className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#7A1B14]">
          <strong>Saving is disabled.</strong> Your current settings didn&apos;t load, so saving now could
          overwrite them. Use &quot;Retry loading&quot; above first.
        </p>
      )}

      {/* Bank Details */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-bold text-[#0F1F1D]">
          Bank transfer details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="set-bank" className="block text-xs font-bold mb-1">
              Bank name *
            </label>
            <input
              id="set-bank"
              type="text"
              value={form.bankName}
              onChange={(e) => update('bankName', e.target.value)}
              placeholder="e.g. GTBank"
              {...a11y('bankName')}
            />
            <FieldError field="bankName" message={errors.bankName} />
          </div>
          <div>
            <label htmlFor="set-acc-name" className="block text-xs font-bold mb-1">
              Account name *
            </label>
            <input
              id="set-acc-name"
              type="text"
              value={form.accountName}
              onChange={(e) => update('accountName', e.target.value)}
              {...a11y('accountName')}
            />
            <FieldError field="accountName" message={errors.accountName} />
          </div>
          <div>
            <label htmlFor="set-acc-num" className="block text-xs font-bold mb-1">
              Account number *
            </label>
            <input
              id="set-acc-num"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              value={form.accountNumber}
              onChange={(e) => update('accountNumber', e.target.value.replace(/\D/g, ''))}
              placeholder="10 digits"
              {...a11y('accountNumber')}
              className={`${a11y('accountNumber').className} font-bold tracking-wider tabular-nums`}
            />
            <FieldError field="accountNumber" message={errors.accountNumber} />
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <h3 className="font-serif-display text-lg font-bold text-[#0F1F1D]">
          Contact details
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="set-wa" className="block text-xs font-bold mb-1">
              WhatsApp number (234...) *
            </label>
            <input
              id="set-wa"
              type="text"
              inputMode="numeric"
              value={form.whatsappNumber}
              onChange={(e) => update('whatsappNumber', e.target.value.replace(/\D/g, ''))}
              {...a11y('whatsappNumber')}
            />
            <FieldError field="whatsappNumber" message={errors.whatsappNumber} />
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
        </div>
      </section>

      {/* Delivery Zones */}
      <section className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-serif-display text-lg font-bold text-[#0F1F1D]">
            Delivery zones and fees
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
            className="min-h-[44px] px-3 rounded-lg border border-[#0B3D3A] text-[#0B3D3A] text-xs font-bold flex items-center gap-1"
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

      {confirmingBank ? (
        <section
          role="alertdialog"
          aria-labelledby="bank-confirm-title"
          aria-describedby="bank-confirm-desc"
          className="p-5 rounded-2xl bg-amber-50 border border-amber-300 space-y-4"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !saving) setConfirmingBank(false)
          }}
        >
          <div className="space-y-1">
            <h3
              id="bank-confirm-title"
              tabIndex={-1}
              className="font-serif-display text-lg font-bold text-[#0F1F1D] rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0B3D3A]"
            >
              Confirm the new bank account
            </h3>
            <p id="bank-confirm-desc" className="text-sm text-amber-950">
              Every customer who checks out after you save will transfer money to this account. Check each digit
              against your bank app.
            </p>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-white border border-amber-200 text-sm">
            {initialSettings.accountNumber && (
              <div className="sm:col-span-3 text-xs text-[#3F4F4C]">
                Replacing {initialSettings.bankName} · {initialSettings.accountName} ·{' '}
                <span className="tabular-nums">{initialSettings.accountNumber}</span>
              </div>
            )}
            <div>
              <dt className="text-xs text-[#3F4F4C]">Bank</dt>
              <dd className="font-bold text-[#0F1F1D]">{form.bankName.trim()}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#3F4F4C]">Account name</dt>
              <dd className="font-bold text-[#0F1F1D]">{form.accountName.trim()}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#3F4F4C]">Account number</dt>
              <dd className="text-xl font-extrabold tracking-wider tabular-nums text-[#0B3D3A]">
                {form.accountNumber.trim()}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving || locked}
              className="min-h-[48px] px-6 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#E6C975]" />}
              <span>{saving ? 'Saving…' : 'Yes, use this account'}</span>
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setConfirmingBank(false)
                document.getElementById('set-acc-num')?.focus()
              }}
              className="min-h-[48px] px-5 rounded-xl border border-[#8C8270] bg-white text-sm font-bold text-[#0F1F1D] hover:bg-[#F4EFE6] disabled:opacity-60"
            >
              Go back and edit
            </button>
          </div>
        </section>
      ) : (
        <button
          type="submit"
          disabled={saving || locked}
          className="min-h-[48px] px-7 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#E6C975]" />}
          <span>{saving ? 'Saving settings...' : bankChanged ? 'Review and save' : 'Save settings'}</span>
        </button>
      )}
    </form>
  )
}
