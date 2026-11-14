import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  writeBatch,
  increment,
  runTransaction,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import type { User } from 'firebase/auth'
import { db, storage, isFirebaseConfigured } from './firebase'
import { DEFAULT_PRODUCTS, DEFAULT_STORE_SETTINGS } from './defaults'
import type {
  BespokeRequest,
  BespokeStatus,
  Order,
  OrderItem,
  OrderStatus,
  OrderTrackingInfo,
  PaymentMethod,
  Product,
  StoreSettings,
} from '@/types/store'

const DEMO_KEYS = {
  products: 'cc_demo_products_v1',
  orders: 'cc_demo_orders_v1',
  bespoke: 'cc_demo_bespoke_v1',
  settings: 'cc_demo_settings_v1',
}

function readDemo<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeDemo<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore storage quota errors in private mode
  }
}

function generateOrderCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let suffix = ''
  for (let i = 0; i < 6; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)]
  }
  return `CC-${suffix}`
}

/** True when uploads go to Cloud Storage; otherwise files are stored inline as compressed data URLs. */
export const usesCloudStorage = process.env.NEXT_PUBLIC_ENABLE_FIREBASE_STORAGE === 'true'

/** Inline storage keeps PDFs small enough to fit in a Firestore document (rules cap at ~700 KB of base64). */
export const RECEIPT_PDF_MAX_BYTES = usesCloudStorage ? 10 * 1024 * 1024 : 450 * 1024
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024

/** A problem with the file itself, with a message the customer can act on. */
export class ReceiptFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReceiptFileError'
  }
}

/** Returns a customer-readable problem with a receipt file, or null when it can be uploaded. */
export function checkReceiptFile(file: File): string | null {
  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !file.type.startsWith('image/')) {
    return 'Please upload a screenshot (JPG or PNG) or a PDF of your transfer receipt.'
  }
  if (isPdf && file.size > RECEIPT_PDF_MAX_BYTES) {
    return `This PDF is ${formatFileSize(file.size)}, and PDFs must be under ${formatFileSize(RECEIPT_PDF_MAX_BYTES)}. Please upload a screenshot of the receipt instead.`
  }
  if (file.size > RECEIPT_MAX_BYTES) {
    return `This file is ${formatFileSize(file.size)}. Receipts must be under 10 MB.`
  }
  return null
}

export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

async function fileToCompressedDataUrl(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    if (file.size > RECEIPT_PDF_MAX_BYTES) {
      throw new ReceiptFileError(
        `PDFs must be under ${formatFileSize(RECEIPT_PDF_MAX_BYTES)}. Please upload a screenshot of the receipt instead.`
      )
    }
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () =>
        reject(new ReceiptFileError('We couldn’t read this PDF. Please choose it again, or upload a screenshot.'))
      reader.readAsDataURL(file)
    })
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxDim = 720
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(String(reader.result || ''))
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.onerror = () =>
        reject(
          new ReceiptFileError(
            'We couldn’t read this image (iPhone HEIC photos often can’t be opened). Please upload a JPG or PNG screenshot instead.'
          )
        )
      img.src = String(reader.result || '')
    }
    reader.onerror = () =>
      reject(new ReceiptFileError('We couldn’t read this file. Please choose it again, or upload a screenshot.'))
    reader.readAsDataURL(file)
  })
}

/* ---------- Auth / Admin check ---------- */
export async function checkAdminAccess(user: User | null): Promise<boolean> {
  if (!user) return false
  const allowlist = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
  if (user.email && allowlist.includes(user.email.toLowerCase())) {
    return true
  }
  if (!isFirebaseConfigured || !db) return false
  try {
    const token = await user.getIdTokenResult()
    if (token.claims?.admin === true) return true
    const snap = await getDoc(doc(db, 'admins', user.uid))
    return snap.exists()
  } catch {
    return false
  }
}

/* ---------- Media Upload ---------- */
export async function uploadMediaFile(
  file: File,
  folder: 'products' | 'receipts'
): Promise<string> {
  if (usesCloudStorage && isFirebaseConfigured && storage) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storageRef = ref(storage, `${folder}/${Date.now()}-${safeName}`)
    await uploadBytes(storageRef, file, { contentType: file.type })
    return await getDownloadURL(storageRef)
  }
  return await fileToCompressedDataUrl(file)
}

