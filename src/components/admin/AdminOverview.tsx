'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, LineChart, RotateCcw } from 'lucide-react'
import {
  computeAttention,
  computeDashboard,
  DEFAULT_FILTERS,
  formatAge,
  parseDateInput,
  PERIOD_LABELS,
  toDateInput,
  type ChannelFilter,
  type DashboardFilters,
  type PeriodPreset,
} from '@/lib/analytics'
import { formatNaira } from '@/lib/defaults'
import type { BespokeRequest, BespokeStatus, Order, OrderStatus, Product } from '@/types/store'
import { BarList, type BarListRow } from './analytics/BarList'
import { ChartCard } from './analytics/ChartCard'
import { SalesChart, SalesTable } from './analytics/SalesChart'
import { StatTile } from './analytics/StatTile'
import type { SeriesKey } from './analytics/chartTheme'

export type OverviewNavigate = (
  tab: 'orders' | 'inventory' | 'bespoke',
  options?: { orderStatus?: OrderStatus }
) => void

interface Props {
  orders: Order[]
  products: Product[]
  bespoke: BespokeRequest[]
  /** True while a background refresh runs: keep the frame, dim it, never flash a skeleton. */
  refreshing: boolean
  onNavigate: OverviewNavigate
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_verification: 'Pending verification',
  payment_confirmed: 'Payment confirmed',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const BESPOKE_LABELS: Record<BespokeStatus, string> = {
  new: 'New',
  quoted: 'Quoted',
  in_progress: 'In progress',
  completed: 'Completed',
}

const CHANNEL_OPTIONS: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'All sales' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
]

/* ---------- Filter persistence (per browser, 30-day expiry, never required) ---------- */

const FILTERS_KEY = 'cc_admin_dashboard_filters_v1'
const FILTERS_TTL_MS = 30 * 24 * 60 * 60 * 1000

function loadSavedFilters(): DashboardFilters {
  if (typeof window === 'undefined') return DEFAULT_FILTERS
  try {
    const raw = window.localStorage.getItem(FILTERS_KEY)
    if (!raw) return DEFAULT_FILTERS
    const saved = JSON.parse(raw) as { filters?: Partial<DashboardFilters>; savedAt?: number }
    if (!saved.savedAt || Date.now() - saved.savedAt > FILTERS_TTL_MS || !saved.filters) {
      window.localStorage.removeItem(FILTERS_KEY)
      return DEFAULT_FILTERS
    }
    const f = saved.filters
    const preset = f.preset && f.preset in PERIOD_LABELS ? f.preset : DEFAULT_FILTERS.preset
    const channel = CHANNEL_OPTIONS.some((o) => o.value === f.channel) ? f.channel! : DEFAULT_FILTERS.channel
    return {
      preset,
      channel,
      customFrom: parseDateInput(f.customFrom) !== null ? f.customFrom : undefined,
      customTo: parseDateInput(f.customTo) !== null ? f.customTo : undefined,
    }
  } catch {
    return DEFAULT_FILTERS
  }
}

function saveFilters(filters: DashboardFilters) {
  try {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify({ filters, savedAt: Date.now() }))
  } catch {
    // Storage unavailable (private mode, quota): filters simply won't be remembered.
  }
}

/* ---------- Component ---------- */

