'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/BrandLogo'
import { ShoppingBag, Menu, X } from 'lucide-react'
import { useCart } from '@/context/CartContext'
import { isDemoMode } from '@/lib/firebase'
import { useCatalog } from '@/lib/useCatalog'

const NAV = [
  { href: '/#shop', label: 'Shop' },
  { href: '/#custom', label: 'Custom order' },
  { href: '/track', label: 'Track order' },
]

/** Wide screens show categories directly; more than this and the rest live under "Shop all". */
const MAX_HEADER_CATEGORIES = 4

const categoryHref = (id: string) => `/?category=${encodeURIComponent(id)}#shop`

export function SiteHeader() {
  const { totalCount, setDrawerOpen } = useCart()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { catalog } = useCatalog()
  const headerCategories = catalog.categories.slice(0, MAX_HEADER_CATEGORIES)
  const desktopNav = [
    ...headerCategories.map((c) => ({ href: categoryHref(c.id), label: c.name })),
    ...(catalog.categories.length > MAX_HEADER_CATEGORIES ? [{ href: '/#shop', label: 'Shop all' }] : []),
    ...NAV.slice(1),
  ]

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
        <Link href="/" aria-label="Crafty Cottage home" className="min-h-[44px] min-w-0 flex items-center text-[#0B3D3A]">
          <BrandLogo className="text-[19px] sm:text-[21px]" title="Crafty Cottage" />
        </Link>

        {/* Tablets: the short menu. Laptops and up: categories directly, one click to what they want. */}
        <nav className="hidden md:flex lg:hidden items-center gap-1" aria-label="Main navigation">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-[44px] px-3.5 rounded-lg text-sm font-medium text-[#3F4F4C] hover:text-[#04201F] flex items-center transition-colors duration-150"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <nav className="hidden lg:flex items-center gap-1" aria-label="Main navigation">
          {desktopNav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="min-h-[44px] px-3 rounded-lg text-sm font-medium text-[#3F4F4C] hover:text-[#04201F] flex items-center whitespace-nowrap transition-colors duration-150"
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
            className="relative min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-xl text-[#0F1F1D] hover:bg-[#F4EFE6] active:bg-[#E8DEC8] text-sm font-medium flex items-center justify-center gap-2 transition-colors duration-150"
          >
            <ShoppingBag className="w-5 h-5" aria-hidden="true" />
            <span className="hidden sm:inline">Bag</span>
            {totalCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute top-1 right-0.5 sm:static min-w-[18px] h-[18px] px-1 rounded-full bg-[#0B3D3A] text-white text-[11px] font-semibold grid place-items-center tabular-nums"
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
            className="md:hidden min-w-[44px] min-h-[44px] rounded-xl text-[#0F1F1D] flex items-center justify-center hover:bg-[#F4EFE6] active:bg-[#E8DEC8] transition-colors duration-150"
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
          <p className="pt-4 pb-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#12564F]">Shop</p>
          <ul className="grid grid-cols-2 gap-x-4">
            {[{ href: '/#shop', label: 'Everything' }, ...catalog.categories.map((c) => ({ href: categoryHref(c.id), label: c.name }))].map(
              (item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="min-h-[48px] flex items-center font-serif-display text-lg text-[#04201F]"
                  >
                    {item.label}
                  </Link>
                </li>
              )
            )}
          </ul>
          <ul className="mt-2 divide-y divide-[#E2DACA] border-t border-[#E2DACA]">
            {NAV.slice(1).map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className="min-h-[52px] flex items-center font-serif-display text-lg text-[#04201F]"
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
