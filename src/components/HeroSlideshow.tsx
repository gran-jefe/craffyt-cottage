'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { formatNaira } from '@/lib/defaults'
import { priceRange } from '@/lib/variants'
import type { Product } from '@/types/store'

interface Props {
  pieces: Product[]
  loading: boolean
  /** Show this piece in the shop grid. */
  onView: (p: Product) => void
}

const INTERVAL_MS = 5000

/**
 * Featured pieces, one at a time. Advances every 5 seconds; stops while hovered or focused,
 * when paused, and entirely for visitors who ask for reduced motion (WCAG 2.2.2). Swipe on
 * touch, arrow keys when focused.
 */
export function HeroSlideshow({ pieces, loading, onView }: Props) {
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = pieces.length

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Products can change under us (refresh, admin edits): keep the index in range.
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0)
  }, [count, index])

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count])

  const autoplay = count > 1 && !paused && !hovering && !focused && !reducedMotion
  useEffect(() => {
    if (!autoplay) return
    const t = window.setTimeout(() => go(index + 1), INTERVAL_MS)
    return () => window.clearTimeout(t)
  }, [autoplay, index, go])

  if (loading) {
    return (
      <div className="w-full max-w-[320px] lg:w-[320px]" aria-busy="true" aria-label="Loading featured pieces">
        <div className="aspect-square rounded-2xl bg-white/[0.06] animate-pulse" />
        <div className="mt-4 h-5 w-1/2 rounded bg-white/[0.06]" />
        <div className="mt-2 h-4 w-1/4 rounded bg-white/[0.06]" />
      </div>
    )
  }
  if (count === 0) return null

  const control =
    'w-11 h-11 rounded-full border border-white/20 text-[#FAF8F4] hover:border-[#E6C975] hover:text-[#E6C975] active:bg-white/10 inline-flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C975]'

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured pieces"
      className="w-full max-w-[320px] lg:w-[320px]"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1)
        if (e.key === 'ArrowLeft') go(index - 1)
      }}
    >
      <div
        className="relative aspect-square"
        aria-live={autoplay ? 'off' : 'polite'}
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX
        }}
        onTouchEnd={(e) => {
          if (touchX.current === null) return
          const dx = e.changedTouches[0].clientX - touchX.current
          touchX.current = null
          if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1))
        }}
      >
        {pieces.map((p, i) => {
          const active = i === index
          const range = priceRange(p)
          return (
            <div
              key={p.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={!active}
              className={`absolute inset-0 transition-opacity duration-300 motion-reduce:transition-none ${
                active ? 'opacity-100' : 'opacity-0 pointer-events-none'
              }`}
            >
              <button
                type="button"
                tabIndex={active ? 0 : -1}
                onClick={() => onView(p)}
                aria-label={`${p.name}, ${range.min !== range.max ? `from ${formatNaira(range.min)}` : formatNaira(range.min)}. View in the shop`}
                className="group block w-full h-full rounded-2xl overflow-hidden bg-[#0B3D3A] ring-1 ring-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C975] focus-visible:ring-offset-4 focus-visible:ring-offset-[#062E2C]"
              >
                <img
                  src={p.imageUrl}
                  alt=""
                  width={320}
                  height={320}
                  loading={i === 0 ? 'eager' : 'lazy'}
                  className="w-full h-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.03]"
                />
              </button>
            </div>
          )
        })}
      </div>

      {/* Caption for the current piece, then the controls */}
      <div className="mt-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-serif-display text-lg leading-snug text-white truncate">{pieces[index]?.name}</p>
          <p className="text-sm text-[#CFC6B2] tabular-nums">
            {(() => {
              const r = pieces[index] ? priceRange(pieces[index]) : null
              if (!r) return ''
              return r.min !== r.max ? `From ${formatNaira(r.min)}` : formatNaira(r.min)
            })()}
          </p>
        </div>
        {count > 1 && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={() => go(index - 1)} aria-label="Previous piece" className={control}>
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Next piece" className={control}>
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {count > 1 && (
        <div className="mt-1 flex items-center justify-between">
          <div className="flex -ml-3" role="group" aria-label="Choose a piece">
            {pieces.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`Show ${p.name}`}
                aria-current={i === index ? 'true' : undefined}
                className="w-7 h-11 inline-flex items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C975]"
              >
                <span
                  aria-hidden="true"
                  className={`block h-1.5 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                    i === index ? 'w-5 bg-[#E6C975]' : 'w-1.5 bg-white/35'
                  }`}
                />
              </button>
            ))}
          </div>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused((v) => !v)}
              aria-label={paused ? 'Play slideshow' : 'Pause slideshow'}
              className="w-11 h-11 -mr-2 rounded-full text-[#CFC6B2] hover:text-[#E6C975] inline-flex items-center justify-center transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6C975]"
            >
              {paused ? <Play className="w-4 h-4" aria-hidden="true" /> : <Pause className="w-4 h-4" aria-hidden="true" />}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