export function AdminOverview({ orders, products, bespoke, refreshing, onNavigate }: Props) {
  const [filters, setFilters] = useState<DashboardFilters>(loadSavedFilters)

  useEffect(() => {
    saveFilters(filters)
  }, [filters])

  // "Now" moves forward whenever fresh data arrives, so today's sales land in today's bucket.
  const now = useMemo(() => Date.now(), [orders, products, bespoke])

  const attention = useMemo(() => computeAttention(orders, products, bespoke, now), [orders, products, bespoke, now])
  const data = useMemo(
    () => computeDashboard(orders, products, bespoke, filters, now),
    [orders, products, bespoke, filters, now]
  )

  const series: SeriesKey[] =
    filters.channel === 'online' ? ['online'] : filters.channel === 'offline' ? ['offline'] : ['online', 'offline']
  const isDefault =
    filters.preset === DEFAULT_FILTERS.preset && filters.channel === DEFAULT_FILTERS.channel
  const today = toDateInput(now)
  const customInvalid =
    filters.preset === 'custom' &&
    Boolean(filters.customFrom && filters.customTo) &&
    filters.customFrom! > filters.customTo!

  function update(patch: Partial<DashboardFilters>) {
    setFilters((f) => {
      const next = { ...f, ...patch }
      // Entering custom: seed it with the range currently on screen, so nothing jumps.
      if (patch.preset === 'custom' && f.preset !== 'custom' && !f.customFrom && !f.customTo) {
        next.customFrom = toDateInput(data.range.start)
        next.customTo = toDateInput(data.range.end - 1)
      }
      return next
    })
  }

  /* ----- derived rows ----- */
  const productRows: BarListRow[] = data.topProducts.map((p) => ({
    key: p.key,
    label: p.name,
    value: p.revenue,
    valueLabel: formatNaira(p.revenue),
    detail: `${p.units} sold`,
  }))
  if (data.otherProducts) {
    productRows.push({
      key: 'other',
      label: `Other (${data.otherProducts.count} products)`,
      value: data.otherProducts.revenue,
      valueLabel: formatNaira(data.otherProducts.revenue),
      detail: `${data.otherProducts.units} sold`,
      muted: true,
    })
  }

  const pipelineRows: BarListRow[] = data.pipeline.map((p) => ({
    key: p.status,
    label: STATUS_LABELS[p.status],
    value: p.count,
    valueLabel: String(p.count),
    detail: data.ordersPlaced > 0 ? `${Math.round((p.count / data.ordersPlaced) * 100)}%` : undefined,
  }))
  const cancelled = data.pipeline.find((p) => p.status === 'cancelled')?.count ?? 0

  const sourceRows: BarListRow[] = data.salesBySource.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.value,
    valueLabel: formatNaira(s.value),
    detail: `${s.orders} ${s.orders === 1 ? 'order' : 'orders'}`,
  }))

  const bespokeRows: BarListRow[] = (Object.keys(BESPOKE_LABELS) as BespokeStatus[]).map((st) => ({
    key: st,
    label: BESPOKE_LABELS[st],
    value: data.bespoke.byStatus[st],
    valueLabel: String(data.bespoke.byStatus[st]),
  }))

  const hasAnyOrders = orders.length > 0
  const hasSales = data.sales.value > 0

  return (
    <div className="space-y-8">
      <AttentionStrip attention={attention} onNavigate={onNavigate} />

      <section aria-labelledby="analytics-heading" className="space-y-5">
        <div>
          <h2 id="analytics-heading" className="font-serif-display text-2xl font-bold text-[#17210E]">
            Sales analytics
          </h2>
          <p className="text-xs text-[#4A5240]">
            {data.range.rangeLabel} · Nigeria time
          </p>
        </div>

        {/* Filters: one row, above everything they scope */}
        <div role="group" aria-label="Dashboard filters" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="dash-period" className="block text-xs font-bold text-[#17210E] mb-1">
              Period
            </label>
            <select
              id="dash-period"
              value={filters.preset}
              onChange={(e) => update({ preset: e.target.value as PeriodPreset })}
              className="min-h-[44px] pl-3 pr-8 rounded-xl border border-[#8C8270] bg-white text-sm font-semibold text-[#17210E]"
            >
              {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {filters.preset === 'custom' && (
            <>
              <div>
                <label htmlFor="dash-from" className="block text-xs font-bold text-[#17210E] mb-1">
                  From
                </label>
                <input
                  id="dash-from"
                  type="date"
                  max={today}
                  value={filters.customFrom ?? ''}
                  onChange={(e) => update({ customFrom: e.target.value || undefined })}
                  aria-invalid={customInvalid}
                  aria-describedby={customInvalid ? 'dash-range-error' : undefined}
                  className={`min-h-[44px] px-3 rounded-xl border bg-white text-sm ${customInvalid ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#8C8270]'}`}
                />
              </div>
              <div>
                <label htmlFor="dash-to" className="block text-xs font-bold text-[#17210E] mb-1">
                  To
                </label>
                <input
                  id="dash-to"
                  type="date"
                  max={today}
                  min={filters.customFrom}
                  value={filters.customTo ?? ''}
                  onChange={(e) => update({ customTo: e.target.value || undefined })}
                  aria-invalid={customInvalid}
                  aria-describedby={customInvalid ? 'dash-range-error' : undefined}
                  className={`min-h-[44px] px-3 rounded-xl border bg-white text-sm ${customInvalid ? 'border-[#B42318] ring-1 ring-[#B42318]' : 'border-[#8C8270]'}`}
                />
              </div>
            </>
          )}

          <fieldset>
            <legend className="block text-xs font-bold text-[#17210E] mb-1">Channel</legend>
            <div className="inline-flex rounded-xl border border-[#8C8270] bg-white overflow-hidden">
              {CHANNEL_OPTIONS.map((o) => {
                const checked = filters.channel === o.value
                return (
                  <label
                    key={o.value}
                    className={`min-h-[44px] px-4 inline-flex items-center text-sm font-semibold cursor-pointer transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-4 has-[:focus-visible]:outline-[#E6C975] ${
                      checked ? 'bg-[#263E0F] text-white' : 'text-[#4A5240] hover:bg-[#F4EFE6] hover:text-[#17210E]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="dash-channel"
                      value={o.value}
                      checked={checked}
                      onChange={() => update({ channel: o.value })}
                      className="sr-only"
                    />
                    {o.label}
                  </label>
                )
              })}
            </div>
          </fieldset>

          {!isDefault && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="min-h-[44px] px-3 rounded-xl text-xs font-bold text-[#4A5240] hover:text-[#17210E] hover:bg-[#F4EFE6] inline-flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset filters</span>
            </button>
          )}
        </div>

        {customInvalid && (
          <p id="dash-range-error" role="alert" className="flex items-center gap-1.5 text-xs text-[#B42318]">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            The end date is before the start date, so the two have been swapped for the figures below.
          </p>
        )}

        <div
          aria-busy={refreshing}
          className={`space-y-5 transition-opacity duration-150 ${refreshing ? 'opacity-60' : ''}`}
        >
          {!hasAnyOrders ? (
            <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-3">
              <LineChart className="w-8 h-8 mx-auto text-[#4A5240]" aria-hidden="true" />
              <p className="font-serif-display text-lg font-bold text-[#17210E]">No sales to analyse yet</p>
              <p className="text-sm text-[#4A5240] max-w-md mx-auto leading-relaxed">
                Once a customer checks out or you record an offline sale, your sales, best sellers and trends
                will show up here.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('orders')}
                className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold transition-colors"
              >
                Go to orders
              </button>
            </div>
          ) : (
            <>
              {/* KPI row: one surface, hairline dividers (no card-per-number) */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-px rounded-2xl border border-[#E2DACA] bg-[#E2DACA] overflow-hidden">
                <StatTile label="Verified sales" metric={data.sales} format={formatNaira} compareLabel={data.range.compareLabel} />
                <StatTile
                  label="Paid orders"
                  metric={data.paidOrders}
                  format={(v) => v.toLocaleString('en-NG')}
                  compareLabel={data.range.compareLabel}
                />
                <StatTile
                  label="Average order value"
                  metric={data.averageOrderValue}
                  format={(v) => formatNaira(Math.round(v))}
                  compareLabel={data.range.compareLabel}
                />
                <StatTile
                  label="Items sold"
                  metric={data.itemsSold}
                  format={(v) => v.toLocaleString('en-NG')}
                  compareLabel={data.range.compareLabel}
                />
              </div>

              <ChartCard
                title="Sales over time"
                subtitle={`Verified sales per ${data.range.granularity}, delivery fees included.`}
                table={hasSales ? <SalesTable buckets={data.buckets} series={series} /> : undefined}
              >
                {hasSales ? (
                  <SalesChart
                    buckets={data.buckets}
                    series={series}
                    granularity={data.range.granularity}
                    totals={series.length > 1 ? data.salesByChannel : undefined}
                  />
                ) : (
                  <div className="py-10 text-center space-y-3">
                    <p className="text-sm font-semibold text-[#17210E]">No verified sales in this period</p>
                    <p className="text-sm text-[#4A5240]">
                      {attention.pendingCount > 0
                        ? `${attention.pendingCount} ${attention.pendingCount === 1 ? 'order is' : 'orders are'} waiting for payment verification.`
                        : 'Try a longer period, or check the channel filter.'}
                    </p>
                    {filters.preset !== 'all' && (
                      <button
                        type="button"
                        onClick={() => update({ preset: 'all' })}
                        className="min-h-[44px] px-4 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold transition-colors"
                      >
                        Show all time
                      </button>
                    )}
                  </div>
                )}
              </ChartCard>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <ChartCard title="Top products" subtitle="Product revenue from paid orders, excluding delivery.">
                  <BarList rows={productRows} label="Top products by revenue" emptyText="No products sold in this period." />
                </ChartCard>

                <ChartCard
                  title="Order pipeline"
                  subtitle="Orders placed in this period, by their current status."
                  aside={
                    data.ordersPlaced > 0 ? (
                      <span className="block text-xs text-[#4A5240] sm:text-right">
                        <span className="block font-semibold text-[#17210E] tabular-nums">{data.ordersPlaced} placed</span>
                        {Math.round((cancelled / data.ordersPlaced) * 100)}% cancelled
                      </span>
                    ) : undefined
                  }
                >
                  <BarList
                    rows={pipelineRows}
                    label="Orders by status"
                    max={data.ordersPlaced}
                    emptyText="No orders placed in this period."
                  />
                </ChartCard>

                <ChartCard
                  title="Sales by zone or source"
                  subtitle="Delivery zone for online orders, sale source for offline ones."
                >
                  <BarList rows={sourceRows} label="Sales by delivery zone or source" emptyText="No verified sales in this period." />
                </ChartCard>

                <ChartCard
                  title="Custom bag requests"
                  subtitle="Requests received in this period. The channel filter doesn't apply."
                  aside={
                    data.bespoke.openValue > 0 ? (
                      <span className="block text-xs text-[#4A5240] sm:text-right">
                        <span className="block font-semibold text-[#17210E] tabular-nums">
                          {formatNaira(data.bespoke.openValue)}
                        </span>
                        estimated, still open
                      </span>
                    ) : undefined
                  }
                >
                  <BarList
                    rows={bespokeRows}
                    label="Custom bag requests by status"
                    max={data.bespoke.total}
                    emptyText="No custom bag requests in this period."
                  />
                </ChartCard>
              </div>

              <p className="text-xs text-[#4A5240] leading-relaxed max-w-3xl">
                Sales count an order once its payment is verified (Payment confirmed through Delivered) and include
                delivery fees. Pending and cancelled orders are left out. Offline sales are dated by their sale date.
                Days run midnight to midnight, Nigeria time.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/* ---------- Needs attention: current state, not filtered by period ---------- */

function AttentionStrip({
  attention,
  onNavigate,
}: {
  attention: ReturnType<typeof computeAttention>
  onNavigate: OverviewNavigate
}) {
  const lowStockPreview = attention.lowStock
    .slice(0, 3)
    .map((p) => `${p.name} (${p.stock <= 0 ? 'sold out' : `${p.stock} left`})`)
    .join(', ')
  const moreLowStock = attention.lowStock.length - 3

  return (
    <section aria-labelledby="attention-heading" className="space-y-3">
      <h2 id="attention-heading" className="font-serif-display text-2xl font-bold text-[#17210E]">
        Needs attention
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px rounded-2xl border border-[#E2DACA] bg-[#E2DACA] overflow-hidden">
        <AttentionItem
          label="Receipts to verify"
          count={attention.pendingCount}
          detail={
            attention.pendingCount > 0
              ? `${formatNaira(attention.pendingValue)} waiting${attention.oldestPendingAgeMs !== null ? ` · oldest ${formatAge(attention.oldestPendingAgeMs)}` : ''}`
              : 'Every payment has been checked.'
          }
          action={
            attention.pendingCount > 0
              ? { label: 'Review receipts', onClick: () => onNavigate('orders', { orderStatus: 'pending_verification' }) }
              : undefined
          }
        />
        <AttentionItem
          label="Low or sold-out stock"
          count={attention.lowStock.length}
          detail={
            attention.lowStock.length > 0
              ? `${lowStockPreview}${moreLowStock > 0 ? `, and ${moreLowStock} more` : ''}`
              : 'Every visible piece has 3 or more in stock.'
          }
          action={
            attention.lowStock.length > 0 ? { label: 'Open inventory', onClick: () => onNavigate('inventory') } : undefined
          }
        />
        <AttentionItem
          label="New custom requests"
          count={attention.newBespokeCount}
          detail={
            attention.newBespokeCount > 0 ? 'Waiting for a reply or quote.' : 'No requests waiting for a reply.'
          }
          action={
            attention.newBespokeCount > 0 ? { label: 'View requests', onClick: () => onNavigate('bespoke') } : undefined
          }
        />
      </div>
    </section>
  )
}

function AttentionItem({
  label,
  count,
  detail,
  action,
}: {
  label: string
  count: number
  detail: string
  action?: { label: string; onClick: () => void }
}) {
  const needsAction = count > 0
  return (
    <div className="bg-white p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {needsAction ? (
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-[#B45309]" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5 text-[#146C43]" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[#4A5240]">{label}</p>
          <p className="text-2xl font-bold text-[#17210E]">
            {count}
            <span className="sr-only">{needsAction ? ', needs attention' : ', all clear'}</span>
          </p>
          <p className="text-xs text-[#4A5240] leading-relaxed">{detail}</p>
        </div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-auto self-start min-h-[44px] px-4 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
