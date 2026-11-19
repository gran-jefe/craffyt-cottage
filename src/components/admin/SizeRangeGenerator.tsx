'use client'

import React, { useState } from 'react'
import { ChevronDown, Ruler } from 'lucide-react'
import { formatNaira } from '@/lib/defaults'

export interface GeneratedOption {
  color: string
  size: string
  price: number
  stock: number
}

interface Props {
  /** The product's base price, used as the default price for each size. */
  basePrice: string
  sizeLabel: string
  onGenerate: (options: GeneratedOption[]) => void
}

const MAX_SIZES = 60

/** 31 → "31", 31.5 → "31.5" */
function numText(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Reads the sizes the admin typed. Any mix works: "31, 32, 34, 36", "S, M, L", or a shortcut
 * like "31-40" for every whole size in between. Duplicates are dropped; numbers are sorted.
 */
export function parseSizes(text: string): { sizes: string[]; error: string } {
  const out: string[] = []
  for (const raw of text.split(/[,\n]/)) {
    const token = raw.trim()
    if (!token) continue
    const range = token.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/i)
    if (range) {
      const a = Number(range[1])
      const b = Number(range[2])
      if (b < a) return { sizes: [], error: `"${token}": the second number must be bigger.` }
      if (b - a >= MAX_SIZES) return { sizes: [], error: `"${token}" is more than ${MAX_SIZES} sizes.` }
      for (let s = a; s <= b + 1e-9; s += 1) out.push(numText(s))
    } else {
      out.push(/^\d+(?:\.\d+)?$/.test(token) ? numText(Number(token)) : token)
    }
  }
  const unique = out.filter((s, i) => out.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i)
  if (unique.length > MAX_SIZES) return { sizes: [], error: `That's more than ${MAX_SIZES} sizes.` }
  if (unique.every((s) => /^\d+(?:\.\d+)?$/.test(s))) unique.sort((a, b) => Number(a) - Number(b))
  return { sizes: unique, error: '' }
}

/**
 * Adds a set of sizes in one go, each with its own price. Sizes don't have to follow on from
 * each other (31, 32, 34, 36 is fine) and prices don't have to rise by a fixed amount: every
 * size's price can be typed in. "Fill prices" is just a shortcut for steady increases.
 * Optional colours multiply it: 3 colours × 5 sizes = 15 options, all editable afterwards.
 */
