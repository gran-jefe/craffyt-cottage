'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingBag, Menu, X } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { isDemoMode } from '@/lib/firebase'

const NAV = [
  { href: '/#shop', label: 'Shop' },
  { href: '/#custom', label: 'Custom order' },
  { href: '/track', label: 'Track order' },
]

export function SiteHeader() {
  const { totalCount, setDrawerOpen } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <header className="sticky top-0 z-30 bg-[#FAF8F4]/95 backdrop-blur-md border-b border-[#E2DACA]">
      {isDemoMode && (
        <p role="note" className="bg-amber-100 text-amber-950 text-xs font-semibold text-center px-4 py-1.5">
          Demo mode: orders and requests stay in this browser and are not sent to Crafty Cottage.
        </p>
      )}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="min-h-[44px] min-w-0 flex flex-col justify-center">
          <span className="whitespace-nowrap font-serif-display font-semibold text-xl sm:text-[22px] leading-none tracking-[-0.01em] text-[#111B07]">
            Crafty Cottage
          </span>
          <span className="hidden min-[360px]:block whitespace-nowrap text-[11px] uppercase tracking-[0.2em] text-[#4A5240] mt-1">
            Bead to perfection
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-[44px] px-3.5 rounded-lg text-sm font-medium text-[#4A5240] hover:text-[#111B07] flex items-center transition-colors duration-150"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label={`Open shopping bag, ${totalCount} ${totalCount === 1 ? 'item' : 'items'}`}
            className="relative min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl text-[#17210E] hover:bg-[#F4EFE6] active:bg-[#E8DEC8] text-sm font-medium flex items-center justify-center gap-2 transition-colors duration-150"
          >
            <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline">Bag</span>
            {totalCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-0.5 sm:static min-w-[18px] h-[18px] px-1 rounded-full bg-[#263E0F] text-white text-[11px] font-semibold grid place-items-center tabular-nums"
              >
                {totalCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="md:hidden min-w-[44px] min-h-[44px] rounded-xl text-[#17210E] flex items-center justify-center hover:bg-[#F4EFE6] active:bg-[#E8DEC8] transition-colors duration-150"
          >
            {mobileOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label="Mobile navigation"
          className="md:hidden border-t border-[#E2DACA] bg-[#FAF8F4] px-4 pb-4"
        >
          <ul className="divide-y divide-[#E2DACA]">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="min-h-[52px] flex items-center font-serif-display text-lg text-[#111B07]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
