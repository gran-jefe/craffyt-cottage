/**
 * Pure analytics for the admin dashboard. No Firebase, no React: everything here is a
 * function of (orders, products, requests, filters, now) so it can be tested directly.
 *
 * Definitions (also explained in the UI):
 * - Dates are bucketed in Nigeria time (WAT, UTC+1, no daylight saving), so "today" means the
 *   owner's today, whatever the device clock's zone.
 * - An order counts toward sales once payment is verified: any status from Payment confirmed to
 *   Delivered. Pending and cancelled orders never count as sales.
 * - Sales are order totals, delivery fees included. Product revenue (top products) is
 *   price × quantity only.
 * - Offline sales are dated by their sale date (stored as createdAt).
 */
import type { BespokeRequest, BespokeStatus, Order, OrderStatus, Product } from '@/types/store'

export const DAY_MS = 24 * 60 * 60 * 1000
const WAT_OFFSET_MS = 60 * 60 * 1000 // Africa/Lagos is UTC+1 all year

export const PAID_STATUSES: OrderStatus[] = ['payment_confirmed', 'processing', 'dispatched', 'delivered']

export type PeriodPreset =
  | '7d'
  | '30d'
  | '90d'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'all'
  | 'custom'

export type ChannelFilter = 'all' | 'online' | 'offline'

export interface DashboardFilters {
  preset: PeriodPreset
  channel: ChannelFilter
  /** Inclusive YYYY-MM-DD dates (Nigeria time), used when preset is 'custom'. */
  customFrom?: string
  customTo?: string
}

export const DEFAULT_FILTERS: DashboardFilters = { preset: '30d', channel: 'all' }

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_year: 'This year',
  all: 'All time',
  custom: 'Custom range',
}

export type Granularity = 'day' | 'week' | 'month'

export interface ResolvedRange {
  /** Inclusive start, ms (midnight WAT). */
  start: number
  /** Exclusive end, ms (midnight WAT after the last included day). */
  end: number
  /** The comparison window, when the period has a meaningful one. */
  prevStart: number | null
  prevEnd: number | null
  granularity: Granularity
  /** e.g. "16 Oct – 14 Nov 2026" */
  rangeLabel: string
  /** e.g. "vs previous 30 days" (null when there is no comparison) */
  compareLabel: string | null
}

/* ---------- Nigeria-time calendar helpers ---------- */

interface CalendarDay {
  y: number
  m: number // 0-based
  d: number
}

function watParts(ms: number): CalendarDay & { dow: number } {
  const t = new Date(ms + WAT_OFFSET_MS)
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay() }
}

/** Midnight WAT of a calendar day, as a UTC ms timestamp. Month/day overflow is normalised. */
function watMidnight(y: number, m: number, d: number): number {
  return Date.UTC(y, m, d) - WAT_OFFSET_MS
}

export function startOfWatDay(ms: number): number {
  const p = watParts(ms)
  return watMidnight(p.y, p.m, p.d)
}

/** Parses an inclusive YYYY-MM-DD as midnight WAT; null when malformed. */
export function parseDateInput(value: string | undefined): number | null {
  if (!value) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const ms = watMidnight(y, mo, d)
  const back = watParts(ms)
  return back.y === y && back.m === mo && back.d === d ? ms : null
}

