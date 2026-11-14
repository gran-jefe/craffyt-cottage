'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, Menu, X } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { isDemoMode } from '@/lib/firebase'

export function SiteHeader() {
  const { totalCount, setDrawerOpen } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F4]/95 backdrop-blur-md border-b border-[#E2DACA]">
      {isDemoMode && (
        <p role="note" className="bg-amber-100 text-amber-950 text-xs font-semibold text-center px-4 py-1.5">
          Demo mode: orders and requests stay in this browser and are not sent to the studio.
        </p>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[68px] flex items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="flex items-center gap-2.5 sm:gap-3 min-h-[44px] min-w-0 group">
          <span
            aria-hidden="true"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#263E0F] text-[#E6C975] font-serif-display font-bold text-xl sm:text-2xl grid place-items-center shrink-0"
          >
            C
          </span>
          <span>
            <span className="block whitespace-nowrap font-serif-display font-bold text-base min-[360px]:text-lg sm:text-xl leading-none text-[#17210E]">
              Crafty Cottage
            </span>
            <span className="hidden min-[360px]:block whitespace-nowrap text-xs text-[#4A5240] mt-0.5">Bead to perfection</span>
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          <Link
            href="/#shop"
            className="min-h-[44px] px-3.5 rounded-lg text-sm font-semibold text-[#4A5240] hover:text-[#263E0F] hover:bg-[#F4EFE6] flex items-center transition-colors"
          >
            Shop
          </Link>
          <Link
            href="/#custom"
            className="min-h-[44px] px-3.5 rounded-lg text-sm font-semibold text-[#4A5240] hover:text-[#263E0F] hover:bg-[#F4EFE6] flex items-center transition-colors"
          >
            Custom bag
          </Link>
          <Link
            href="/track"
            className="min-h-[44px] px-3.5 rounded-lg text-sm font-semibold text-[#4A5240] hover:text-[#263E0F] hover:bg-[#F4EFE6] flex items-center transition-colors"
          >
            Track order
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Open shopping bag with ${totalCount} items`}
            className="min-h-[44px] px-3 sm:px-4 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold flex items-center gap-2 transition-colors shadow-xs"
          >
            <ShoppingBag className="w-4 h-4 text-[#E6C975]" />
            <span className="hidden sm:inline">Bag</span>
            <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#E6C975] text-[#111B07] text-xs font-extrabold grid place-items-center tabular-nums">
              {totalCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            className="md:hidden min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] text-[#17210E] flex items-center justify-center hover:bg-[#F4EFE6]"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown */}
      {mobileOpen && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[#E2DACA] bg-[#FAF8F4] px-4 py-3 space-y-1"
        >
          <Link
            href="/#shop"
            onClick={() => setMobileOpen(false)}
            className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-[#17210E] hover:bg-[#F4EFE6] flex items-center"
          >
            Shop the collection
          </Link>
          <Link
            href="/#custom"
            onClick={() => setMobileOpen(false)}
            className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-[#17210E] hover:bg-[#F4EFE6] flex items-center"
          >
            Custom bag studio
          </Link>
          <Link
            href="/track"
            onClick={() => setMobileOpen(false)}
            className="min-h-[44px] px-3 rounded-lg text-sm font-semibold text-[#17210E] hover:bg-[#F4EFE6] flex items-center"
          >
            Track order
          </Link>
        </nav>
      )}
    </header>
  )
}
