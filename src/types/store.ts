export type OrderStatus =
  | 'pending_verification'
  | 'payment_confirmed'
  | 'processing'
  | 'dispatched'
  | 'delivered'
  | 'cancelled'

export type OrderChannel = 'online' | 'offline'

export type PaymentMethod = 'bank_transfer' | 'cash' | 'pos' | 'other'

export type BespokeStatus = 'new' | 'quoted' | 'in_progress' | 'completed'

/**
 * One buyable option of a product, e.g. "Gold / Large". A product with variants is sold only
 * through them: each variant holds its own stock, and Product.stock is kept as their sum.
 */
export interface ProductVariant {
  /** Stable id, kept across edits so carts and orders still point at the same option. */
  id: string
  /** Colour shown to customers; '' when the product isn't offered in colours. */
  color: string
  /** Size shown to customers; '' when the product isn't offered in sizes. */
  size: string
  stock: number
  /** Overrides Product.price for this option when set. */
  price?: number
  /** Photo of this option; falls back to Product.imageUrl. */
  imageUrl?: string
}

export interface Product {
  id: string
  name: string
  collection: string
  price: number
  /** Units on the shelf. For products with variants this is the sum of the variants' stock. */
  stock: number
  tag: string
  description: string
  imageUrl: string
  active: boolean
  featured: boolean
  variants?: ProductVariant[]
  createdAt: string
  updatedAt: string
}

export interface CartItem {
  productId: string
  variantId?: string
  /** e.g. "Gold / Large", shown under the product name. */
  variantLabel?: string
  name: string
  price: number
  imageUrl: string
  quantity: number
  maxStock: number
}

export interface OrderItem {
  productId: string
  variantId?: string
  variantLabel?: string
  name: string
  price: number
  quantity: number
}

export interface Order {
  id: string
  orderCode: string
  customerName: string
  customerPhone: string
  customerEmail?: string
  deliveryZone: string
  deliveryFee: number
  address: string
  notes?: string
  items: OrderItem[]
  subtotal: number
  total: number
  receiptUrl: string
  status: OrderStatus
  channel?: OrderChannel
  paymentMethod?: PaymentMethod
  offlineSource?: string
  /** True while this order's items are taken off the shelf. */
  stockDeducted?: boolean
  /** Set once the app has put this order's stock back (on cancel). */
  stockRestored?: boolean
  dispatchNote?: string
  createdAt: string
  updatedAt: string
}

export interface OrderTrackingInfo {
  orderCode: string
  status: OrderStatus
  deliveryZone: string
  itemCount: number
  total: number
  dispatchNote?: string
  updatedAt: string
}

export interface BespokeRequest {
  id: string
  customerName: string
  customerPhone: string
  shape: string
  beadColour: string
  estimatedPrice: number
  notes: string
  status: BespokeStatus
  createdAt: string
}

export interface DeliveryZone {
  id: string
  label: string
  fee: number
  eta: string
}

export interface StoreSettings {
  brandName: string
  tagline: string
  bankName: string
  accountName: string
  accountNumber: string
  whatsappNumber: string
  instagramHandle: string
  deliveryZones: DeliveryZone[]
}

/** The stretch of time a cost covers. Analytics spreads the amount evenly across its days. */
export type ExpensePeriod = 'day' | 'month' | 'year'

export interface Expense {
  id: string
  description: string
  category: string
  /** Naira, for the whole period. */
  amount: number
  period: ExpensePeriod
  /** Which day, month or year it covers, Nigeria time: "2026-11-18", "2026-11" or "2026". */
  periodKey: string
  createdAt: string
  updatedAt: string
}