/** Formats a ms timestamp as YYYY-MM-DD in Nigeria time (for date inputs). */
export function toDateInput(ms: number): string {
  const p = watParts(ms)
  return `${p.y}-${String(p.m + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function dayLabel(ms: number, withYear = false): string {
  const p = watParts(ms)
  return `${p.d} ${MONTHS[p.m]}${withYear ? ` ${p.y}` : ''}`
}

function formatRangeLabel(start: number, endExclusive: number): string {
  const last = endExclusive - DAY_MS
  const a = watParts(start)
  const b = watParts(last)
  if (start >= last) return dayLabel(start, true)
  if (a.y === b.y) return `${dayLabel(start)} – ${dayLabel(last, true)}`
  return `${dayLabel(start, true)} – ${dayLabel(last, true)}`
}

function granularityFor(start: number, end: number): Granularity {
  const days = Math.round((end - start) / DAY_MS)
  if (days <= 31) return 'day'
  if (days <= 183) return 'week'
  return 'month'
}

/* ---------- Range resolution ---------- */

/**
 * Turns the filter selection into concrete time windows.
 * `earliest` is the first order's timestamp (used by "All time").
 */
export function resolveRange(filters: DashboardFilters, now: number, earliest: number | null): ResolvedRange {
  const today = startOfWatDay(now)
  const tomorrow = today + DAY_MS
  const p = watParts(now)

  let start: number
  let end = tomorrow
  let prevStart: number | null = null
  let prevEnd: number | null = null
  let compareLabel: string | null = null

  const rolling = (days: number) => {
    start = tomorrow - days * DAY_MS
    prevEnd = start
    prevStart = start - days * DAY_MS
    compareLabel = `vs previous ${days} days`
  }

  switch (filters.preset) {
    case '7d':
      rolling(7)
      break
    case '30d':
      rolling(30)
      break
    case '90d':
      rolling(90)
      break
    case 'this_month': {
      start = watMidnight(p.y, p.m, 1)
      prevStart = watMidnight(p.y, p.m - 1, 1)
      // Same number of days into last month, never running past its end.
      prevEnd = Math.min(prevStart + (end - start), start)
      compareLabel = 'vs same days last month'
      break
    }
    case 'last_month': {
      start = watMidnight(p.y, p.m - 1, 1)
      end = watMidnight(p.y, p.m, 1)
      prevStart = watMidnight(p.y, p.m - 2, 1)
      prevEnd = start
      compareLabel = 'vs the month before'
      break
    }
    case 'this_year': {
      start = watMidnight(p.y, 0, 1)
      prevStart = watMidnight(p.y - 1, 0, 1)
      prevEnd = Math.min(prevStart + (end - start), start)
      compareLabel = 'vs same period last year'
      break
    }
    case 'all': {
      start = earliest !== null ? Math.min(startOfWatDay(earliest), today) : today
      break
    }
    case 'custom': {
      let from = parseDateInput(filters.customFrom)
      let to = parseDateInput(filters.customTo)
      if (from === null && to === null) {
        // Nothing usable yet: behave like the last 30 days rather than showing nothing.
        rolling(30)
        break
      }
      if (from === null) from = to!
      if (to === null) to = from
      if (from > to) [from, to] = [to, from]
      start = from
      end = to + DAY_MS
      const days = Math.round((end - start) / DAY_MS)
      prevEnd = start
      prevStart = start - days * DAY_MS
      compareLabel = `vs previous ${days} ${days === 1 ? 'day' : 'days'}`
      break
    }
  }

  return {
    start: start!,
    end,
    prevStart,
    prevEnd,
    granularity: granularityFor(start!, end),
    rangeLabel: formatRangeLabel(start!, end),
    compareLabel,
  }
}

/* ---------- Buckets ---------- */

function bucketStartOf(ms: number, g: Granularity): number {
  const p = watParts(ms)
  if (g === 'day') return watMidnight(p.y, p.m, p.d)
  if (g === 'week') {
    const sinceMonday = (p.dow + 6) % 7
    return watMidnight(p.y, p.m, p.d - sinceMonday)
  }
  return watMidnight(p.y, p.m, 1)
}

function nextBucket(start: number, g: Granularity): number {
  const p = watParts(start)
  if (g === 'day') return watMidnight(p.y, p.m, p.d + 1)
  if (g === 'week') return watMidnight(p.y, p.m, p.d + 7)
  return watMidnight(p.y, p.m + 1, 1)
}

export interface SalesBucket {
  start: number
  /** Short axis label: "12 Nov", "10 Nov" (week of), "Nov". */
  label: string
  /** Full label for tooltips and the table: "Wed 12 Nov 2026", "Week of 10 Nov 2026", "November 2026". */
  longLabel: string
  online: number
  offline: number
  total: number
  orders: number
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Edge buckets are clipped to the range (a 30-day window rarely starts on a Monday or the 1st),
 * so their long label names exactly the days they cover instead of claiming a whole week/month.
 */
function bucketLabels(
  start: number,
  next: number,
  g: Granularity,
  range: { start: number; end: number },
  spansYears: boolean
): { label: string; longLabel: string } {
  const p = watParts(start)
  if (g === 'day') {
    return { label: dayLabel(start), longLabel: `${WEEKDAYS[p.dow]} ${dayLabel(start, true)}` }
  }
  const from = Math.max(start, range.start)
  const toExclusive = Math.min(next, range.end)
  const clipped = from !== start || toExclusive !== next
  if (g === 'week') {
    return {
      label: dayLabel(from),
      longLabel: clipped ? formatRangeLabel(from, toExclusive) : `Week of ${dayLabel(start, true)}`,
    }
  }
  return {
    label: spansYears ? `${MONTHS[p.m]} ’${String(p.y).slice(2)}` : MONTHS[p.m],
    longLabel: clipped ? formatRangeLabel(from, toExclusive) : `${MONTHS_LONG[p.m]} ${p.y}`,
  }
}

/* ---------- Order helpers ---------- */

export function channelOf(order: Pick<Order, 'channel'>): 'online' | 'offline' {
  return order.channel === 'offline' ? 'offline' : 'online'
}

export function isPaid(order: Pick<Order, 'status'>): boolean {
  return PAID_STATUSES.includes(order.status)
}

function orderTime(order: Pick<Order, 'createdAt'>): number {
  const t = Date.parse(order.createdAt)
  return Number.isFinite(t) ? t : NaN
}

function inWindow(t: number, start: number, end: number): boolean {
  return t >= start && t < end
}

function matchesChannel(order: Order, channel: ChannelFilter): boolean {
  return channel === 'all' || channelOf(order) === channel
}

/* ---------- Dashboard computation ---------- */

export interface Metric {
  value: number
  /** Previous-period value, or null when the period has no comparison. */
  previous: number | null
}

export interface ProductRow {
  key: string
  name: string
  units: number
  revenue: number
}

export interface BreakdownRow {
  key: string
  label: string
  value: number
  orders: number
}

export interface PipelineRow {
  status: OrderStatus
  count: number
}

export interface BespokeSummary {
  total: number
  byStatus: Record<BespokeStatus, number>
  /** Estimated value of requests still open (new, quoted, in progress). */
  openValue: number
}

export interface DashboardData {
  range: ResolvedRange
  sales: Metric
  paidOrders: Metric
  averageOrderValue: Metric
  itemsSold: Metric
  salesByChannel: { online: number; offline: number }
  buckets: SalesBucket[]
  topProducts: ProductRow[]
  /** Revenue of products folded out of topProducts (null when nothing was folded). */
  otherProducts: { count: number; units: number; revenue: number } | null
  salesBySource: BreakdownRow[]
  pipeline: PipelineRow[]
  ordersPlaced: number
  bespoke: BespokeSummary
}

const PIPELINE_ORDER: OrderStatus[] = [
  'pending_verification',
  'payment_confirmed',
  'processing',
  'dispatched',
  'delivered',
  'cancelled',
]

function summarise(orders: Order[]) {
  let sales = 0
  let count = 0
  let units = 0
  for (const o of orders) {
    sales += Number(o.total) || 0
    count += 1
    for (const i of o.items) units += Number(i.quantity) || 0
  }
  return { sales, count, units, aov: count > 0 ? sales / count : 0 }
}

export function computeDashboard(
  orders: Order[],
  products: Product[],
  bespoke: BespokeRequest[],
  filters: DashboardFilters,
  now: number,
  options: { topProductLimit?: number } = {}
): DashboardData {
  const topLimit = options.topProductLimit ?? 5
  const times = orders.map(orderTime).filter((t) => Number.isFinite(t))
  const earliest = times.length > 0 ? Math.min(...times) : null
  const range = resolveRange(filters, now, earliest)

  const scoped = orders.filter((o) => matchesChannel(o, filters.channel))
  const placedInRange = scoped.filter((o) => inWindow(orderTime(o), range.start, range.end))
  const paidInRange = placedInRange.filter(isPaid)
  const cur = summarise(paidInRange)

  let prev: ReturnType<typeof summarise> | null = null
  if (range.prevStart !== null && range.prevEnd !== null) {
    const ps = range.prevStart
    const pe = range.prevEnd
    prev = summarise(scoped.filter((o) => isPaid(o) && inWindow(orderTime(o), ps, pe)))
  }

  // Time series, with empty buckets filled so gaps read as zero, not as missing.
  const spansYears = watParts(range.start).y !== watParts(range.end - 1).y
  const buckets: SalesBucket[] = []
  const index = new Map<number, number>()
  for (let b = bucketStartOf(range.start, range.granularity); b < range.end; b = nextBucket(b, range.granularity)) {
    index.set(b, buckets.length)
    const labels = bucketLabels(b, nextBucket(b, range.granularity), range.granularity, range, spansYears)
    buckets.push({ start: b, ...labels, online: 0, offline: 0, total: 0, orders: 0 })
  }
  for (const o of paidInRange) {
    const i = index.get(bucketStartOf(orderTime(o), range.granularity))
    if (i === undefined) continue
    const amount = Number(o.total) || 0
    buckets[i][channelOf(o)] += amount
    buckets[i].total += amount
    buckets[i].orders += 1
  }

  const salesByChannel = { online: 0, offline: 0 }
  for (const o of paidInRange) salesByChannel[channelOf(o)] += Number(o.total) || 0

  // Products: grouped by product id; custom offline lines grouped together.
  const productNames = new Map(products.map((p) => [p.id, p.name]))
  const byProduct = new Map<string, ProductRow>()
  for (const o of paidInRange) {
    for (const item of o.items) {
      const isCustom = !item.productId || item.productId === 'custom'
      const key = isCustom ? 'custom' : item.productId
      const name = isCustom ? 'Custom pieces' : productNames.get(item.productId) ?? item.name
      const row = byProduct.get(key) ?? { key, name, units: 0, revenue: 0 }
      row.units += Number(item.quantity) || 0
      row.revenue += (Number(item.price) || 0) * (Number(item.quantity) || 0)
      byProduct.set(key, row)
    }
  }
  const rankedProducts = Array.from(byProduct.values()).sort(
    (a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name)
  )
  // Fold the tail into "Other" only when it saves at least two rows.
  const fold = rankedProducts.length > topLimit + 1
  const topProducts = fold ? rankedProducts.slice(0, topLimit) : rankedProducts
  const otherProducts = fold
    ? rankedProducts.slice(topLimit).reduce(
        (acc, r) => ({ count: acc.count + 1, units: acc.units + r.units, revenue: acc.revenue + r.revenue }),
        { count: 0, units: 0, revenue: 0 }
      )
    : null

  // Where sales come from: delivery zone for online orders, sale source for offline ones.
  const bySource = new Map<string, BreakdownRow>()
  for (const o of paidInRange) {
    const offline = channelOf(o) === 'offline'
    const name = (offline ? o.offlineSource || 'Offline sale' : o.deliveryZone || 'Unspecified zone').trim()
    const key = `${offline ? 'offline' : 'online'}:${name}`
    const label = offline ? `${name} (offline)` : name
    const row = bySource.get(key) ?? { key, label, value: 0, orders: 0 }
    row.value += Number(o.total) || 0
    row.orders += 1
    bySource.set(key, row)
  }
  const salesBySource = Array.from(bySource.values()).sort((a, b) => b.value - a.value || b.orders - a.orders)

  // Pipeline: every order placed in the window, in lifecycle order.
  const counts = new Map<OrderStatus, number>()
  for (const o of placedInRange) counts.set(o.status, (counts.get(o.status) ?? 0) + 1)
  const pipeline = PIPELINE_ORDER.map((status) => ({ status, count: counts.get(status) ?? 0 }))

  // Custom bag requests aren't tied to a sales channel, so only the date filter applies.
  const byStatus: Record<BespokeStatus, number> = { new: 0, quoted: 0, in_progress: 0, completed: 0 }
  let openValue = 0
  let bespokeTotal = 0
  for (const r of bespoke) {
    const t = Date.parse(r.createdAt)
    if (!Number.isFinite(t) || !inWindow(t, range.start, range.end)) continue
    bespokeTotal += 1
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1
    if (r.status !== 'completed') openValue += Number(r.estimatedPrice) || 0
  }

  return {
    range,
    sales: { value: cur.sales, previous: prev ? prev.sales : null },
    paidOrders: { value: cur.count, previous: prev ? prev.count : null },
    averageOrderValue: { value: cur.aov, previous: prev ? prev.aov : null },
    itemsSold: { value: cur.units, previous: prev ? prev.units : null },
    salesByChannel,
    buckets,
    topProducts,
    otherProducts,
    salesBySource,
    pipeline,
    ordersPlaced: placedInRange.length,
    bespoke: { total: bespokeTotal, byStatus, openValue },
  }
}

/* ---------- Needs attention (current state, not filtered by date) ---------- */

export interface AttentionData {
  pendingCount: number
  pendingValue: number
  /** Age of the oldest receipt still waiting, in ms (null when none). */
  oldestPendingAgeMs: number | null
  lowStock: { id: string; name: string; stock: number }[]
  soldOutCount: number
  newBespokeCount: number
}

export const LOW_STOCK_THRESHOLD = 2

export function computeAttention(
  orders: Order[],
  products: Product[],
  bespoke: BespokeRequest[],
  now: number
): AttentionData {
  const pending = orders.filter((o) => o.status === 'pending_verification')
  const pendingTimes = pending.map(orderTime).filter((t) => Number.isFinite(t))
  const lowStock = products
    .filter((p) => p.active && p.stock <= LOW_STOCK_THRESHOLD)
    .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name))
    .map((p) => ({ id: p.id, name: p.name, stock: p.stock }))
  return {
    pendingCount: pending.length,
    pendingValue: pending.reduce((s, o) => s + (Number(o.total) || 0), 0),
    oldestPendingAgeMs: pendingTimes.length > 0 ? Math.max(0, now - Math.min(...pendingTimes)) : null,
    lowStock,
    soldOutCount: lowStock.filter((p) => p.stock <= 0).length,
    newBespokeCount: bespoke.filter((b) => b.status === 'new').length,
  }
}

/* ---------- Formatting ---------- */

/** Percentage change, or null when there is no meaningful base (no comparison, or previous was 0). */
export function percentChange(metric: Metric): number | null {
  if (metric.previous === null || metric.previous === 0) return null
  return ((metric.value - metric.previous) / metric.previous) * 100
}

/** ₦950 · ₦12.5K · ₦1.2M (for axes and tight spaces; full values live in tooltips and tables). */
export function formatCompactNaira(amount: number): string {
  const n = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  const trim = (v: number) => v.toFixed(1).replace(/\.0$/, '')
  if (n >= 1_000_000) return `${sign}₦${trim(n / 1_000_000)}M`
  if (n >= 10_000) return `${sign}₦${Math.round(n / 1000)}K`
  if (n >= 1_000) return `${sign}₦${trim(n / 1000)}K`
  return `${sign}₦${Math.round(n)}`
}

/** "3 hours", "2 days" */
export function formatAge(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000))
  if (hours < 1) return 'under an hour'
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
  const days = Math.floor(hours / 24)
  return `${days} days`
}

/** Clean axis ticks from 0 to at least `max`, about `target` steps (1, 2, 2.5, 5 × 10^k). */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0]
  const raw = max / target
  const pow = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? 10 * pow
  const ticks: number[] = []
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}
