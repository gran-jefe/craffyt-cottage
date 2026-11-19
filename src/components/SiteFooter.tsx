import React from 'react'
import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="bg-[#111B07] text-[#CFC6B2] py-12 sm:py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-8">
        <div>
          <div className="font-serif-display font-semibold text-2xl text-white">Crafty Cottage</div>
          <p className="mt-2 text-sm leading-relaxed">Hand-beaded bags and accessories, made in Nigeria.</p>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-6 text-sm font-medium">
          <Link href="/#shop" className="min-h-[44px] flex items-center hover:text-white transition-colors duration-150">
            Shop
          </Link>
          <Link href="/#custom" className="min-h-[44px] flex items-center hover:text-white transition-colors duration-150">
            Custom order
          </Link>
          <Link href="/track" className="min-h-[44px] flex items-center hover:text-white transition-colors duration-150">
            Track order
          </Link>
        </nav>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <p className="mt-8 pt-6 border-t border-[#3A5222] text-xs text-[#CFC6B2]/80">
          © 2026 Crafty Cottage. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
