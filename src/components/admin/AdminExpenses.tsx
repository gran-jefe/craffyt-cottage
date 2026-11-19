'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Loader2, Pencil, Plus, Trash2, Wallet, X } from 'lucide-react'
import { deleteExpense, saveExpense } from '@/lib/storeService'
import {
  currentPeriodKey,
  DAY_MS,
  EXPENSE_CATEGORIES,
  EXPENSE_PERIOD_LABELS,
  expenseBounds,
  expensePeriodLabel,
  expenseShare,
  parseDateInput,
} from '@/lib/analytics'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import { useDialogFocus } from '@/lib/useDialogFocus'
import type { Expense, ExpensePeriod } from '@/types/store'

interface Props {
  expenses: Expense[]
  /** True when expenses couldn't be loaded: block edits so nothing is saved over unseen data. */
  loadFailed: boolean
  onRefresh: () => Promise<void>
}

type ListFilter = 'this_month' | 'this_year' | 'all'

const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All' },
]

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface FormState {
  id?: string
  createdAt?: string
  description: string
  amount: string
  category: string
  period: ExpensePeriod
  day: string // YYYY-MM-DD
  month: string // 01-12
  year: string // YYYY
}

function emptyForm(now: number): FormState {
  const today = currentPeriodKey('day', now)
  return {
    description: '',
    amount: '',
    category: EXPENSE_CATEGORIES[0],
    period: 'day',
    day: today,
    month: today.slice(5, 7),
    year: today.slice(0, 4),
  }
}

function periodKeyOf(f: FormState): string {
  return f.period === 'day' ? f.day : f.period === 'month' ? `${f.year}-${f.month}` : f.year
}

type FieldErrors = Partial<Record<'description' | 'amount' | 'day', string>>

