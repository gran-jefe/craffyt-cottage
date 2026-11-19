import React from 'react'

/**
 * The Crafty Cottage wordmark, drawn as type + vector so it stays sharp at any size and takes
 * the colour of whatever it sits on (`currentColor`): white on the teal sections, teal on cream.
 * Size it with font-size (text-* classes); every part scales from that.
 *
 * Mirrors the brand logo: light, widely spaced "CRAFTY" over a heavier "COTTAGE" whose
 * double T is a cottage roof.
 */
export function BrandLogo({ className = '', title = 'Crafty Cottage' }: { className?: string; title?: string }) {
  return (
    <span role="img" aria-label={title} className={`inline-flex flex-col items-center leading-none select-none ${className}`}>
      {/* Trailing tracking would push the word off-centre; the negative margin cancels it. */}
      <span aria-hidden="true" className="font-light tracking-[0.34em] -mr-[0.34em]">
        CRAFTY
      </span>
      <span aria-hidden="true" className="mt-[0.2em] flex items-end text-[0.7em] font-semibold tracking-[0.06em]">
        <span>CO</span>
        <CottageTT className="mx-[0.02em] h-[1.18em] w-[1.5em] -mb-[0.02em]" />
        <span>AGE</span>
      </span>
    </span>
  )
}

/** The roof-shaped double T on its own: used for the favicon and tight spaces. */
export function CottageTT({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="square" className={className} aria-hidden="true">
      {/* Roof */}
      <path d="M2.5 10.5 15 2l12.5 8.5" strokeLinejoin="miter" />
      {/* Two T stems standing under it, sharing the roof as their crossbars */}
      <path d="M10.5 8.2V23M19.5 8.2V23" />
    </svg>
  )
}
