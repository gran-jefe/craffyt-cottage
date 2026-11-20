/**
 * Business report: shapes every record in a period into plain sheet data. No React and no
 * Excel library here, so the numbers can be tested directly; AdminReports turns the sheets
 * into an .xlsx file.
 *
 * Counting rules match the dashboard (src/lib/analytics.ts):
 * - An order counts as a sale once payment is verified (Payment confirmed through Delivered).
 *   Pending and cancelled orders are listed but never counted as sales.
 * - Expenses covering a month or year are spread evenly over their days.
 * - Everything is dated in Nigeria time (WAT, UTC+1).
 */
import {
  DAY_MS,
  channelOf,
  expenseBounds,
  expensePeriodLabel,
  expenseShare,
  isPaid,
  startOfWatDay,
  toDateInput,
} from '@/lib/analytics'
import { formatPhone } from '@/lib/phone'
import { lineUnitCost, type CostBook } from '@/lib/costs'
import { hasVariants, variantLabel, variantPrice } from '@/lib/variants'
import type {
  BespokeRequest,
  BespokeStatus,
  Catalog,
  Expense,
  Order,
  OrderStatus,
  PaymentMethod,
  Product,
} from '@/types/store'

/* ---------- Sheet data model ---------- */

export type CellFormat = 'text' | 'naira' | 'number' | 'percent' | 'date' | 'datetime'
export type CellValue = string | number | Date | null
/** A cell that needs its own format (e.g. the mixed Value column on the Summary sheet). */
export interface FormattedCell {
  value: CellValue
  format: CellFormat
}
export type ReportCell = CellValue | FormattedCell

export interface ReportColumn {
  header: string
  /** Approximate Excel column width in characters. */
  width: number
  format?: CellFormat
}

export interface ReportTable {
  title?: string
  columns: ReportColumn[]
  rows: ReportCell[][]
  /** Optional bold totals row under the table. */
  totals?: ReportCell[]
  /** Shown instead of rows when the table is empty. */
  emptyText?: string
}

export interface ReportSheet {
  /** Excel sheet name (max 31 characters). */
  name: string
  /** Lines printed above the first table. */
  intro?: string[]
  tables: ReportTable[]
}

export interface ReportRange {
  start: number
  /** Exclusive. */
  end: number
  label: string
}

export interface ReportInput {
  orders: Order[]
  products: Product[]
  expenses: Expense[]
  bespoke: BespokeRequest[]
  catalog: Catalog | null
  /** Private cost prices; without them profit leaves out what the pieces cost. */
  costs?: CostBook
  generatedAt: number
  generatedBy?: string
}

export interface ReportSummary {
  ordersPlaced: number
  paidOrders: number
  sales: number
  onlineSales: number
  offlineSales: number
  itemsSold: number
  averageOrderValue: number
  deliveryFees: number
  expenses: number
  /** What the pieces sold cost to make or buy (known cost prices only). */
  costOfGoods: number
  /** Units sold with no cost price. */
  uncostedUnits: number
  /** Sales minus cost of pieces sold. */
  grossProfit: number
  /** Gross profit minus expenses. */
  profit: number
  pendingCount: number
  pendingValue: number
  cancelledCount: number
  cancelledValue: number
  customRequests: number
  customOpenValue: number
  stockUnits: number
  stockValue: number
  soldOutOptions: number
  /** True when nothing at all happened in the period. */
  empty: boolean
}

export interface BusinessReport {
  range: ReportRange
  summary: ReportSummary
  sheets: ReportSheet[]
  /** e.g. crafty-cottage-report-2026-11-01-to-2026-11-30.xlsx */
  fileName: string
}

/* ---------- Labels ---------- */

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_verification: 'Pending verification',
  payment_confirmed: 'Payment confirmed',
  processing: 'Processing',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  cash: 'Cash',
  pos: 'POS / Card',
  other: 'Other',
}

const BESPOKE_LABELS: Record<BespokeStatus, string> = {
  new: 'New',
  quoted: 'Quoted',
  in_progress: 'In progress',
  completed: 'Completed',
}