/* ---------- Products ---------- */
export async function fetchProducts(includeInactive = false): Promise<Product[]> {
  if (isFirebaseConfigured && db) {
    const snap = await getDocs(
      query(collection(db, 'products'), orderBy('createdAt', 'desc'))
    )
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }))
    return includeInactive ? rows : rows.filter((p) => p.active)
  }
  const rows = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  return includeInactive ? rows : rows.filter((p) => p.active)
}

export async function seedInitialProducts(): Promise<void> {
  const now = new Date().toISOString()
  if (isFirebaseConfigured && db) {
    const batch = writeBatch(db)
    for (const p of DEFAULT_PRODUCTS) {
      const { id, ...rest } = p
      batch.set(doc(db, 'products', id), { ...rest, createdAt: now, updatedAt: now })
    }
    await batch.commit()
    return
  }
  writeDemo(DEMO_KEYS.products, DEFAULT_PRODUCTS)
}

export async function saveProduct(
  input: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }
): Promise<Product> {
  const now = new Date().toISOString()
  const payload = {
    name: input.name.trim(),
    collection: input.collection.trim(),
    price: Number(input.price),
    stock: Math.max(0, Math.floor(Number(input.stock))),
    tag: input.tag.trim(),
    description: input.description.trim(),
    imageUrl: input.imageUrl.trim(),
    active: Boolean(input.active),
    featured: Boolean(input.featured),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }

  if (isFirebaseConfigured && db) {
    if (input.id) {
      await setDoc(doc(db, 'products', input.id), payload)
      return { id: input.id, ...payload }
    }
    const created = await addDoc(collection(db, 'products'), payload)
    return { id: created.id, ...payload }
  }

  const rows = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  if (input.id) {
    const updated = rows.map((p) => (p.id === input.id ? { id: input.id, ...payload } : p))
    writeDemo(DEMO_KEYS.products, updated)
    return { id: input.id, ...payload }
  }
  const newProduct: Product = { id: `prod-${Date.now()}`, ...payload }
  writeDemo(DEMO_KEYS.products, [newProduct, ...rows])
  return newProduct
}

export async function adjustProductStock(productId: string, newStock: number): Promise<void> {
  const safeStock = Math.max(0, Math.floor(newStock))
  const now = new Date().toISOString()
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(db, 'products', productId), { stock: safeStock, updatedAt: now })
    return
  }
  const rows = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  writeDemo(
    DEMO_KEYS.products,
    rows.map((p) => (p.id === productId ? { ...p, stock: safeStock, updatedAt: now } : p))
  )
}

export async function deleteProduct(productId: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'products', productId))
    return
  }
  const rows = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  writeDemo(
    DEMO_KEYS.products,
    rows.filter((p) => p.id !== productId)
  )
}

/* ---------- Orders ---------- */
export interface CreateOrderInput {
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
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const now = new Date().toISOString()
  const orderCode = generateOrderCode()
  const itemCount = input.items.reduce((sum, i) => sum + i.quantity, 0)

  const orderDoc = {
    orderCode,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: (input.customerEmail || '').trim(),
    deliveryZone: input.deliveryZone.trim(),
    deliveryFee: Number(input.deliveryFee),
    address: input.address.trim(),
    notes: (input.notes || '').trim(),
    items: input.items,
    subtotal: Number(input.subtotal),
    total: Number(input.total),
    receiptUrl: input.receiptUrl,
    status: 'pending_verification' as const,
    createdAt: now,
    updatedAt: now,
  }

  const trackingDoc: OrderTrackingInfo = {
    orderCode,
    status: 'pending_verification',
    deliveryZone: orderDoc.deliveryZone,
    itemCount,
    total: orderDoc.total,
    dispatchNote: '',
    updatedAt: now,
  }

