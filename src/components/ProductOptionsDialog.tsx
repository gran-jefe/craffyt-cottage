'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { formatNaira } from '@/lib/defaults'
import { useDialogFocus } from '@/lib/useDialogFocus'
import { uniqueOptions, variantPrice } from '@/lib/variants'
import type { Product, ProductVariant } from '@/types/store'

interface Props {
  product: Product | null
  /** Small line above the name, e.g. "Waist beads · Owambe Collection". */
  eyebrow?: string
  /** What size means for this product, e.g. "Waist size (inches)". */
  sizeLabel?: string
  onClose: () => void
  onAdd: (product: Product, variant: ProductVariant) => void
}

/** Picks the first in-stock option so the sheet never opens on something unbuyable. */
function initialSelection(variants: ProductVariant[]): { color: string; size: string } {
  const first = variants.find((v) => v.stock > 0) ?? variants[0]
  return { color: first?.color ?? '', size: first?.size ?? '' }
}

/** Numeric sizes (31, 32, 32.5) in number order; anything else keeps the admin's order. */
function orderSizes(sizes: string[]): string[] {
  const numeric = sizes.every((s) => /^\d+(\.\d+)?$/.test(s))
  return numeric ? [...sizes].sort((a, b) => Number(a) - Number(b)) : sizes
}

