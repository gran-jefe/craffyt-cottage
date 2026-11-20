'use client'

import type { CostBook } from '@/lib/costs'
import React, { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { DAY_MS, expenseBounds, parseDateInput, startOfWatDay, toDateInput } from '@/lib/analytics'
import { buildBusinessReport, type ReportRange } from '@/lib/report'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import type { BespokeRequest, Catalog, Expense, Order, Product } from '@/types/store'

interface Props {
  orders: Order[]
  products: Product[]
  expenses: Expense[]
  bespoke: BespokeRequest[]
  catalog: Catalog | null
  costs: CostBook
}

type Preset = 'this_month' | 'last_month' | 'this_year' | 'last_year' | 'all' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_year', label: 'Last year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** First day of a month as "YYYY-MM-DD"; month may overflow either way (-1, 12). */
function monthStart(y: number, m: number): string {
  const d = new Date(Date.UTC(y, m, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`
}

function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`
}

/** Nigeria-time window for a preset. Ranges that include today stop at the end of today. */
function resolve(
  preset: Preset,
  now: number,
  earliest: number | null,
  from?: string,
  to?: string
): ReportRange | { error: string } {
  const today = toDateInput(now)
  const [y, m] = today.split('-').map(Number)
  const tomorrow = startOfWatDay(now) + DAY_MS
  const at = (ymd: string) => parseDateInput(ymd)!

  switch (preset) {
    case 'this_month':
      return { start: at(monthStart(y, m - 1)), end: tomorrow, label: `${MONTHS[m - 1]} ${y} (to date)` }
    case 'last_month': {
      const start = monthStart(y, m - 2)
      const [ly, lm] = start.split('-').map(Number)
      return { start: at(start), end: at(monthStart(y, m - 1)), label: `${MONTHS[lm - 1]} ${ly}` }
    }
    case 'this_year':
      return { start: at(`${y}-01-01`), end: tomorrow, label: `${y} (to date)` }
    case 'last_year':
      return { start: at(`${y - 1}-01-01`), end: at(`${y}-01-01`), label: String(y - 1) }
    case 'all': {
      const start = earliest !== null ? Math.min(startOfWatDay(earliest), startOfWatDay(now)) : startOfWatDay(now)
      return { start, end: tomorrow, label: 'All time' }
    }
    case 'custom': {
      const a = parseDateInput(from)
      const b = parseDateInput(to)
      if (a === null || b === null) return { error: 'Choose both a start and an end date.' }
      if (b < a) return { error: 'The end date is before the start date.' }
      if (a > startOfWatDay(now)) return { error: 'The start date is in the future.' }
      return { start: a, end: b + DAY_MS, label: `${dayLabel(from!)} to ${dayLabel(to!)}` }
    }
  }
}

export function AdminReports({ orders, products, expenses, bespoke, catalog, costs }: Props) {
  const { showToast } = useCart()
  const now = useMemo(() => Date.now(), [orders, products, expenses, bespoke])
  const today = toDateInput(now)
  const [preset, setPreset] = useState<Preset>('this_month')
  const [from, setFrom] = useState(monthStart(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1))
  const [to, setTo] = useState(today)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  // "All time" starts at the first recorded order, expense or custom request.
  const earliest = useMemo(() => {
    const times = [
      ...orders.map((o) => Date.parse(o.createdAt)),
      ...bespoke.map((b) => Date.parse(b.createdAt)),
      ...expenses.map((e) => expenseBounds(e)?.start ?? NaN),
    ].filter((t) => Number.isFinite(t) && t <= now)
    return times.length > 0 ? Math.min(...times) : null
  }, [orders, bespoke, expenses, now])

  const resolved = resolve(preset, now, earliest, from, to)
  const range = 'error' in resolved ? null : resolved
  const rangeError = 'error' in resolved ? resolved.error : ''

  const report = useMemo(
    () => (range ? buildBusinessReport({ orders, products, expenses, bespoke, catalog, costs, generatedAt: now }, range) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, products, expenses, bespoke, catalog, costs, now, range?.start, range?.end, range?.label]
  )

  async function handleDownload() {
    if (!range) return
    setError('')
    setGenerating(true)
    try {
      // Fresh timestamp so "Generated" and the stock snapshot reflect the moment of download.
      const fresh = buildBusinessReport({ orders, products, expenses, bespoke, catalog, costs, generatedAt: Date.now() }, range)
      const [{ default: ExcelJS }, { buildWorkbook, downloadBuffer }] = await Promise.all([
        import('exceljs'),
        import('@/lib/reportWorkbook'),
      ])
      const buffer = await buildWorkbook(ExcelJS, fresh)
      downloadBuffer(buffer, fresh.fileName)
      showToast(`Report for ${range.label} downloaded.`)
    } catch (err) {
      console.error(err)
      setError('The report could not be created. Check your connection (the spreadsheet tool loads on first use) and try again.')
    } finally {
      setGenerating(false)
    }
  }

  const s = report?.summary
  const dateInput = (invalid: boolean) =>
    `min-h-[44px] px-3 rounded-xl border bg-white text-sm ${invalid ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#8C8270]'}`

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">Business report</h2>
        <p className="text-xs text-[#3F4F4C] leading-relaxed max-w-2xl">
          One spreadsheet with every order, sale, expense, custom request and today&apos;s stock for the period you
          choose. Ready for your accountant, bank or records.
        </p>
      </div>

      <section aria-labelledby="report-period" className="bg-white rounded-2xl border border-[#E2DACA] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label id="report-period" htmlFor="report-preset" className="block text-xs font-bold text-[#0F1F1D] mb-1">
              Period
            </label>
            <select
              id="report-preset"
              value={preset}
              onChange={(e) => {
                setPreset(e.target.value as Preset)
                setError('')
              }}
              className="min-h-[44px] pl-3 pr-8 rounded-xl border border-[#8C8270] bg-white text-sm font-semibold text-[#0F1F1D]"
            >
              {PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {preset === 'custom' && (
            <>
              <div>
                <label htmlFor="report-from" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                  From
                </label>
                <input
                  id="report-from"
                  type="date"
                  max={today}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-invalid={Boolean(rangeError)}
                  aria-describedby={rangeError ? 'report-range-error' : undefined}
                  className={dateInput(Boolean(rangeError))}
                />
              </div>
              <div>
                <label htmlFor="report-to" className="block text-xs font-bold text-[#0F1F1D] mb-1">
                  To
                </label>
                <input
                  id="report-to"
                  type="date"
                  max={today}
                  min={from || undefined}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  aria-invalid={Boolean(rangeError)}
                  aria-describedby={rangeError ? 'report-range-error' : undefined}
                  className={dateInput(Boolean(rangeError))}
                />
              </div>
            </>
          )}
        </div>

        {rangeError && (
          <p id="report-range-error" role="alert" className="flex items-center gap-1.5 text-xs text-[#B42318]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            {rangeError}
          </p>
        )}

        {report && s && (
          <>
            <div>
              <p className="text-xs font-semibold text-[#3F4F4C]">
                {report.range.label} · {dayLabel(toDateInput(report.range.start))} to{' '}
                {dayLabel(toDateInput(report.range.end - 1))}, Nigeria time
              </p>
              <dl className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-px rounded-xl border border-[#E2DACA] bg-[#E2DACA] overflow-hidden">
                {[
                  ['Orders placed', s.ordersPlaced.toLocaleString('en-NG')],
                  ['Verified sales', formatNaira(Math.round(s.sales))],
                  ['Cost of pieces + expenses', formatNaira(Math.round(s.costOfGoods + s.expenses))],
                  [s.profit < 0 ? 'Loss' : 'Profit', formatNaira(Math.round(s.profit))],
                ].map(([label, value]) => (
                  <div key={label} className="bg-white p-4">
                    <dt className="text-xs font-semibold text-[#3F4F4C]">{label}</dt>
                    <dd className="mt-0.5 text-xl font-bold text-[#0F1F1D] tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {s.empty ? (
              <p className="flex items-start gap-2 text-sm text-[#3F4F4C] bg-[#FAF8F4] border border-[#E2DACA] rounded-xl p-3 leading-relaxed">
                <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5 text-[#0B3D3A]" aria-hidden="true" />
                Nothing was recorded in this period. You can still download the report: it will include today&apos;s
                stock and show the period as empty, which is a valid record too.
              </p>
            ) : (
              <p className="flex items-start gap-2 text-sm text-[#3F4F4C] leading-relaxed">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#146C43]" aria-hidden="true" />
                Includes {report.sheets.length} sheets: {report.sheets.map((sh) => sh.name).join(', ')}.
              </p>
            )}
          </>
        )}

        {error && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-[#7A1B14]">
            <span className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              {error}
            </span>
            <button
              type="button"
              onClick={handleDownload}
              disabled={generating}
              className="min-h-[44px] px-4 rounded-xl border border-[#B42318] text-[#B42318] hover:bg-red-100 text-xs font-bold disabled:opacity-60"
            >
              Try again
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleDownload}
          disabled={!range || generating}
          className="w-full sm:w-auto min-h-[48px] px-6 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] active:bg-[#021817] text-white text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {generating ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="w-4 h-4 text-[#E6C975]" aria-hidden="true" />
          )}
          <span>{generating ? 'Preparing report...' : 'Download report (.xlsx)'}</span>
        </button>
      </section>

      <p className="text-xs text-[#3F4F4C] leading-relaxed max-w-3xl">
        Sales count an order once its payment is verified, and include delivery fees. Pending and cancelled orders are
        listed but not counted. Monthly and yearly expenses are spread evenly over their days. The inventory sheet shows
        stock at the moment you download.
      </p>
    </div>
  )
}
