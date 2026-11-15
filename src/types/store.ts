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

export interface Product {
  id: string
  name: string
  collection: string
  price: number
  stock: number
  tag: string
  description: string
  imageUrl: string
  active: boolean
  featured: boolean
  createdAt: string
  updatedAt: string
}

export interface CartItem {
  productId: string
  name: string
  price: number
  imageUrl: string
  quantity: number
  maxStock: number
}

export interface OrderItem {
  productId: string
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