export function SizeRangeGenerator({ basePrice, sizeLabel, onGenerate }: Props) {
  const [open, setOpen] = useState(false)
  const [sizesText, setSizesText] = useState('')
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [fillStart, setFillStart] = useState('')
  const [fillStep, setFillStep] = useState('')
  const [stock, setStock] = useState('1')
  const [colours, setColours] = useState('')
  const [error, setError] = useState('')

  const { sizes, error: sizesError } = parseSizes(sizesText)
  const colourList = colours
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c, i, all) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i)
  const priceOf = (size: string) => prices[size] ?? basePrice
  const total = sizes.length * Math.max(1, colourList.length)

  function fillPrices() {
    const start = Number(fillStart || basePrice)
    const step = Number(fillStep || 0)
    if (!(start > 0)) return setError('Enter the price of the smallest size to fill prices.')
    if (step < 0) return setError('The increase per size can’t be negative.')
    setError('')
    setPrices(Object.fromEntries(sizes.map((s, i) => [s, String(Math.round(start + step * i))])))
  }

  function generate() {
    if (sizesError) return setError(sizesError)
    if (sizes.length === 0) return setError('Type at least one size, e.g. 31, 32, 34.')
    const missing = sizes.filter((s) => !(Number(priceOf(s)) > 0))
    if (missing.length) return setError(`Enter a price for size ${missing.join(', ')}.`)
    const n = Number(stock)
    if (!Number.isInteger(n) || n < 0) return setError('Stock per option must be 0 or a whole number.')
    setError('')
    const out: GeneratedOption[] = []
    for (const color of colourList.length > 0 ? colourList : ['']) {
      for (const size of sizes) out.push({ color, size, price: Math.round(Number(priceOf(size))), stock: n })
    }
    onGenerate(out)
  }

  const field = 'w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-white text-base sm:text-sm tabular-nums'

  return (
    <div className="rounded-xl border border-dashed border-[#8C8270] bg-white">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-[44px] px-3.5 flex items-center justify-between gap-2 text-left text-sm font-semibold text-[#0B3D3A] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D3A]"
      >
        <span className="inline-flex items-center gap-2">
          <Ruler className="w-4 h-4" aria-hidden="true" />
          Add several sizes at once
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-3">
          <div>
            <label htmlFor="gen-sizes" className="block text-xs font-semibold mb-1">
              {sizeLabel}
            </label>
            <input
              id="gen-sizes"
              type="text"
              value={sizesText}
              onChange={(e) => {
                setSizesText(e.target.value)
                setError('')
              }}
              placeholder="e.g. 31, 32, 34, 36, 40"
              aria-describedby="gen-sizes-hint"
              className={field.replace(' tabular-nums', '')}
            />
            <p id="gen-sizes-hint" className="mt-1 text-xs text-[#3F4F4C] leading-relaxed">
              Only the sizes you sell, separated by commas. Letters work too (S, M, L).
            </p>
            {sizesError && <p className="mt-1 text-xs text-[#B42318]">{sizesError}</p>}
          </div>

          {sizes.length > 0 && !sizesError && (
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold mb-1">Price for each size (₦)</legend>
              <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sizes.map((s) => (
                  <li key={s} className="flex items-center gap-2">
                    <label htmlFor={`gen-price-${s}`} className="w-12 shrink-0 text-sm font-semibold text-[#0F1F1D] tabular-nums">
                      {s}
                    </label>
                    <input
                      id={`gen-price-${s}`}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={priceOf(s)}
                      placeholder="Price"
                      onChange={(e) => setPrices((p) => ({ ...p, [s]: e.target.value }))}
                      className={field}
                    />
                  </li>
                ))}
              </ul>
              {sizes.length > 1 && (
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <div className="w-28">
                    <label htmlFor="gen-fill-start" className="block text-[11px] font-semibold text-[#3F4F4C] mb-1">
                      Smallest size (₦)
                    </label>
                    <input id="gen-fill-start" type="number" inputMode="numeric" value={fillStart} placeholder={basePrice || '5000'} onChange={(e) => setFillStart(e.target.value)} className={field} />
                  </div>
                  <div className="w-28">
                    <label htmlFor="gen-fill-step" className="block text-[11px] font-semibold text-[#3F4F4C] mb-1">
                      + each size (₦)
                    </label>
                    <input id="gen-fill-step" type="number" inputMode="numeric" min="0" value={fillStep} placeholder="200" onChange={(e) => setFillStep(e.target.value)} className={field} />
                  </div>
                  <button
                    type="button"
                    onClick={fillPrices}
                    className="min-h-[44px] px-3 rounded-lg border border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#0B3D3A]/5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B3D3A]"
                  >
                    Fill prices
                  </button>
                </div>
              )}
            </fieldset>
          )}

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="gen-stock" className="block text-xs font-semibold mb-1">Stock each</label>
              <input id="gen-stock" type="number" inputMode="numeric" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className={field} />
            </div>
            <div className="col-span-2">
              <label htmlFor="gen-colours" className="block text-xs font-semibold mb-1">Colours (optional)</label>
              <input
                id="gen-colours"
                type="text"
                value={colours}
                onChange={(e) => setColours(e.target.value)}
                placeholder="e.g. Red & Gold, White Pearl"
                aria-describedby="gen-colours-hint"
                className={field.replace(' tabular-nums', '')}
              />
            </div>
          </div>
          <p id="gen-colours-hint" className="-mt-1 text-xs text-[#3F4F4C]">
            Separate colours with commas. Each colour gets every size.
          </p>

          {sizes.length > 0 && !sizesError && (
            <p className="text-xs text-[#0F1F1D] bg-[#FAF8F4] border border-[#E2DACA] rounded-lg p-2.5 leading-relaxed" aria-live="polite">
              Creates <strong>{total}</strong> {total === 1 ? 'option' : 'options'}
              {Number(priceOf(sizes[0])) > 0 && (
                <>
                  : size {sizes[0]} at <strong>{formatNaira(Number(priceOf(sizes[0])))}</strong>
                  {sizes.length > 1 && Number(priceOf(sizes[sizes.length - 1])) > 0 && (
                    <>
                      {' '}to size {sizes[sizes.length - 1]} at <strong>{formatNaira(Number(priceOf(sizes[sizes.length - 1])))}</strong>
                    </>
                  )}
                </>
              )}
              {colourList.length > 0 && <> in {colourList.length} {colourList.length === 1 ? 'colour' : 'colours'}</>}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs text-[#B42318]">
              {error}
            </p>
          )}
          <button
            type="button"
            onClick={generate}
            className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0B3D3A]"
          >
            {total > 0 && !sizesError ? `Add ${total} ${total === 1 ? 'option' : 'options'}` : 'Add these sizes'}
          </button>
        </div>
      )}
    </div>
  )
}