const LOW_STOCK = 2
const WAT_OFFSET_MS = 60 * 60 * 1000

/* ---------- Helpers ---------- */

const n = (v: unknown) => Number(v) || 0

function orderTime(o: Pick<Order, 'createdAt'>): number {
  return Date.parse(o.createdAt)
}

function inRange(t: number, r: ReportRange): boolean {
  return Number.isFinite(t) && t >= r.start && t < r.end
}

/**
 * Excel has no time zones: it shows a date exactly as written. Shifting by +1h makes the
 * cell read as the Nigeria wall-clock time the order was placed.
 */
export function watDate(ms: number): Date {
  return new Date(ms + WAT_OFFSET_MS)
}

/** A calendar day ("2026-11-18") as a date-only cell. */
function dayCell(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const naira = (value: number): FormattedCell => ({ value: Math.round(value * 100) / 100, format: 'naira' })
const count = (value: number): FormattedCell => ({ value, format: 'number' })

/** Category and collection display names for a product id, from the admin catalogue. */
function makeNamer(products: Product[], catalog: Catalog | null) {
  const categories = new Map((catalog?.categories ?? []).map((c) => [c.id, c.name]))
  const collections = new Map((catalog?.collections ?? []).map((c) => [c.id, c.name]))
  const byId = new Map(products.map((p) => [p.id, p]))
  const categoryOf = (p: Product | undefined) =>
    (p?.categoryId && categories.get(p.categoryId)) || 'Uncategorised'
  const collectionOf = (p: Product | undefined) =>
    (p?.collectionId && collections.get(p.collectionId)) || p?.collection || 'No collection'
  return {
    product: (id: string) => byId.get(id),
    category: (id: string) => (id === 'custom' || !id ? 'Custom pieces' : categoryOf(byId.get(id))),
    collection: (id: string) => (id === 'custom' || !id ? 'Custom pieces' : collectionOf(byId.get(id))),
    categoryOf,
    collectionOf,
  }
}

function itemsSummary(o: Order): string {
  return o.items
    .map((i) => `${n(i.quantity)} x ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ''}`)
    .join('; ')
}

function unitsOf(o: Order): number {
  return o.items.reduce((s, i) => s + n(i.quantity), 0)
}

/** Groups rows into a total-per-key table, largest first. */
function groupTotals<T>(rows: T[], key: (r: T) => string, value: (r: T) => number, units?: (r: T) => number) {
  const map = new Map<string, { units: number; value: number }>()
  for (const r of rows) {
    const k = key(r)
    const g = map.get(k) ?? { units: 0, value: 0 }
    g.value += value(r)
    g.units += units ? units(r) : 0
    map.set(k, g)
  }
  return Array.from(map, ([name, g]) => ({ name, ...g })).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
}

/* ---------- Report ---------- */

export function buildBusinessReport(input: ReportInput, range: ReportRange): BusinessReport {
  const { orders, products, expenses, bespoke, catalog, generatedAt } = input
  const names = makeNamer(products, catalog)
  const book: CostBook = input.costs ?? new Map()

  const placed = orders
    .filter((o) => inRange(orderTime(o), range))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const paid = placed.filter(isPaid)
  const pending = placed.filter((o) => o.status === 'pending_verification')
  const cancelled = placed.filter((o) => o.status === 'cancelled')

  const sales = paid.reduce((s, o) => s + n(o.total), 0)
  const onlineSales = paid.filter((o) => channelOf(o) === 'online').reduce((s, o) => s + n(o.total), 0)
  const offlineSales = sales - onlineSales
  const itemsSold = paid.reduce((s, o) => s + unitsOf(o), 0)
  const deliveryFees = paid.reduce((s, o) => s + n(o.deliveryFee), 0)

  // Every line with its unit cost: recorded at sale time, else today's cost price, else unknown.
  const lines = placed.flatMap((o) =>
    o.items.map((i, idx) => {
      const unitCost = lineUnitCost(o, idx, i, book)
      return { o, i, total: n(i.price) * n(i.quantity), unitCost, cost: unitCost === null ? null : unitCost * n(i.quantity) }
    })
  )
  const paidLines = lines.filter(({ o }) => isPaid(o))
  const costOfGoods = paidLines.reduce((s, l) => s + (l.cost ?? 0), 0)
  const uncostedUnits = paidLines.reduce((s, l) => s + (l.cost === null ? n(l.i.quantity) : 0), 0)

  const expenseRows = expenses
    .map((e) => ({ e, share: expenseShare(e, range.start, range.end) }))
    .filter((x) => x.share > 0)
    .sort((a, b) => {
      const sa = expenseBounds(a.e)?.start ?? 0
      const sb = expenseBounds(b.e)?.start ?? 0
      return sa - sb || a.e.description.localeCompare(b.e.description)
    })
  const spent = expenseRows.reduce((s, x) => s + x.share, 0)

  const requests = bespoke
    .filter((r) => inRange(Date.parse(r.createdAt), range))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const openValue = requests.filter((r) => r.status !== 'completed').reduce((s, r) => s + n(r.estimatedPrice), 0)

  // Inventory is a snapshot of right now, one row per sellable option.
  const inventoryRows = products.flatMap((p) =>
    hasVariants(p)
      ? p.variants.map((v) => ({ p, option: variantLabel(v), price: variantPrice(p, v), stock: n(v.stock) }))
      : [{ p, option: '', price: n(p.price), stock: n(p.stock) }]
  )
  const stockUnits = inventoryRows.reduce((s, r) => s + r.stock, 0)
  const stockValue = inventoryRows.reduce((s, r) => s + r.stock * r.price, 0)
  const soldOutOptions = inventoryRows.filter((r) => r.p.active && r.stock <= 0).length

  const summary: ReportSummary = {
    ordersPlaced: placed.length,
    paidOrders: paid.length,
    sales,
    onlineSales,
    offlineSales,
    itemsSold,
    averageOrderValue: paid.length > 0 ? sales / paid.length : 0,
    deliveryFees,
    expenses: spent,
    costOfGoods,
    uncostedUnits,
    grossProfit: sales - costOfGoods,
    profit: sales - costOfGoods - spent,
    pendingCount: pending.length,
    pendingValue: pending.reduce((s, o) => s + n(o.total), 0),
    cancelledCount: cancelled.length,
    cancelledValue: cancelled.reduce((s, o) => s + n(o.total), 0),
    customRequests: requests.length,
    customOpenValue: openValue,
    stockUnits,
    stockValue,
    soldOutOptions,
    empty: placed.length === 0 && expenseRows.length === 0 && requests.length === 0,
  }

  const fromYmd = toDateInput(range.start)
  const toYmd = toDateInput(range.end - 1)

  /* ----- Summary ----- */
  const summarySheet: ReportSheet = {
    name: 'Summary',
    intro: [
      'Crafty Cottage business report',
      `Period: ${range.label} (${fromYmd} to ${toYmd}, Nigeria time)`,
      `Generated: ${toDateInput(generatedAt)} ${new Date(generatedAt + WAT_OFFSET_MS).toISOString().slice(11, 16)} WAT${
        input.generatedBy ? ` by ${input.generatedBy}` : ''
      }`,
    ],
    tables: [
      {
        title: 'Sales',
        columns: [
          { header: 'Measure', width: 42 },
          { header: 'Value', width: 18 },
        ],
        rows: [
          ['Verified sales (all channels)', naira(sales)],
          ['Online sales', naira(onlineSales)],
          ['Offline sales', naira(offlineSales)],
          ['Paid orders', count(paid.length)],
          ['Items sold', count(itemsSold)],
          ['Average order value', naira(summary.averageOrderValue)],
          ['Delivery fees collected (included in sales)', naira(deliveryFees)],
        ],
      },
      {
        title: 'Profit',
        columns: [
          { header: 'Measure', width: 42 },
          { header: 'Value', width: 18 },
        ],
        rows: [
          ['Verified sales', naira(sales)],
          ['Cost of pieces sold', naira(costOfGoods)],
          ['Gross profit (sales minus cost of pieces)', naira(summary.grossProfit)],
          ['Expenses counted in this period', naira(spent)],
          [summary.profit < 0 ? 'Loss (after costs and expenses)' : 'Profit (after costs and expenses)', naira(summary.profit)],
          ...(uncostedUnits > 0
            ? [[`Pieces sold with no cost price (their cost isn't counted)`, count(uncostedUnits)] as ReportCell[]]
            : []),
        ],
      },
      {
        title: 'Orders not counted as sales',
        columns: [
          { header: 'Measure', width: 42 },
          { header: 'Value', width: 18 },
        ],
        rows: [
          ['Orders placed in the period (all statuses)', count(placed.length)],
          ['Waiting for payment verification', count(pending.length)],
          ['Value waiting for verification', naira(summary.pendingValue)],
          ['Cancelled orders', count(cancelled.length)],
          ['Value of cancelled orders', naira(summary.cancelledValue)],
        ],
      },
      {
        title: 'Custom requests',
        columns: [
          { header: 'Measure', width: 42 },
          { header: 'Value', width: 18 },
        ],
        rows: [
          ['Requests received', count(requests.length)],
          ['Estimated value still open', naira(openValue)],
        ],
      },
      {
        title: 'Stock today (snapshot when generated)',
        columns: [
          { header: 'Measure', width: 42 },
          { header: 'Value', width: 18 },
        ],
        rows: [
          ['Units in stock', count(stockUnits)],
          ['Stock value at selling price', naira(stockValue)],
          ['Sold-out options on the storefront', count(soldOutOptions)],
        ],
      },
      {
        title: 'How figures are counted',
        columns: [{ header: 'Note', width: 100 }],
        rows: [
          ['An order counts as a sale once its payment is verified: Payment confirmed, Processing, Dispatched or Delivered.'],
          ['Pending and cancelled orders are listed on the Orders sheet but never counted as sales.'],
          ['Sales include delivery fees. Product revenue (Sales by product) is price x quantity only.'],
          ['Expenses covering a month or a year are spread evenly over their days, so a period counts only its share.'],
          ['Offline sales are dated by their sale date. Days run midnight to midnight, Nigeria time (WAT).'],
          ['Cost of pieces sold uses the cost price recorded when each order was paid, or today\'s cost price for older orders.'],
          ['Profit is verified sales minus the cost of pieces sold minus expenses. Stock still on the shelf isn\'t counted.'],
          ['If bead and material purchases are entered as cost prices, don\'t also record them as expenses, or they count twice.'],
        ],
      },
    ],
  }

  /* ----- Orders ----- */
  const ordersSheet: ReportSheet = {
    name: 'Orders',
    tables: [
      {
        columns: [
          { header: 'Date', width: 17, format: 'datetime' },
          { header: 'Order code', width: 12 },
          { header: 'Channel', width: 9 },
          { header: 'Status', width: 21 },
          { header: 'Payment method', width: 15 },
          { header: 'Customer', width: 22 },
          { header: 'Phone', width: 18 },
          { header: 'Delivery zone or source', width: 28 },
          { header: 'Address', width: 32 },
          { header: 'Items', width: 44 },
          { header: 'Units', width: 7, format: 'number' },
          { header: 'Subtotal', width: 13, format: 'naira' },
          { header: 'Delivery fee', width: 12, format: 'naira' },
          { header: 'Total', width: 13, format: 'naira' },
          { header: 'Counts as sale', width: 13 },
          { header: 'Notes', width: 30 },
        ],
        rows: placed.map((o) => [
          watDate(orderTime(o)),
          o.orderCode,
          channelOf(o) === 'offline' ? 'Offline' : 'Online',
          ORDER_STATUS_LABELS[o.status] ?? o.status,
          o.paymentMethod ? PAYMENT_LABELS[o.paymentMethod] : 'Bank transfer',
          o.customerName,
          o.customerPhone ? formatPhone(o.customerPhone) : '',
          o.offlineSource || o.deliveryZone || '',
          o.address || '',
          itemsSummary(o),
          unitsOf(o),
          n(o.subtotal),
          n(o.deliveryFee),
          n(o.total),
          isPaid(o) ? 'Yes' : 'No',
          [o.notes, o.dispatchNote ? `Dispatch: ${o.dispatchNote}` : ''].filter(Boolean).join(' | '),
        ]),
        totals: placed.length
          ? ['Totals (all statuses)', '', '', '', '', '', '', '', '', '', placed.reduce((s, o) => s + unitsOf(o), 0), placed.reduce((s, o) => s + n(o.subtotal), 0), placed.reduce((s, o) => s + n(o.deliveryFee), 0), placed.reduce((s, o) => s + n(o.total), 0), '', '']
          : undefined,
        emptyText: 'No orders were placed in this period.',
      },
    ],
  }

  /* ----- Order lines ----- */
  const linesSheet: ReportSheet = {
    name: 'Order lines',
    tables: [
      {
        columns: [
          { header: 'Date', width: 17, format: 'datetime' },
          { header: 'Order code', width: 12 },
          { header: 'Status', width: 21 },
          { header: 'Channel', width: 9 },
          { header: 'Product', width: 28 },
          { header: 'Option', width: 18 },
          { header: 'Category', width: 16 },
          { header: 'Collection', width: 20 },
          { header: 'Qty', width: 6, format: 'number' },
          { header: 'Unit price', width: 13, format: 'naira' },
          { header: 'Line total', width: 13, format: 'naira' },
          { header: 'Unit cost', width: 13, format: 'naira' },
          { header: 'Line cost', width: 13, format: 'naira' },
          { header: 'Line profit', width: 13, format: 'naira' },
          { header: 'Counts as sale', width: 13 },
        ],
        rows: lines.map(({ o, i, total, unitCost, cost }) => [
          watDate(orderTime(o)),
          o.orderCode,
          ORDER_STATUS_LABELS[o.status] ?? o.status,
          channelOf(o) === 'offline' ? 'Offline' : 'Online',
          i.name,
          i.variantLabel || '',
          names.category(i.productId),
          names.collection(i.productId),
          n(i.quantity),
          n(i.price),
          total,
          unitCost,
          cost,
          cost === null ? null : total - cost,
          isPaid(o) ? 'Yes' : 'No',
        ]),
        emptyText: 'No order lines in this period.',
      },
    ],
  }

  /* ----- Sales by product / category / collection (paid only) ----- */
  const productRevenue = paidLines.reduce((s, l) => s + l.total, 0)
  const share = (v: number): FormattedCell => ({ value: productRevenue > 0 ? v / productRevenue : 0, format: 'percent' })
  const byProduct = groupTotals(
    paidLines,
    (l) => `${l.i.productId === 'custom' || !l.i.productId ? 'custom' : l.i.productId}\u0000${l.i.name}`,
    (l) => l.total,
    (l) => n(l.i.quantity)
  )
  // Cost per product row; a row with any uncosted unit shows its cost as incomplete.
  const productCost = new Map<string, { cost: number; missing: boolean }>()
  for (const l of paidLines) {
    const k = `${l.i.productId === 'custom' || !l.i.productId ? 'custom' : l.i.productId}\u0000${l.i.name}`
    const c = productCost.get(k) ?? { cost: 0, missing: false }
    if (l.cost === null) c.missing = true
    else c.cost += l.cost
    productCost.set(k, c)
  }
  const byCategory = groupTotals(paidLines, (l) => names.category(l.i.productId), (l) => l.total, (l) => n(l.i.quantity))
  const byCollection = groupTotals(paidLines, (l) => names.collection(l.i.productId), (l) => l.total, (l) => n(l.i.quantity))
  const breakdownColumns = (first: string): ReportColumn[] => [
    { header: first, width: 30 },
    { header: 'Units', width: 8, format: 'number' },
    { header: 'Revenue', width: 14, format: 'naira' },
    { header: 'Share of product revenue', width: 22, format: 'percent' },
  ]
  const salesSheet: ReportSheet = {
    name: 'Sales by product',
    intro: ['Paid orders only. Revenue is price x quantity, excluding delivery fees.'],
    tables: [
      {
        title: 'By product',
        columns: [
          { header: 'Product', width: 30 },
          { header: 'Category', width: 16 },
          { header: 'Collection', width: 20 },
          { header: 'Units', width: 8, format: 'number' },
          { header: 'Revenue', width: 14, format: 'naira' },
          { header: 'Share of product revenue', width: 22, format: 'percent' },
          { header: 'Cost of pieces', width: 14, format: 'naira' },
          { header: 'Profit', width: 14, format: 'naira' },
          { header: 'Margin', width: 9, format: 'percent' },
        ],
        rows: byProduct.map((g) => {
          const [id, name] = g.name.split('\u0000')
          const c = productCost.get(g.name)
          const known = c && !c.missing
          return [
            name,
            names.category(id),
            names.collection(id),
            g.units,
            g.value,
            share(g.value),
            known ? c.cost : 'No cost price',
            known ? g.value - c.cost : null,
            known && g.value > 0 ? { value: (g.value - c.cost) / g.value, format: 'percent' } : null,
          ]
        }),
        totals: byProduct.length
          ? ['Total', '', '', paidLines.reduce((s, l) => s + n(l.i.quantity), 0), productRevenue, share(productRevenue), costOfGoods, '', '']
          : undefined,
        emptyText: 'No paid sales in this period.',
      },
      {
        title: 'By category',
        columns: breakdownColumns('Category'),
        rows: byCategory.map((g) => [g.name, g.units, g.value, share(g.value)]),
        emptyText: 'No paid sales in this period.',
      },
      {
        title: 'By collection',
        columns: breakdownColumns('Collection'),
        rows: byCollection.map((g) => [g.name, g.units, g.value, share(g.value)]),
        emptyText: 'No paid sales in this period.',
      },
    ],
  }

  /* ----- Sales over time ----- */
  const days = Math.round((range.end - range.start) / DAY_MS)
  const byMonth = days > 120
  const buckets = new Map<string, { online: number; offline: number; orders: number }>()
  for (let t = startOfWatDay(range.start); t < range.end; t += DAY_MS) {
    const key = byMonth ? toDateInput(t).slice(0, 7) : toDateInput(t)
    if (!buckets.has(key)) buckets.set(key, { online: 0, offline: 0, orders: 0 })
  }
  for (const o of paid) {
    const ymd = toDateInput(orderTime(o))
    const b = buckets.get(byMonth ? ymd.slice(0, 7) : ymd)
    if (!b) continue
    b[channelOf(o)] += n(o.total)
    b.orders += 1
  }
  const timeRows: ReportCell[][] = Array.from(buckets, ([key, b]) => [
    // Months read as "Nov 2026" text so Excel doesn't show a misleading 1st-of-month date.
    byMonth ? monthLabel(dayCell(`${key}-01`)) : dayCell(key),
    b.online,
    b.offline,
    b.online + b.offline,
    b.orders,
  ])
  const timeSheet: ReportSheet = {
    name: byMonth ? 'Sales by month' : 'Sales by day',
    intro: ['Verified sales only, delivery fees included. Every ' + (byMonth ? 'month' : 'day') + ' is listed, including those with no sales.'],
    tables: [
      {
        columns: [
          { header: byMonth ? 'Month' : 'Date', width: 14, format: byMonth ? 'text' : 'date' },
          { header: 'Online', width: 14, format: 'naira' },
          { header: 'Offline', width: 14, format: 'naira' },
          { header: 'Total', width: 14, format: 'naira' },
          { header: 'Paid orders', width: 12, format: 'number' },
        ],
        rows: timeRows,
        totals: ['Total', onlineSales, offlineSales, sales, paid.length],
      },
    ],
  }

  /* ----- Expenses ----- */
  const expenseByCategory = groupTotals(expenseRows, (x) => x.e.category || 'Other', (x) => x.share)
  const expensesSheet: ReportSheet = {
    name: 'Expenses',
    intro: ['Monthly and yearly costs are spread evenly over their days; "Counted in this period" is the share that falls inside the report dates.'],
    tables: [
      {
        title: 'Expenses',
        columns: [
          { header: 'Description', width: 34 },
          { header: 'Category', width: 22 },
          { header: 'Covers', width: 10 },
          { header: 'Period', width: 18 },
          { header: 'Full amount', width: 14, format: 'naira' },
          { header: 'Counted in this period', width: 20, format: 'naira' },
        ],
        rows: expenseRows.map(({ e, share: s }) => [
          e.description,
          e.category,
          e.period === 'day' ? 'Day' : e.period === 'month' ? 'Month' : 'Year',
          expensePeriodLabel(e),
          n(e.amount),
          naira(s),
        ]),
        totals: expenseRows.length ? ['Total', '', '', '', expenseRows.reduce((s, x) => s + n(x.e.amount), 0), naira(spent)] : undefined,
        emptyText: 'No expenses fall in this period.',
      },
      {
        title: 'By category',
        columns: [
          { header: 'Category', width: 34 },
          { header: 'Counted in this period', width: 22, format: 'naira' },
          { header: 'Share of expenses', width: 18, format: 'percent' },
        ],
        rows: expenseByCategory.map((g) => [g.name, naira(g.value), { value: spent > 0 ? g.value / spent : 0, format: 'percent' }]),
        emptyText: 'No expenses fall in this period.',
      },
    ],
  }

  /* ----- Custom requests ----- */
  const customSheet: ReportSheet = {
    name: 'Custom requests',
    tables: [
      {
        columns: [
          { header: 'Date', width: 17, format: 'datetime' },
          { header: 'Customer', width: 22 },
          { header: 'Phone', width: 18 },
          { header: 'Shape', width: 20 },
          { header: 'Bead colour', width: 22 },
          { header: 'Estimate', width: 13, format: 'naira' },
          { header: 'Status', width: 13 },
          { header: 'Notes', width: 40 },
        ],
        rows: requests.map((r) => [
          watDate(Date.parse(r.createdAt)),
          r.customerName,
          r.customerPhone ? formatPhone(r.customerPhone) : '',
          r.shape,
          r.beadColour,
          n(r.estimatedPrice),
          BESPOKE_LABELS[r.status] ?? r.status,
          r.notes || '',
        ]),
        emptyText: 'No custom requests were received in this period.',
      },
    ],
  }

  /* ----- Inventory ----- */
  const inventorySheet: ReportSheet = {
    name: 'Inventory',
    intro: [`Stock as it stood when this report was generated (${toDateInput(generatedAt)}), not at the end of the period.`],
    tables: [
      {
        columns: [
          { header: 'Product', width: 30 },
          { header: 'Category', width: 16 },
          { header: 'Collection', width: 20 },
          { header: 'Option', width: 18 },
          { header: 'Price', width: 13, format: 'naira' },
          { header: 'Stock', width: 8, format: 'number' },
          { header: 'Stock value', width: 14, format: 'naira' },
          { header: 'On storefront', width: 13 },
          { header: 'Status', width: 10 },
        ],
        rows: [...inventoryRows]
          .sort((a, b) => a.p.name.localeCompare(b.p.name) || a.option.localeCompare(b.option))
          .map((r) => [
            r.p.name,
            names.categoryOf(r.p),
            names.collectionOf(r.p),
            r.option,
            r.price,
            r.stock,
            r.stock * r.price,
            r.p.active ? 'Yes' : 'No',
            r.stock <= 0 ? 'Sold out' : r.stock <= LOW_STOCK ? 'Low' : 'In stock',
          ]),
        totals: inventoryRows.length ? ['Total', '', '', '', '', stockUnits, stockValue, '', ''] : undefined,
        emptyText: 'No products in the inventory.',
      },
    ],
  }

  return {
    range,
    summary,
    sheets: [summarySheet, ordersSheet, linesSheet, salesSheet, timeSheet, expensesSheet, customSheet, inventorySheet],
    fileName: `crafty-cottage-report-${fromYmd}-to-${toYmd}.xlsx`,
  }
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
}
