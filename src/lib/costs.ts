import type { Order, OrderItem, ProductCost } from '@/types/store'

/** productId → its cost record. */
export type CostBook = Map<string, ProductCost>

/** Cost of one unit of a product or option right now, or null when no cost price is set. */
export function unitCostFor(book: CostBook, productId: string, variantId?: string): number | null {
  if (!productId || productId === 'custom') return null
  const entry = book.get(productId)
  if (!entry) return null
  const own = variantId ? entry.variants?.[variantId] : undefined
  if (typeof own === 'number' && own >= 0) return own
  return typeof entry.cost === 'number' && entry.cost >= 0 ? entry.cost : null
}

/** Unit costs for each line of an order, as recorded when it's paid. */
export function snapshotItemCosts(items: OrderItem[], book: CostBook): (number | null)[] {
  return items.map((i) => unitCostFor(book, i.productId, i.variantId))
}

/**
 * Unit cost of an order line: the cost recorded at sale time, else today's cost price (orders
 * paid before cost prices existed), else null.
 */
export function lineUnitCost(order: Pick<Order, 'itemCosts'>, index: number, item: OrderItem, book: CostBook): number | null {
  const recorded = order.itemCosts?.[index]
  if (typeof recorded === 'number') return recorded
  return unitCostFor(book, item.productId, item.variantId)
}

export interface OrderCost {
  /** Cost of the pieces whose cost is known. */
  cost: number
  /** Units sold with no cost price, so their cost isn't counted. */
  uncostedUnits: number
}

export function orderCost(order: Pick<Order, 'items' | 'itemCosts'>, book: CostBook): OrderCost {
  let cost = 0
  let uncostedUnits = 0
  order.items.forEach((item, i) => {
    const qty = Number(item.quantity) || 0
    const unit = lineUnitCost(order, i, item, book)
    if (unit === null) uncostedUnits += qty
    else cost += unit * qty
  })
  return { cost, uncostedUnits }
}