function validate(f: FormState): FieldErrors {
  const errors: FieldErrors = {}
  if (f.description.trim().length < 2) errors.description = 'Say what the money was for, e.g. "Czech beads, 5 packs".'
  const amount = Number(f.amount)
  if (!f.amount.trim() || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter the amount in Naira, above ₦0.'
  else if (amount >= 1_000_000_000) errors.amount = 'That amount looks too large. Check the number of zeros.'
  if (f.period === 'day' && parseDateInput(f.day) === null) errors.day = 'Pick the date this was spent.'
  return errors
}

export function AdminExpenses({ expenses, loadFailed, onRefresh }: Props) {
  const { showToast } = useCart()
  const now = useMemo(() => Date.now(), [expenses])
  const [filter, setFilter] = useState<ListFilter>('this_month')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => emptyForm(Date.now()))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const modalRef = useDialogFocus<HTMLDivElement>(modalOpen)

  useEffect(() => {
    if (!confirmDeleteId) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setModalOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modalOpen, saving])

  // Window for the list filter and the totals (Nigeria time).
  const windows = useMemo(() => {
    const month = expenseBounds({ period: 'month', periodKey: currentPeriodKey('month', now) })!
    const year = expenseBounds({ period: 'year', periodKey: currentPeriodKey('year', now) })!
    return { this_month: month, this_year: year }
  }, [now])

  const monthTotal = expenses.reduce((n, e) => n + expenseShare(e, windows.this_month.start, windows.this_month.end), 0)
  const yearTotal = expenses.reduce((n, e) => n + expenseShare(e, windows.this_year.start, windows.this_year.end), 0)

  const visible = useMemo(() => {
    if (filter === 'all') return expenses
    const w = windows[filter]
    return expenses.filter((e) => expenseShare(e, w.start, w.end) > 0)
  }, [expenses, filter, windows])

  function openNew() {
    setForm(emptyForm(Date.now()))
    setErrors({})
    setSaveError('')
    setModalOpen(true)
  }

  function openEdit(e: Expense) {
    const base = emptyForm(Date.now())
    const key = e.periodKey
    setForm({
      ...base,
      id: e.id,
      createdAt: e.createdAt,
      description: e.description,
      amount: String(e.amount),
      category: e.category,
      period: e.period,
      day: e.period === 'day' ? key : base.day,
      month: e.period === 'month' ? key.slice(5, 7) : base.month,
      year: key.slice(0, 4),
    })
    setErrors({})
    setSaveError('')
    setModalOpen(true)
  }

  function update(patch: Partial<FormState>) {
    setForm((f) => ({ ...f, ...patch }))
    setErrors((prev) => {
      const next = { ...prev }
      for (const k of Object.keys(patch)) delete next[k as keyof FieldErrors]
      return next
    })
  }

  async function handleSave(ev: React.FormEvent) {
    ev.preventDefault()
    const found = validate(form)
    setErrors(found)
    setSaveError('')
    const first = (['description', 'amount', 'day'] as const).find((k) => found[k])
    if (first) {
      document.getElementById(`exp-${first}`)?.focus()
      return
    }
    setSaving(true)
    try {
      await saveExpense({
        id: form.id,
        createdAt: form.createdAt,
        description: form.description,
        category: form.category,
        amount: Number(form.amount),
        period: form.period,
        periodKey: periodKeyOf(form),
      })
      await onRefresh()
      setModalOpen(false)
      showToast(form.id ? 'Expense updated.' : 'Expense recorded.')
    } catch {
      setSaveError('Could not save this expense. Check your connection and try again. Your entry is still here.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(e: Expense) {
    if (confirmDeleteId !== e.id) {
      setConfirmDeleteId(e.id)
      return
    }
    setConfirmDeleteId(null)
    setBusyId(e.id)
    try {
      await deleteExpense(e.id)
      await onRefresh()
      showToast(`Deleted "${e.description}".`)
    } catch {
      showToast('Could not delete this expense. Check your connection and try again.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  const thisYear = Number(currentPeriodKey('year', now))
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(thisYear + 1 - i))
  if (!yearOptions.includes(form.year)) yearOptions.push(form.year)

  // Preview of how a monthly/yearly cost is spread, so the owner sees what analytics will count.
  const previewBounds =
    form.period !== 'day' ? expenseBounds({ period: form.period, periodKey: periodKeyOf(form) }) : null
  const perDay =
    previewBounds && Number(form.amount) > 0
      ? Number(form.amount) / Math.round((previewBounds.end - previewBounds.start) / DAY_MS)
      : 0

  const input = (hasError: boolean) =>
    `w-full min-h-[44px] px-3 rounded-xl border bg-[#FAF8F4] text-base sm:text-sm ${
      hasError ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#8C8270]'
    }`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-2xl font-bold text-[#17210E]">Expenses</h2>
          <p className="text-xs text-[#4A5240] leading-relaxed max-w-xl">
            Record what the business spends. Monthly and yearly costs are spread evenly over their days, so profit on
            the Overview is right for any date range.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          disabled={loadFailed}
          className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4 text-[#E6C975]" aria-hidden="true" />
          <span>Record expense</span>
        </button>
      </div>

      {loadFailed && (
        <div role="alert" className="flex items-start gap-2.5 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#7A1B14]">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <strong className="block">Could not load your expenses</strong>
            Recording is paused so nothing is entered twice. Check your connection, then refresh the page.
          </p>
        </div>
      )}

      {/* Totals: one surface, hairline divider */}
      <div className="grid grid-cols-2 gap-px rounded-2xl border border-[#E2DACA] bg-[#E2DACA] overflow-hidden">
        <div className="bg-white p-4 sm:p-5">
          <p className="text-xs font-semibold text-[#4A5240]">Spent this month</p>
          <p className="text-2xl sm:text-[28px] leading-tight font-bold text-[#17210E] tabular-nums">
            {formatNaira(Math.round(monthTotal))}
          </p>
          <p className="text-xs text-[#4A5240]">{expensePeriodLabel({ period: 'month', periodKey: currentPeriodKey('month', now) })}</p>
        </div>
        <div className="bg-white p-4 sm:p-5">
          <p className="text-xs font-semibold text-[#4A5240]">Spent this year</p>
          <p className="text-2xl sm:text-[28px] leading-tight font-bold text-[#17210E] tabular-nums">
            {formatNaira(Math.round(yearTotal))}
          </p>
          <p className="text-xs text-[#4A5240]">Includes this year&apos;s share of yearly costs</p>
        </div>
      </div>

      <div className="space-y-3">
        <div role="group" aria-label="Show expenses for" className="inline-flex rounded-xl border border-[#8C8270] bg-white overflow-hidden">
          {LIST_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={`min-h-[44px] px-4 text-sm font-semibold transition-colors ${
                filter === f.value ? 'bg-[#263E0F] text-white' : 'text-[#4A5240] hover:bg-[#F4EFE6] hover:text-[#17210E]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-3">
            <Wallet className="w-8 h-8 mx-auto text-[#4A5240]" aria-hidden="true" />
            <p className="font-serif-display text-lg font-bold text-[#17210E]">
              {expenses.length === 0 ? 'No expenses recorded yet' : 'Nothing recorded for this period'}
            </p>
            <p className="text-sm text-[#4A5240] max-w-md mx-auto leading-relaxed">
              Add costs like beads, packaging, delivery and rent to see your real profit, not just sales.
            </p>
            {!loadFailed && (
              <button
                type="button"
                onClick={openNew}
                className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold"
              >
                Record your first expense
              </button>
            )}
          </div>
        ) : (
          <ul className="bg-white rounded-2xl border border-[#E2DACA] divide-y divide-[#F4EFE6]">
            {visible.map((e) => {
              const armed = confirmDeleteId === e.id
              return (
                <li key={e.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex-1 min-w-[180px]">
                    <p className="text-sm font-semibold text-[#17210E]">{e.description}</p>
                    <p className="text-xs text-[#4A5240]">
                      {e.category} · {expensePeriodLabel(e)}
                      {e.period !== 'day' && <span> ({e.period === 'month' ? 'monthly' : 'yearly'})</span>}
                    </p>
                  </div>
                  <p className="text-sm font-bold text-[#17210E] tabular-nums">{formatNaira(e.amount)}</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(e)}
                      disabled={loadFailed}
                      aria-label={`Edit ${e.description}`}
                      className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] hover:border-[#263E0F] flex items-center justify-center disabled:opacity-40"
                    >
                      <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={busyId === e.id || loadFailed}
                      onClick={() => handleDelete(e)}
                      aria-label={armed ? `Confirm delete ${e.description}` : `Delete ${e.description}`}
                      className={`min-w-[44px] min-h-[44px] rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                        armed
                          ? 'px-3 bg-[#B42318] border-[#B42318] text-white hover:bg-[#912018]'
                          : 'border-[#E2DACA] hover:bg-red-50 hover:border-red-300 text-[#B42318]'
                      }`}
                    >
                      {busyId === e.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      {armed && <span>Tap again to delete</span>}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#111B07]/60 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="expense-modal-title"
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            ref={modalRef}
            onClick={(ev) => ev.stopPropagation()}
            className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#E2DACA] pb-3">
              <h3 id="expense-modal-title" className="font-serif-display text-xl font-bold text-[#17210E]">
                {form.id ? 'Edit expense' : 'Record an expense'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                disabled={saving}
                aria-label="Close expense dialog"
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleSave} noValidate className="space-y-4">
              <div>
                <label htmlFor="exp-description" className="block text-xs font-bold mb-1">
                  What was it for? *
                </label>
                <input
                  id="exp-description"
                  data-autofocus
                  type="text"
                  maxLength={120}
                  value={form.description}
                  onChange={(e) => update({ description: e.target.value })}
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={errors.description ? 'exp-description-error' : undefined}
                  placeholder="e.g. Czech crystal beads, 5 packs"
                  className={input(Boolean(errors.description))}
                />
                {errors.description && (
                  <p id="exp-description-error" className="mt-1 text-xs text-[#B42318]">{errors.description}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="exp-amount" className="block text-xs font-bold mb-1">
                    Amount (₦) *
                  </label>
                  <input
                    id="exp-amount"
                    type="number"
                    inputMode="decimal"
                    min="1"
                    value={form.amount}
                    onChange={(e) => update({ amount: e.target.value })}
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={errors.amount ? 'exp-amount-error' : 'exp-amount-hint'}
                    placeholder="15000"
                    className={`${input(Boolean(errors.amount))} tabular-nums`}
                  />
                  {errors.amount ? (
                    <p id="exp-amount-error" className="mt-1 text-xs text-[#B42318]">{errors.amount}</p>
                  ) : (
                    <p id="exp-amount-hint" className="mt-1 text-xs text-[#4A5240]">
                      The full amount for the {form.period === 'day' ? 'day' : form.period === 'month' ? 'month' : 'year'}.
                    </p>
                  )}
                </div>
                <div>
                  <label htmlFor="exp-category" className="block text-xs font-bold mb-1">
                    Category
                  </label>
                  <select
                    id="exp-category"
                    value={form.category}
                    onChange={(e) => update({ category: e.target.value })}
                    className={input(false)}
                  >
                    {/* Keep a category that was renamed or removed since this expense was saved. */}
                    {!(EXPENSE_CATEGORIES as readonly string[]).includes(form.category) && (
                      <option value={form.category}>{form.category}</option>
                    )}
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <fieldset>
                <legend className="block text-xs font-bold mb-1">This cost covers</legend>
                <div className="grid grid-cols-3 rounded-xl border border-[#8C8270] bg-white overflow-hidden">
                  {(Object.keys(EXPENSE_PERIOD_LABELS) as ExpensePeriod[]).map((p) => {
                    const checked = form.period === p
                    return (
                      <label
                        key={p}
                        className={`min-h-[44px] px-2 flex items-center justify-center text-center text-sm font-semibold cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-[#E6C975] ${
                          checked ? 'bg-[#263E0F] text-white' : 'text-[#4A5240] hover:bg-[#F4EFE6]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="exp-period"
                          value={p}
                          checked={checked}
                          onChange={() => update({ period: p })}
                          className="sr-only"
                        />
                        {EXPENSE_PERIOD_LABELS[p]}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {form.period === 'day' && (
                <div>
                  <label htmlFor="exp-day" className="block text-xs font-bold mb-1">
                    Date *
                  </label>
                  <input
                    id="exp-day"
                    type="date"
                    value={form.day}
                    onChange={(e) => update({ day: e.target.value })}
                    aria-invalid={Boolean(errors.day)}
                    aria-describedby={errors.day ? 'exp-day-error' : undefined}
                    className={input(Boolean(errors.day))}
                  />
                  {errors.day && <p id="exp-day-error" className="mt-1 text-xs text-[#B42318]">{errors.day}</p>}
                </div>
              )}

              {form.period !== 'day' && (
                <div className="grid grid-cols-2 gap-3">
                  {form.period === 'month' && (
                    <div>
                      <label htmlFor="exp-month" className="block text-xs font-bold mb-1">
                        Month
                      </label>
                      <select
                        id="exp-month"
                        value={form.month}
                        onChange={(e) => update({ month: e.target.value })}
                        className={input(false)}
                      >
                        {MONTH_NAMES.map((name, i) => (
                          <option key={name} value={String(i + 1).padStart(2, '0')}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label htmlFor="exp-year" className="block text-xs font-bold mb-1">
                      Year
                    </label>
                    <select
                      id="exp-year"
                      value={form.year}
                      onChange={(e) => update({ year: e.target.value })}
                      className={input(false)}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {perDay > 0 && (
                <p className="text-xs text-[#4A5240] leading-relaxed bg-[#FAF8F4] border border-[#E2DACA] rounded-xl p-3">
                  Analytics will count about{' '}
                  <strong className="text-[#17210E] tabular-nums">{formatNaira(Math.round(perDay))}</strong>{' '}
                  per day of {expensePeriodLabel({ period: form.period, periodKey: periodKeyOf(form) })}.
                </p>
              )}

              {saveError && (
                <p role="alert" className="text-xs text-[#B42318] bg-red-50 border border-red-200 p-3 rounded-xl">
                  {saveError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[44px] px-6 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  <span>{saving ? 'Saving...' : form.id ? 'Save changes' : 'Record expense'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
