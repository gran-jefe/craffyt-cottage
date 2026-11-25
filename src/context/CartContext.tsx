'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { CartItem, Product, ProductVariant } from '@/types/store'
import { formatNaira } from '@/lib/defaults'
import { findVariant, hasVariants, lineKey, variantLabel, variantPrice } from '@/lib/variants'
import { CheckCircle2, AlertCircle } from 'lucide-react'

const CART_STORAGE_KEY = 'craftycottage_cart_v1'
const CART_TTL_MS = 14 * 24 * 60 * 60 * 1000

interface ToastState {
  message: string
  tone: 'success' | 'error'
}

interface CartContextValue {
  items: CartItem[]
  isDrawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  /** Products with colour/size options must be added with the chosen variant. */
  addItem: (product: Product, qty?: number, variant?: ProductVariant) => void
  /** `key` is cartLineKey(item): one line per product option. */
  updateQuantity: (key: string, qty: number) => void
  removeItem: (key: string) => void
  clearCart: () => void
  subtotal: number
  totalCount: number
  showToast: (message: string, tone?: 'success' | 'error') => void
  /** Re-prices the bag against live products. Returns customer-readable change notes (empty = no change). */
  reconcileWithProducts: (products: Product[]) => string[]
}

const CartContext = createContext<CartContextValue | null>(null)

export function cartLineKey(item: Pick<CartItem, 'productId' | 'variantId'>): string {
  return lineKey(item.productId, item.variantId)
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [isDrawerOpen, setDrawerOpen] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone })
  }, [])

  useEffect(() => {
    if (!toast) return
    // Errors usually carry instructions, so give them time to be read.
    const timer = setTimeout(() => setToast(null), toast.tone === 'error' ? 8000 : 3800)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { items: CartItem[]; savedAt: number }
        if (parsed && Array.isArray(parsed.items) && Date.now() - parsed.savedAt < CART_TTL_MS) {
          setItems(parsed.items)
        } else {
          window.localStorage.removeItem(CART_STORAGE_KEY)
        }
      }
    } catch {
      // Safe fallback when storage is disabled
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ items, savedAt: Date.now() })
      )
    } catch {
      // Ignore quota errors
    }
  }, [items, hydrated])

  const addItem = useCallback(
    (product: Product, qty = 1, variant?: ProductVariant) => {
      if (hasVariants(product) && !variant) {
        showToast(`Choose a colour or size for ${product.name} first.`, 'error')
        return
      }
      const label = variant ? variantLabel(variant) : ''
      const displayName = label ? `${product.name} (${label})` : product.name
      const stock = variant ? variant.stock : product.stock
      if (stock <= 0) {
        showToast(`${displayName} is currently sold out.`, 'error')
        return
      }
      const key = lineKey(product.id, variant?.id)
      // Decide the outcome from the current bag, then update state; toasts stay outside the
      // state updater because React may run updaters twice.
      const existing = items.find((i) => cartLineKey(i) === key)
      if (existing) {
        const nextQty = Math.min(stock, existing.quantity + qty)
        if (nextQty === existing.quantity) {
          showToast(
            `Only ${stock} ${stock === 1 ? 'piece' : 'pieces'} left, and they're all in your cart.`,
            'error'
          )
          return
        }
        setItems((prev) =>
          prev.map((i) => (cartLineKey(i) === key ? { ...i, quantity: nextQty, maxStock: stock } : i))
        )
        showToast(`Added another ${displayName} to your cart.`)
        return
      }
      const line: CartItem = {
        productId: product.id,
        name: product.name,
        price: variant ? variantPrice(product, variant) : product.price,
        imageUrl: variant?.imageUrl || product.imageUrl,
        quantity: Math.min(qty, stock),
        maxStock: stock,
      }
      if (variant) {
        line.variantId = variant.id
        line.variantLabel = label
      }
      setItems((prev) => (prev.some((i) => cartLineKey(i) === key) ? prev : [...prev, line]))
      showToast(`${displayName} added to your cart.`)
    },
    [items, showToast]
  )

  const updateQuantity = useCallback((key: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => cartLineKey(i) !== key))
      return
    }
    setItems((prev) =>
      prev.map((i) => (cartLineKey(i) === key ? { ...i, quantity: Math.min(qty, i.maxStock) } : i))
    )
  }, [])

  const removeItem = useCallback((key: string) => {
    setItems((prev) => prev.filter((i) => cartLineKey(i) !== key))
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const reconcileWithProducts = useCallback(
    (products: Product[]): string[] => {
      const live = new Map(products.map((p) => [p.id, p]))
      const changes: string[] = []
      const next: CartItem[] = []
      for (const item of items) {
        const p = live.get(item.productId)
        const shownName = item.variantLabel ? `${item.name} (${item.variantLabel})` : item.name
        if (!p || !p.active) {
          changes.push(`${shownName} is no longer available and was removed.`)
          continue
        }
        // A bag line saved before this piece had options can't be matched to one of them.
        if (hasVariants(p) && !item.variantId) {
          changes.push(`${p.name} now comes in different options. Please choose one again from the shop.`)
          continue
        }
        const variant = findVariant(p, item.variantId)
        if (item.variantId && !variant) {
          changes.push(`${shownName} is no longer offered and was removed.`)
          continue
        }
        const stock = variant ? variant.stock : p.stock
        const price = variant ? variantPrice(p, variant) : p.price
        const label = variant ? variantLabel(variant) : undefined
        const liveName = label ? `${p.name} (${label})` : p.name
        if (stock <= 0) {
          changes.push(`${liveName} sold out and was removed.`)
          continue
        }
        let quantity = item.quantity
        if (quantity > stock) {
          quantity = stock
          changes.push(`Only ${stock} ${liveName} left, so your quantity was reduced.`)
        }
        if (price !== item.price) {
          changes.push(`${liveName} is now ${formatNaira(price)} (was ${formatNaira(item.price)}).`)
        }
        const updated: CartItem = {
          ...item,
          name: p.name,
          price,
          imageUrl: variant?.imageUrl || p.imageUrl,
          quantity,
          maxStock: stock,
        }
        if (label) updated.variantLabel = label
        next.push(updated)
      }
      if (changes.length > 0) setItems(next)
      return changes
    },
    [items]
  )

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const totalCount = items.reduce((sum, i) => sum + i.quantity, 0)

  return (
    <CartContext.Provider
      value={{
        items,
        isDrawerOpen,
        setDrawerOpen,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        subtotal,
        totalCount,
        showToast,
        reconcileWithProducts,
      }}
    >
      {children}

      {/* Accessible Global Toast */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="fixed bottom-5 right-5 left-5 sm:left-auto z-50 flex justify-end pointer-events-none"
      >
        {toast && (
          <div
            className={`pointer-events-auto flex items-center gap-2.5 max-w-sm w-full px-4 py-3.5 rounded-xl text-sm font-medium shadow-xl border ${
              toast.tone === 'error'
                ? 'bg-[#7A1B14] text-white border-red-400/30'
                : 'bg-[#04201F] text-[#FAF8F4] border-[#E6C975]/30'
            }`}
          >
            {toast.tone === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-200" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-[#B8F0CF]" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </CartContext.Provider>
  )
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