  if (isFirebaseConfigured && db) {
    const batch = writeBatch(db)
    const orderRef = doc(collection(db, 'orders'))
    batch.set(orderRef, orderDoc)
    batch.set(doc(db, 'orderTracking', orderCode), trackingDoc)
    await batch.commit()
    return { id: orderRef.id, ...orderDoc }
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const saved: Order = { id: `ord-${Date.now()}`, ...orderDoc }
  writeDemo(DEMO_KEYS.orders, [saved, ...orders])
  return saved
}

export interface CreateOfflineOrderInput {
  customerName: string
  customerPhone?: string
  customerEmail?: string
  offlineSource: string
  deliveryZone?: string
  deliveryFee: number
  address?: string
  notes?: string
  items: OrderItem[]
  subtotal: number
  total: number
  paymentMethod: PaymentMethod
  status: Extract<OrderStatus, 'payment_confirmed' | 'processing' | 'dispatched' | 'delivered'>
  receiptUrl?: string
  deductStock: boolean
  soldAt?: string
}

export async function createOfflineOrder(input: CreateOfflineOrderInput): Promise<Order> {
  const now = new Date().toISOString()
  const parsedSoldAt = input.soldAt ? new Date(input.soldAt) : null
  const createdAt =
    parsedSoldAt && !Number.isNaN(parsedSoldAt.getTime()) ? parsedSoldAt.toISOString() : now
  const orderCode = generateOrderCode()
  const itemCount = input.items.reduce((sum, i) => sum + i.quantity, 0)
  const cleanSource = input.offlineSource.trim() || 'In-Studio / Walk-in'
  const deliveryFee = Math.max(0, Number(input.deliveryFee) || 0)
  const subtotal = Number(input.subtotal)
  const total = Number(input.total)

  const orderDoc = {
    orderCode,
    customerName: input.customerName.trim() || 'Walk-in Customer',
    customerPhone: (input.customerPhone || '').trim(),
    customerEmail: (input.customerEmail || '').trim(),
    deliveryZone: (input.deliveryZone || cleanSource).trim(),
    deliveryFee,
    address: (input.address || '').trim(),
    notes: (input.notes || '').trim(),
    items: input.items,
    subtotal,
    total,
    receiptUrl: (input.receiptUrl || '').trim(),
    status: input.status,
    channel: 'offline' as const,
    paymentMethod: input.paymentMethod,
    offlineSource: cleanSource,
    stockDeducted: Boolean(input.deductStock),
    createdAt,
    updatedAt: now,
  }

  const trackingDoc: OrderTrackingInfo = {
    orderCode,
    status: input.status,
    deliveryZone: orderDoc.deliveryZone,
    itemCount,
    total: orderDoc.total,
    dispatchNote: '',
    updatedAt: now,
  }

  const qtyByProduct = new Map<string, number>()
  if (input.deductStock) {
    for (const item of input.items) {
      if (!item.productId || item.productId === 'custom') continue
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity)
    }
  }

  if (isFirebaseConfigured && db) {
    const batch = writeBatch(db)
    const orderRef = doc(collection(db, 'orders'))
    batch.set(orderRef, orderDoc)
    batch.set(doc(db, 'orderTracking', orderCode), trackingDoc)

    for (const [productId, qty] of qtyByProduct.entries()) {
      const prodRef = doc(db, 'products', productId)
      const prodSnap = await getDoc(prodRef)
      if (prodSnap.exists()) {
        const currentStock = Number(prodSnap.data().stock || 0)
        batch.update(prodRef, {
          stock: Math.max(0, Math.floor(currentStock) - qty),
          updatedAt: now,
        })
      }
    }

    await batch.commit()
    return { id: orderRef.id, ...orderDoc }
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const saved: Order = { id: `ord-${Date.now()}`, ...orderDoc }
  const nextOrders = [saved, ...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  writeDemo(DEMO_KEYS.orders, nextOrders)

  if (qtyByProduct.size > 0) {
    const products = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
    const updatedProducts = products.map((p) => {
      const qty = qtyByProduct.get(p.id)
      return qty ? { ...p, stock: Math.max(0, p.stock - qty), updatedAt: now } : p
    })
    writeDemo(DEMO_KEYS.products, updatedProducts)
  }

  return saved
}

export async function fetchOrders(): Promise<Order[]> {
  if (isFirebaseConfigured && db) {
    const snap = await getDocs(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
    )
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Order, 'id'>) }))
  }
  const rows = readDemo<Order[]>(DEMO_KEYS.orders, [])
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const PAID_STATUSES: OrderStatus[] = ['payment_confirmed', 'processing', 'dispatched', 'delivered']

