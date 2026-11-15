import React from 'react'
import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="bg-[#111B07] text-[#CFC6B2] py-12 border-t border-[#3A5222]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="font-serif-display font-bold text-xl text-white">Crafty Cottage</div>
          <p className="text-sm">
            Bead to perfection · Hand-beaded bags and accessories
          </p>
          <p className="text-xs text-[#CFC6B2]/75">
            © 2026 Crafty Cottage. All rights reserved.
          </p>
        </div>

        <div className="flex flex-wrap gap-5 text-sm font-semibold">
          <Link href="/#shop" className="hover:text-white py-2">
            Shop
          </Link>
          <Link href="/#custom" className="hover:text-white py-2">
            Custom bag
          </Link>
          <Link href="/track" className="hover:text-white py-2">
            Track order
          </Link>
        </div>
      </div>
    </footer>
  )
}
