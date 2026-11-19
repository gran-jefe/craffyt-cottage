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
  runTransaction,
} from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import type { User } from 'firebase/auth'
import { db, storage, isFirebaseConfigured } from './firebase'
import { DEFAULT_CATALOG, DEFAULT_PRODUCTS, DEFAULT_STORE_SETTINGS } from './defaults'
import { applyStockMoves, cleanVariants, lineKey, stockForLine, sumStock } from './variants'
import type {
  BespokeRequest,
  BespokeStatus,
  Catalog,
  Expense,
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
  expenses: 'cc_demo_expenses_v1',
  catalog: 'cc_demo_catalog_v1',
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
/**
 * Mirrors the Firestore/Storage rules exactly: an `admin: true` custom claim or an admins/{uid}
 * document. There is deliberately no email allowlist here: NEXT_PUBLIC_* values ship in the public
 * bundle, and the rules wouldn't honour it anyway.
 */
export async function checkAdminAccess(user: User | null): Promise<boolean> {
  if (!user) return false
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
  const variants = cleanVariants(input.variants)
  const payload: Omit<Product, 'id'> = {
    name: input.name.trim(),
    collection: input.collection.trim(),
    price: Number(input.price),
    // With options, the shelf total is always derived from them so the two can't drift apart.
    stock: variants.length > 0 ? sumStock(variants) : Math.max(0, Math.floor(Number(input.stock))),
    tag: input.tag.trim(),
    description: input.description.trim(),
    imageUrl: input.imageUrl.trim(),
    active: Boolean(input.active),
    featured: Boolean(input.featured),
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
  // Omitted rather than [] so products without options keep their original shape.
  if (variants.length > 0) payload.variants = variants
  if (input.categoryId) payload.categoryId = input.categoryId
  if (input.collectionId) payload.collectionId = input.collectionId

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

/**
 * Moves stock by `delta` relative to the value stored right now, never to an absolute number
 * computed from a possibly stale screen. A sale confirmed at the same moment is therefore kept.
 * Returns the new stock count.
 */
export async function adjustProductStockBy(productId: string, delta: number, variantId?: string): Promise<number> {
  const step = Math.trunc(delta)
  const now = new Date().toISOString()
  const moves = new Map([[variantId ?? '', step]])
  // Returns the count the admin just changed: the option's stock, or the product's.
  const resultFor = (applied: { stock: number; variants?: Product['variants'] }) =>
    variantId ? applied.variants?.find((v) => v.id === variantId)?.stock ?? 0 : applied.stock

  if (isFirebaseConfigured && db) {
    const firestore = db
    return runTransaction(firestore, async (tx) => {
      const ref = doc(firestore, 'products', productId)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('Product no longer exists')
      const data = snap.data() as Product
      if (variantId && stockForLine(data, variantId) === null) throw new Error('Option no longer exists')
      const applied = applyStockMoves(data, moves)
      tx.update(ref, { ...applied, updatedAt: now })
      return resultFor(applied)
    })
  }
  const rows = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  let next = 0
  writeDemo(
    DEMO_KEYS.products,
    rows.map((p) => {
      if (p.id !== productId) return p
      const applied = applyStockMoves(p, moves)
      next = resultFor(applied)
      return { ...p, ...applied, updatedAt: now }
    })
  )
  return next
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
  const cleanSource = input.offlineSource.trim() || 'In person / Walk-in'
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

  const moves = input.deductStock ? movesByProduct(stockHeldByOrder(input.items), -1) : new Map<string, Map<string, number>>()

  if (isFirebaseConfigured && db) {
    const batch = writeBatch(db)
    const orderRef = doc(collection(db, 'orders'))
    batch.set(orderRef, orderDoc)
    batch.set(doc(db, 'orderTracking', orderCode), trackingDoc)

    for (const [productId, productMoves] of moves) {
      const prodRef = doc(db, 'products', productId)
      const prodSnap = await getDoc(prodRef)
      if (prodSnap.exists()) {
        batch.update(prodRef, { ...applyStockMoves(prodSnap.data() as Product, productMoves), updatedAt: now })
      }
    }

    await batch.commit()
    return { id: orderRef.id, ...orderDoc }
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const saved: Order = { id: `ord-${Date.now()}`, ...orderDoc }
  const nextOrders = [saved, ...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  writeDemo(DEMO_KEYS.orders, nextOrders)

  if (moves.size > 0) {
    const products = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
    const updatedProducts = products.map((p) => {
      const productMoves = moves.get(p.id)
      return productMoves ? { ...p, ...applyStockMoves(p, productMoves), updatedAt: now } : p
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

/**
 * Whether this order currently has its items taken off the shelf.
 * Orders record this explicitly (`stockDeducted`). Older online orders saved before the flag
 * existed are inferred from their status: paid statuses had stock deducted, others didn't.
 */
export function isStockDeducted(order: Pick<Order, 'status' | 'channel' | 'stockDeducted'>): boolean {
  if (typeof order.stockDeducted === 'boolean') return order.stockDeducted
  if (order.channel === 'offline') return false
  return PAID_STATUSES.includes(order.status)
}

export interface HeldLine {
  productId: string
  variantId?: string
  /** Customer-facing name including the option, e.g. "Dupree (Gold / Large)". */
  name: string
  quantity: number
}

/**
 * Catalogue quantities held by an order, merged per product option (custom offline lines hold
 * no stock). Keyed by lineKey(productId, variantId).
 */
export function stockHeldByOrder(items: OrderItem[]): Map<string, HeldLine> {
  const held = new Map<string, HeldLine>()
  for (const item of items) {
    if (!item.productId || item.productId === 'custom') continue
    const key = lineKey(item.productId, item.variantId)
    const prev = held.get(key)
    held.set(key, {
      productId: item.productId,
      variantId: item.variantId,
      name: item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name,
      quantity: (prev?.quantity ?? 0) + item.quantity,
    })
  }
  return held
}

/** Groups held lines per product: productId → (variantId or '') → signed quantity. */
function movesByProduct(held: Map<string, HeldLine>, sign: 1 | -1): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const line of held.values()) {
    const perProduct = out.get(line.productId) ?? new Map<string, number>()
    const key = line.variantId ?? ''
    perProduct.set(key, (perProduct.get(key) ?? 0) + sign * line.quantity)
    out.set(line.productId, perProduct)
  }
  return out
}

/**
 * Stock moves are decided from the order's stored state, never the screen:
 * - take off: moving into a paid status while nothing is held. Offline sales recorded
 *   without deducting stay that way unless the app itself put their stock back earlier.
 * - put back: cancelling with `restock` while stock is held.
 */
function planStockMove(
  stored: Order,
  newStatus: OrderStatus,
  restock: boolean
): 'deduct' | 'restore' | null {
  const deducted = isStockDeducted(stored)
  if (newStatus === 'cancelled') return restock && deducted ? 'restore' : null
  if (!PAID_STATUSES.includes(newStatus) || deducted) return null
  if (stored.channel === 'offline' && stored.stockRestored !== true) return null
  return 'deduct'
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
  held: Map<string, HeldLine>,
  stockFor: (line: HeldLine) => number | null
): string[] {
  const shortages: string[] = []
  for (const line of held.values()) {
    const { name, quantity } = line
    const stock = stockFor(line)
    if (stock === null) continue // product or option deleted since the order was placed
    if (stock < quantity) {
      shortages.push(`${name} has ${stock} left but the order needs ${quantity}`)
    }
  }
  return shortages
}

export interface UpdateOrderStatusOptions {
  /** When cancelling, put the order's items back in stock (only if they are currently held). */
  restock?: boolean
}

export interface UpdateOrderStatusResult {
  /** Units taken off (negative) or put back (positive); 0 when stock didn't move. */
  stockChange: number
}

export async function updateOrderStatus(
  order: Order,
  newStatus: OrderStatus,
  dispatchNote = '',
  options: UpdateOrderStatusOptions = {}
): Promise<UpdateOrderStatusResult> {
  const now = new Date().toISOString()
  const cleanNote = dispatchNote.trim()
  const restock = Boolean(options.restock)

  if (isFirebaseConfigured && db) {
    const firestore = db
    // Everything is decided inside the transaction from the stored order, so repeated clicks
    // and stale screens can never move stock twice.
    return runTransaction(firestore, async (tx) => {
      const orderRef = doc(firestore, 'orders', order.id)
      const snap = await tx.get(orderRef)
      if (!snap.exists()) throw new Error('Order no longer exists')
      const stored = snap.data() as Order
      const move = planStockMove(stored, newStatus, restock)
      const held = move ? stockHeldByOrder(stored.items) : new Map<string, HeldLine>()

      const ids = Array.from(new Set(Array.from(held.values(), (l) => l.productId)))
      const productRefs = ids.map((id) => doc(firestore, 'products', id))
      const productSnaps = await Promise.all(productRefs.map((r) => tx.get(r)))
      const storedById = new Map(
        productSnaps.map((ps, i) => [ids[i], ps.exists() ? (ps.data() as Product) : null])
      )
      const stockFor = (l: HeldLine) => {
        const p = storedById.get(l.productId)
        return p ? stockForLine(p, l.variantId) : null
      }

      if (move === 'deduct') {
        // Rules reject negative stock, which would surface as an opaque permission error.
        const shortages = findShortages(held, stockFor)
        if (shortages.length > 0) throw new StockShortageError(shortages)
      }

      const orderPatch: Record<string, unknown> = { status: newStatus, dispatchNote: cleanNote, updatedAt: now }
      if (move === 'deduct') orderPatch.stockDeducted = true
      if (move === 'restore') {
        orderPatch.stockDeducted = false
        orderPatch.stockRestored = true
      }
      tx.update(orderRef, orderPatch)
      tx.update(doc(firestore, 'orderTracking', stored.orderCode), {
        status: newStatus,
        dispatchNote: cleanNote,
        updatedAt: now,
      })

      const sign = move === 'restore' ? 1 : -1
      let stockChange = 0
      for (const l of held.values()) if (stockFor(l) !== null) stockChange += sign * l.quantity
      const moves = movesByProduct(held, sign)
      // Read-modify-write inside the transaction: variant stock lives in an array, which
      // increment() can't reach, and the transaction retries if a sale lands in between.
      ids.forEach((id, i) => {
        const p = storedById.get(id)
        if (!p) return // product deleted since the order was placed
        tx.update(productRefs[i], { ...applyStockMoves(p, moves.get(id)!), updatedAt: now })
      })
      return { stockChange }
    })
  }

  const orders = readDemo<Order[]>(DEMO_KEYS.orders, [])
  const stored = orders.find((o) => o.id === order.id) ?? order
  const move = planStockMove(stored, newStatus, restock)
  const held = move ? stockHeldByOrder(stored.items) : new Map<string, HeldLine>()
  const products = readDemo<Product[]>(DEMO_KEYS.products, DEFAULT_PRODUCTS)
  const demoStockFor = (l: HeldLine) => {
    const p = products.find((x) => x.id === l.productId)
    return p ? stockForLine(p, l.variantId) : null
  }
  if (move === 'deduct') {
    const shortages = findShortages(held, demoStockFor)
    if (shortages.length > 0) throw new StockShortageError(shortages)
  }
  writeDemo(
    DEMO_KEYS.orders,
    orders.map((o) => {
      if (o.id !== order.id) return o
      const next: Order = { ...o, status: newStatus, dispatchNote: cleanNote, updatedAt: now }
      if (move === 'deduct') next.stockDeducted = true
      if (move === 'restore') {
        next.stockDeducted = false
        next.stockRestored = true
      }
      return next
    })
  )
  let stockChange = 0
  if (move) {
    const sign = move === 'restore' ? 1 : -1
    for (const l of held.values()) if (demoStockFor(l) !== null) stockChange += sign * l.quantity
    const moves = movesByProduct(held, sign)
    writeDemo(
      DEMO_KEYS.products,
      products.map((p) => {
        const productMoves = moves.get(p.id)
        return productMoves ? { ...p, ...applyStockMoves(p, productMoves), updatedAt: now } : p
      })
    )
  }
  return { stockChange }
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

/* ---------- Expenses ---------- */
export async function fetchExpenses(): Promise<Expense[]> {
  if (isFirebaseConfigured && db) {
    const snap = await getDocs(query(collection(db, 'expenses'), orderBy('periodKey', 'desc')))
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Expense, 'id'>) }))
  }
  return readDemo<Expense[]>(DEMO_KEYS.expenses, []).sort((a, b) => b.periodKey.localeCompare(a.periodKey))
}

export async function saveExpense(
  input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: string }
): Promise<Expense> {
  const now = new Date().toISOString()
  const payload: Omit<Expense, 'id'> = {
    description: input.description.trim(),
    category: input.category.trim(),
    amount: Math.round(Number(input.amount) * 100) / 100,
    period: input.period,
    periodKey: input.periodKey,
    createdAt: input.createdAt || now,
    updatedAt: now,
  }
  if (isFirebaseConfigured && db) {
    if (input.id) {
      await setDoc(doc(db, 'expenses', input.id), payload)
      return { id: input.id, ...payload }
    }
    const created = await addDoc(collection(db, 'expenses'), payload)
    return { id: created.id, ...payload }
  }
  const rows = readDemo<Expense[]>(DEMO_KEYS.expenses, [])
  if (input.id) {
    writeDemo(DEMO_KEYS.expenses, rows.map((e) => (e.id === input.id ? { id: input.id!, ...payload } : e)))
    return { id: input.id, ...payload }
  }
  const saved: Expense = { id: `exp-${Date.now()}`, ...payload }
  writeDemo(DEMO_KEYS.expenses, [saved, ...rows])
  return saved
}

export async function deleteExpense(id: string): Promise<void> {
  if (isFirebaseConfigured && db) {
    await deleteDoc(doc(db, 'expenses', id))
    return
  }
  writeDemo(DEMO_KEYS.expenses, readDemo<Expense[]>(DEMO_KEYS.expenses, []).filter((e) => e.id !== id))
}

/* ---------- Catalogue (categories and collections) ---------- */
/** The admin's shop structure, or the starter one when they haven't saved theirs yet. */
export async function fetchCatalog(): Promise<Catalog> {
  if (isFirebaseConfigured && db) {
    const snap = await getDoc(doc(db, 'settings', 'catalog'))
    if (!snap.exists()) return DEFAULT_CATALOG
    const data = snap.data() as Partial<Catalog>
    return {
      categories: Array.isArray(data.categories) ? data.categories : DEFAULT_CATALOG.categories,
      collections: Array.isArray(data.collections) ? data.collections : DEFAULT_CATALOG.collections,
      updatedAt: data.updatedAt,
    }
  }
  return readDemo<Catalog>(DEMO_KEYS.catalog, DEFAULT_CATALOG)
}

export async function saveCatalog(catalog: Catalog): Promise<void> {
  // Firestore rejects undefined: only write optional text that has a value.
  const clean: Catalog = {
    categories: catalog.categories.map((c) => ({
      id: c.id,
      name: c.name.trim(),
      ...(c.sizeLabel?.trim() ? { sizeLabel: c.sizeLabel.trim() } : {}),
    })),
    collections: catalog.collections.map((c) => ({
      id: c.id,
      name: c.name.trim(),
      ...(c.description?.trim() ? { description: c.description.trim() } : {}),
    })),
    updatedAt: new Date().toISOString(),
  }
  if (isFirebaseConfigured && db) {
    await setDoc(doc(db, 'settings', 'catalog'), clean)
    return
  }
  writeDemo(DEMO_KEYS.catalog, clean)
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