/** Stock leaves the shelf exactly once: when an order first moves out of pending into any paid state. */
function shouldDeductStock(currentStatus: OrderStatus, nextStatus: OrderStatus): boolean {
  return currentStatus === 'pending_verification' && PAID_STATUSES.includes(nextStatus)
}

/**
 * Thrown when confirming payment would take a product below zero stock (the same bag was
 * sold twice before either payment was verified). Carries an admin-readable message.
 */
export class StockShortageError extends Error {
  constructor(public readonly shortages: string[]) {
    super(
      `Not enough stock to confirm this order: ${shortages.join('; ')}. Restock the piece in Inventory, or cancel and refund the order.`
    )
    this.name = 'StockShortageError'
  }
}

function findShortages(
  items: OrderItem[],
  stockFor: (productId: string) => number | null
): string[] {
  const shortages: string[] = []
  for (const item of items) {
    const stock = stockFor(item.productId)
    if (stock === null) continue // product deleted since the order was placed
    if (stock < item.quantity) {
      shortages.push(`${item.name} has ${stock} left but the order needs ${item.quantity}`)
    }
  }
  return shortages
}

export async function updateOrderStatus(
  order: Order,
  newStatus: OrderStatus,
  dispatchNote = ''
): Promise<void> {
  const now = new Date().toISOString()
  const cleanNote = dispatchNote.trim()

  if (isFirebaseConfigured && db) {
    const firestore = db
    // Decide on stock deduction from the order's CURRENT stored status, read inside
    // a transaction, never from the (possibly stale) UI copy. This makes repeated
    // clicks idempotent and covers jumps from pending straight to any paid status.
    await runTransaction(firestore, async (tx) => {
      const orderRef = doc(firestore, 'orders', order.id)
      const snap = await tx.get(orderRef)
      if (!snap.exists()) throw new Error('Order no longer exists')
      const stored = snap.data() as Order
      const deduct = shouldDeductStock(stored.status, newStatus)
      // Use the stored line items, not the UI copy, so stock moves by what was actually ordered.
      const items = stored.items

      const productRefs = deduct
        ? items.map((item) => doc(firestore, 'products', item.productId))
        : []
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)))

      // Firestore rules reject negative stock, which would fail the whole transaction with an
      // opaque permission error. Check first and tell the admin exactly what is short.
      const stockById = new Map(
        productSnaps.map((ps, i) => [
          items[i].productId,
          ps.exists() ? Math.floor(Number(ps.data().stock) || 0) : null,
        ])
      )
      const shortages = findShortages(items, (id) => stockById.get(id) ?? null)
      if (shortages.length > 0) throw new StockShortageError(shortages)

      tx.update(orderRef, { status: newStatus, dispatchNote: cleanNote, updatedAt: now })
      tx.update(doc(firestore, 'orderTracking', order.orderCode), {
        status: newStatus,
        dispatchNote: cleanNote,
        updatedAt: now,
      })
      productSnaps.forEach((ps, i) => {
        if (!ps.exists()) return // product deleted since the order was placed
        tx.update(productRefs[i], {
          stock: increment(-items[i].quantity),
          updatedAt: now,
        })
      })
    })
    return
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const stored = orders.find((o) => o.id === order.id)
  const shouldDecrementStock = shouldDeductStock(stored?.status ?? order.status, newStatus)
  if (shouldDecrementStock) {
    const products = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
    const shortages = findShortages(order.items, (id) => {
      const p = products.find((x) => x.id === id)
      return p ? p.stock : null
    })
    if (shortages.length > 0) throw new StockShortageError(shortages)
  }
  writeDemo(
    DEMO_KEYS.orders,
    orders.map((o) =>
      o.id === order.id ? { ...o, status: newStatus, dispatchNote: cleanNote, updatedAt: now } : o
    )
  )
  if (shouldDecrementStock) {
    const products = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
    const updatedProducts = products.map((p) => {
      const match = order.items.find((i) => i.productId === p.id)
      return match ? { ...p, stock: Math.max(0, p.stock - match.quantity), updatedAt: now } : p
    })
    writeDemo(DEMO_KEYS.products, updatedProducts)
  }
}

