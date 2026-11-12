'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { CartItem, Product } from '@/types/store'
import { formatNaira } from '@/lib/defaults'
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
  addItem: (product: Product, qty?: number) => void
  updateQuantity: (productId: string, qty: number) => void
  removeItem: (productId: string) => void
  clearCart: () => void
  subtotal: number
  totalCount: number
  showToast: (message: string, tone?: 'success' | 'error') => void
  /** Re-prices the bag against live products. Returns customer-readable change notes (empty = no change). */
  reconcileWithProducts: (products: Product[]) => string[]
}

const CartContext = createContext<CartContextValue | null>(null)

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
    const timer = setTimeout(() => setToast(null), 3800)
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
    (product: Product, qty = 1) => {
      if (product.stock <= 0) {
        showToast(`${product.name} is currently sold out.`, 'error')
        return
      }
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === product.id)
        if (existing) {
          const nextQty = Math.min(product.stock, existing.quantity + qty)
          if (nextQty === existing.quantity) {
            showToast(`Only ${product.stock} piece(s) left in stock.`, 'error')
            return prev
          }
          showToast(`Added another ${product.name} to your bag.`)
          return prev.map((i) =>
            i.productId === product.id ? { ...i, quantity: nextQty, maxStock: product.stock } : i
          )
        }
        showToast(`${product.name} added to your bag.`)
        return [
          ...prev,
          {
            productId: product.id,
            name: product.name,
            price: product.price,
            imageUrl: product.imageUrl,
            quantity: Math.min(qty, product.stock),
            maxStock: product.stock,
          },
        ]
      })
    },
    [showToast]
  )

  const updateQuantity = useCallback((productId: string, qty: number) => {
    if (qty <= 0) {
      setItems((prev) => prev.filter((i) => i.productId !== productId))
      return
    }
    setItems((prev) =>
      prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.min(qty, i.maxStock) } : i
      )
    )
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.productId !== productId))
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
        if (!p || !p.active || p.stock <= 0) {
          changes.push(`${item.name} is no longer available and was removed.`)
          continue
        }
        let quantity = item.quantity
        if (quantity > p.stock) {
          quantity = p.stock
          changes.push(`Only ${p.stock} ${p.name} left, so your quantity was reduced.`)
        }
        if (p.price !== item.price) {
          changes.push(
            `${p.name} is now ${formatNaira(p.price)} (was ${formatNaira(item.price)}).`
          )
        }
        next.push({ ...item, name: p.name, price: p.price, imageUrl: p.imageUrl, quantity, maxStock: p.stock })
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
            role="status"
            className={`pointer-events-auto flex items-center gap-2.5 max-w-sm w-full px-4 py-3.5 rounded-xl text-sm font-medium shadow-xl border ${
              toast.tone === 'error'
                ? 'bg-[#7A1B14] text-white border-red-400/30'
                : 'bg-[#111B07] text-[#FAF8F4] border-[#E6C975]/30'
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