export function ProductOptionsDialog({ product, eyebrow, sizeLabel = 'Size', onClose, onAdd }: Props) {
  const open = Boolean(product)
  const panelRef = useDialogFocus<HTMLDivElement>(open)
  const variants = useMemo(() => product?.variants ?? [], [product])
  const colors = useMemo(() => uniqueOptions(variants, 'color'), [variants])
  const sizes = useMemo(() => orderSizes(uniqueOptions(variants, 'size')), [variants])

  const [color, setColor] = useState('')
  const [size, setSize] = useState('')

  useEffect(() => {
    if (!product) return
    const init = initialSelection(variants)
    setColor(init.color)
    setSize(init.size)
  }, [product, variants])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!product) return null

  const match = (c: string, s: string) => variants.find((v) => v.color.trim() === c && v.size.trim() === s)
  const selected = match(color, size)
  /** True when, for the chosen colour, sizes don't all cost the same. */
  const pricesVaryBySize =
    sizes.length > 1 &&
    new Set(
      sizes
        .map((s) => match(colors.length > 0 ? color : '', s))
        .filter((v): v is ProductVariant => Boolean(v))
        .map((v) => variantPrice(product, v))
    ).size > 1

  const colorInStock = (c: string) => variants.some((v) => v.color.trim() === c && v.stock > 0)
  const sizeInStock = (s: string) => {
    const v = match(colors.length > 0 ? color : '', s)
    return Boolean(v && v.stock > 0)
  }

  function chooseColor(c: string) {
    setColor(c)
    // Keep the size if it exists in the new colour; otherwise move to the first size that does.
    if (sizes.length > 0) {
      const keep = variants.find((v) => v.color.trim() === c && v.size.trim() === size && v.stock > 0)
      if (!keep) {
        const next = variants.find((v) => v.color.trim() === c && v.stock > 0) ?? variants.find((v) => v.color.trim() === c)
        if (next) setSize(next.size.trim())
      }
    }
  }

  const photo = (selected?.imageUrl || variants.find((v) => v.color.trim() === color && v.imageUrl)?.imageUrl) ?? product.imageUrl
  const price = selected ? variantPrice(product, selected) : product.price
  const stock = selected?.stock ?? 0
  const canAdd = Boolean(selected && stock > 0)

  const chip = (active: boolean, available: boolean) =>
    `min-h-[44px] px-4 rounded-full border text-sm transition-colors duration-150 inline-flex items-center gap-2 ${
      active
        ? 'bg-[#0F1F1D] border-[#0F1F1D] text-white font-semibold'
        : available
        ? 'bg-white border-[#E2DACA] text-[#0F1F1D] hover:border-[#0B3D3A] font-medium'
        : 'bg-[#F4EFE6] border-[#E2DACA] text-[#56625F] line-through font-medium'
    }`

  return (
    <div
      className="fixed inset-0 z-50 bg-[#04201F]/55 flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="options-title"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="bg-[#FAF8F4] w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl"
      >
        <div className="sm:grid sm:grid-cols-2">
          <div className="relative aspect-[4/3] sm:aspect-auto sm:min-h-full bg-[#E8DEC8]">
            <img
              src={photo}
              alt={selected ? `${product.name}, ${[selected.color, selected.size].filter(Boolean).join(' / ')}` : product.name}
              width={600}
              height={750}
              className="absolute inset-0 w-full h-full object-cover"
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close options"
              className="absolute top-3 right-3 sm:hidden min-w-[44px] min-h-[44px] rounded-full bg-[#FAF8F4]/95 text-[#0F1F1D] grid place-items-center"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          <div className="p-5 sm:p-7 flex flex-col">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#12564F]">
                  {eyebrow || product.collection}
                </p>
                <h2 id="options-title" className="mt-2 font-serif-display font-medium text-2xl leading-tight text-[#04201F]">
                  {product.name}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close options"
                className="hidden sm:grid min-w-[44px] min-h-[44px] -mr-2 -mt-2 rounded-full text-[#0F1F1D] hover:bg-[#F4EFE6] place-items-center"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-2 text-lg font-semibold text-[#0B3D3A] tabular-nums" aria-live="polite">
              {formatNaira(price)}
            </p>

            {colors.length > 0 && (
              <fieldset className="mt-6">
                <legend className="text-sm text-[#3F4F4C]">
                  Colour: <span className="font-semibold text-[#0F1F1D]">{color}</span>
                </legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {colors.map((c) => {
                    const available = colorInStock(c)
                    const thumb = variants.find((v) => v.color.trim() === c && v.imageUrl)?.imageUrl
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={c === color}
                        aria-label={available ? c : `${c}, sold out`}
                        onClick={() => chooseColor(c)}
                        className={`${chip(c === color, available)} ${thumb ? 'pl-1.5' : ''}`}
                      >
                        {thumb && (
                          <img src={thumb} alt="" width={32} height={32} className="w-8 h-8 rounded-full object-cover" />
                        )}
                        {c}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            {sizes.length > 0 && (
              <fieldset className="mt-5">
                <legend className="text-sm text-[#3F4F4C]">
                  {sizeLabel}: <span className="font-semibold text-[#0F1F1D]">{size}</span>
                </legend>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const available = sizeInStock(s)
                    const v = match(colors.length > 0 ? color : '', s)
                    const sizePrice = v ? variantPrice(product, v) : null
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={s === size}
                        aria-label={`${s}${sizePrice !== null && pricesVaryBySize ? `, ${formatNaira(sizePrice)}` : ''}${
                          available ? '' : ', not available in this colour'
                        }`}
                        onClick={() => setSize(s)}
                        className={`${chip(s === size, available)} ${pricesVaryBySize ? 'flex-col !gap-0 py-1.5 leading-tight' : ''}`}
                      >
                        <span>{s}</span>
                        {/* Bigger sizes can cost more: show each size's price right on it. */}
                        {pricesVaryBySize && sizePrice !== null && (
                          <span className={`text-[11px] tabular-nums no-underline ${s === size ? 'text-white/80' : 'text-[#3F4F4C]'}`}>
                            {formatNaira(sizePrice)}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </fieldset>
            )}

            <p className="mt-5 text-sm min-h-[20px]" aria-live="polite">
              {!selected ? (
                <span className="text-[#B42318]">This combination isn&apos;t made. Choose another option.</span>
              ) : stock <= 0 ? (
                <span className="text-[#B42318]">Sold out in this option.</span>
              ) : stock <= 2 ? (
                <span className="font-medium text-[#8A6A12]">Only {stock} left</span>
              ) : (
                <span className="text-[#3F4F4C]">In stock, ready to ship</span>
              )}
            </p>

            {product.description && (
              <p className="mt-4 text-sm text-[#3F4F4C] leading-relaxed">{product.description}</p>
            )}

            <div className="mt-auto pt-6">
            <button
              type="button"
              disabled={!canAdd}
              onClick={() => selected && onAdd(product, selected)}
              className="w-full min-h-[48px] px-6 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] active:bg-[#021817] text-white text-sm font-semibold tracking-wide transition-colors duration-150 disabled:bg-[#E8DEC8] disabled:text-[#56625F] disabled:cursor-not-allowed"
            >
              {canAdd ? `Add to bag · ${formatNaira(price)}` : 'Unavailable'}
            </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