export async function lookupOrderTracking(orderCode: string): Promise<OrderTrackingInfo | null> {
  const code = orderCode.trim().toUpperCase()
  if (!code) return null

  if (isFirebaseConfigured && db) {
    const snap = await getDoc(doc(db, 'orderTracking', code))
    return snap.exists() ? (snap.data() as OrderTrackingInfo) : null
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const found = orders.find((o) => o.orderCode.toUpperCase() === code)
  if (!found) return null
  return {
    orderCode: found.orderCode,
    status: found.status,
    deliveryZone: found.deliveryZone,
    itemCount: found.items.reduce((s, i) => s + i.quantity, 0),
    total: found.total,
    dispatchNote: found.dispatchNote,
    updatedAt: found.updatedAt,
  }
}

/* ---------- Bespoke Requests ---------- */
export async function createBespokeRequest(
  input: Omit<BespokeRequest, 'id' | 'status' | 'createdAt'>
): Promise<BespokeRequest> {
  const now = new Date().toISOString()
  const payload = {
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    shape: input.shape.trim(),
    beadColour: input.beadColour.trim(),
    estimatedPrice: Number(input.estimatedPrice),
    notes: input.notes.trim(),
    status: 'new' as const,
    createdAt: now,
  }

  if (isFirebaseConfigured && db) {
    const created = await addDoc(collection(db, 'bespokeRequests'), payload)
    return { id: created.id, ...payload }
  }

  const rows = readDemo<BespokeRequest[]>(DEMO_KEYS.bespoke, [])
  const saved: BespokeRequest = { id: `bsp-${Date.now()}`, ...payload }
  writeDemo(DEMO_KEYS.bespoke, [saved, ...rows])
  return saved
}

export async function fetchBespokeRequests(): Promise<BespokeRequest[]> {
  if (isFirebaseConfigured && db) {
    const snap = await getDocs(
      query(collection(db, 'bespokeRequests'), orderBy('createdAt', 'desc'))
    )
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BespokeRequest, 'id'>) }))
  }
  return readDemo<BespokeRequest[]>(DEMO_KEYS.bespoke, [])
}

export async function updateBespokeStatus(id: string, status: BespokeStatus): Promise<void> {
  if (isFirebaseConfigured && db) {
    await updateDoc(doc(db, 'bespokeRequests', id), { status })
    return
  }
  const rows = readDemo<BespokeRequest[]>(DEMO_KEYS.bespoke, [])
  writeDemo(
    DEMO_KEYS.bespoke,
    rows.map((r) => (r.id === id ? { ...r, status } : r))
  )
}

/* ---------- Store Settings ---------- */
/**
 * Returns the saved store settings, or null when the owner has never saved them.
 * Network and permission errors are thrown, never papered over with defaults:
 * a fallback here would put a placeholder bank account in front of paying customers.
 */
export async function fetchStoreSettings(): Promise<StoreSettings | null> {
  if (isFirebaseConfigured && db) {
    const snap = await getDoc(doc(db, 'settings', 'store'))
    if (!snap.exists()) return null
    return { ...DEFAULT_STORE_SETTINGS, ...(snap.data() as Partial<StoreSettings>) }
  }
  const saved = readDemo<StoreSettings | null>(DEMO_KEYS.settings, null)
  return saved ? { ...DEFAULT_STORE_SETTINGS, ...saved } : null
}

export async function saveStoreSettings(settings: StoreSettings): Promise<void> {
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, 'settings', 'store'), settings)
    return
  }
  writeDemo(DEMO_KEYS.settings, settings)
}
