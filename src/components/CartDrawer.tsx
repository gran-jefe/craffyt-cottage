'use client'

import React, { useEffect } from 'react'
import Link from 'next/link'
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight } from 'lucide-react'
import { cartLineKey, useCart } from '@/context/CartContext'
import { formatNaira } from '@/lib/defaults'
import { useDialogFocus } from '@/lib/useDialogFocus'

export function CartDrawer() {
  const {
    items,
    isDrawerOpen,
    setDrawerOpen,
    updateQuantity,
    removeItem,
    subtotal,
    totalCount,
  } = useCart()
  const panelRef = useDialogFocus<HTMLDivElement>(isDrawerOpen)

  useEffect(() => {
    if (!isDrawerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen, setDrawerOpen])

  if (!isDrawerOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-[#111B07]/60 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
      onClick={() => setDrawerOpen(false)}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-[#FAF8F4] h-full flex flex-col border-l border-[#E2DACA] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2DACA] flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-[#263E0F]" />
            <h2 id="cart-drawer-title" className="font-serif-display text-lg font-bold text-[#17210E]">
              Your shopping bag ({totalCount})
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close shopping bag"
            className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] text-[#4A5240] hover:text-[#17210E] hover:bg-[#F4EFE6] flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {items.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center px-4 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-[#EAF2DE] text-[#263E0F] flex items-center justify-center">
                <ShoppingBag className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <p className="font-serif-display text-lg font-bold text-[#17210E]">
                  Your bag is empty
                </p>
                <p className="text-sm text-[#4A5240]">
                  Browse the Prima collection or create a bespoke bag in your event colours.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] text-white text-sm font-semibold hover:bg-[#111B07] transition-colors"
              >
                Explore the collection
              </button>
            </div>
          ) : (
            items.map((item) => (
              <div
                key={cartLineKey(item)}
                className="bg-white rounded-2xl p-3.5 border border-[#E2DACA] flex gap-3.5 items-center"
              >
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-20 h-20 rounded-xl object-cover bg-[#E8DEC8] shrink-0"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-serif-display text-base font-bold text-[#17210E] truncate">
                    {item.name}
                  </h3>
                  {item.variantLabel && (
                    <p className="text-xs text-[#4A5240]">{item.variantLabel}</p>
                  )}
                  <p className="text-sm font-bold text-[#263E0F]">
                    {formatNaira(item.price)}
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(cartLineKey(item), item.quantity - 1)}
                      aria-label={`Decrease quantity of ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}`}
                      className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-sm font-bold w-6 text-center tabular-nums">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(cartLineKey(item), item.quantity + 1)}
                      disabled={item.quantity >= item.maxStock}
                      aria-label={`Increase quantity of ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}`}
                      className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] disabled:opacity-40 flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(cartLineKey(item))}
                      aria-label={`Remove ${item.name}${item.variantLabel ? ` (${item.variantLabel})` : ''}`}
                      className="ml-auto min-w-[44px] min-h-[44px] rounded-lg text-[#4A5240] hover:text-[#B42318] hover:bg-red-50 flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer CTA */}
        {items.length > 0 && (
          <div className="p-5 bg-white border-t border-[#E2DACA] space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#4A5240] font-medium">Subtotal</span>
              <span className="font-serif-display text-xl font-bold text-[#17210E] tabular-nums">
                {formatNaira(subtotal)}
              </span>
            </div>
            <p className="text-xs text-[#4A5240]">
              Delivery zone and bank transfer receipt upload are completed at checkout.
            </p>
            <Link
              href="/checkout"
              onClick={() => setDrawerOpen(false)}
              className="w-full min-h-[48px] rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors shadow-sm"
            >
              <span>Proceed to checkout</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
