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
  /** The product's base price, used as the default price for the smallest size. */
  basePrice: string
  sizeLabel: string
  onGenerate: (options: GeneratedOption[]) => void
}

/** 31 → "31", 31.5 → "31.5" */
function sizeText(n: number): string {
  return String(Math.round(n * 100) / 100)
}

/**
 * Builds a run of sizes in one go, e.g. waist beads 31 to 40 where each size up costs a
 * little more. Optional colours multiply it: 3 colours × 10 sizes = 30 options.
 * Everything it creates can still be edited row by row afterwards.
 */
export function SizeRangeGenerator({ basePrice, sizeLabel, onGenerate }: Props) {
  const [open, setOpen] = useState(false)
  const [from, setFrom] = useState('31')
  const [to, setTo] = useState('40')
  const [step, setStep] = useState('1')
  const [startPrice, setStartPrice] = useState('')
  const [increase, setIncrease] = useState('0')
  const [stock, setStock] = useState('1')
  const [colours, setColours] = useState('')
  const [error, setError] = useState('')

  const start = Number(from)
  const end = Number(to)
  const stepN = Number(step)
  const price0 = Number(startPrice || basePrice)
  const inc = Number(increase || 0)
  const colourList = colours
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .filter((c, i, all) => all.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i)

  const valid =
    Number.isFinite(start) && Number.isFinite(end) && stepN > 0 && end >= start && price0 > 0 && inc >= 0
  const sizes: number[] = []
  if (valid) for (let s = start; s <= end + 1e-9 && sizes.length <= 60; s += stepN) sizes.push(s)
  const total = sizes.length * Math.max(1, colourList.length)
  const priceAt = (i: number) => Math.round(price0 + inc * i)

  function generate() {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return setError('"To" must be the same as or bigger than "From".')
    if (!(stepN > 0)) return setError('Step must be above 0, e.g. 1 for every size or 2 for every other size.')
    if (!(price0 > 0)) return setError('Enter the price for the smallest size, or set the base price above first.')
    if (inc < 0) return setError('Increase per size can’t be negative.')
    if (sizes.length > 60) return setError('That’s more than 60 sizes. Narrow the range or use a bigger step.')
    const n = Number(stock)
    if (!Number.isInteger(n) || n < 0) return setError('Stock per option must be 0 or a whole number.')
    setError('')
    const out: GeneratedOption[] = []
    for (const color of colourList.length > 0 ? colourList : ['']) {
      sizes.forEach((s, i) => out.push({ color, size: sizeText(s), price: priceAt(i), stock: n }))
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
        className="w-full min-h-[44px] px-3.5 flex items-center justify-between gap-2 text-left text-sm font-semibold text-[#0B3D3A]"
      >
        <span className="inline-flex items-center gap-2">
          <Ruler className="w-4 h-4" aria-hidden="true" />
          Add a range of sizes
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 space-y-3">
          <p className="text-xs text-[#3F4F4C] leading-relaxed">
            For pieces sold by {sizeLabel.toLowerCase()}: set the range and how much each size up costs. You can still
            edit any row afterwards.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="gen-from" className="block text-xs font-semibold mb-1">From</label>
              <input id="gen-from" type="number" inputMode="decimal" value={from} onChange={(e) => setFrom(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="gen-to" className="block text-xs font-semibold mb-1">To</label>
              <input id="gen-to" type="number" inputMode="decimal" value={to} onChange={(e) => setTo(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="gen-step" className="block text-xs font-semibold mb-1">Step</label>
              <input id="gen-step" type="number" inputMode="decimal" min="0.5" step="0.5" value={step} onChange={(e) => setStep(e.target.value)} className={field} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label htmlFor="gen-price" className="block text-xs font-semibold mb-1">Price, smallest (₦)</label>
              <input
                id="gen-price"
                type="number"
                inputMode="numeric"
                value={startPrice}
                placeholder={basePrice || '5000'}
                onChange={(e) => setStartPrice(e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="gen-inc" className="block text-xs font-semibold mb-1">+ per size (₦)</label>
              <input id="gen-inc" type="number" inputMode="numeric" min="0" value={increase} onChange={(e) => setIncrease(e.target.value)} className={field} />
            </div>
            <div>
              <label htmlFor="gen-stock" className="block text-xs font-semibold mb-1">Stock each</label>
              <input id="gen-stock" type="number" inputMode="numeric" min="0" value={stock} onChange={(e) => setStock(e.target.value)} className={field} />
            </div>
          </div>
          <div>
            <label htmlFor="gen-colours" className="block text-xs font-semibold mb-1">Colours (optional)</label>
            <input
              id="gen-colours"
              type="text"
              value={colours}
              onChange={(e) => setColours(e.target.value)}
              placeholder="e.g. Red & Gold, White Pearl, Emerald"
              aria-describedby="gen-colours-hint"
              className={field.replace(' tabular-nums', '')}
            />
            <p id="gen-colours-hint" className="mt-1 text-xs text-[#3F4F4C]">
              Separate with commas. Each colour gets every size.
            </p>
          </div>

          {valid && sizes.length > 0 && sizes.length <= 60 && (
            <p className="text-xs text-[#0F1F1D] bg-[#FAF8F4] border border-[#E2DACA] rounded-lg p-2.5 leading-relaxed" aria-live="polite">
              Creates <strong>{total}</strong> {total === 1 ? 'option' : 'options'}: size {sizeText(sizes[0])} at{' '}
              <strong>{formatNaira(priceAt(0))}</strong>
              {sizes.length > 1 && (
                <>
                  {' '}up to size {sizeText(sizes[sizes.length - 1])} at <strong>{formatNaira(priceAt(sizes.length - 1))}</strong>
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
            className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold"
          >
            Add these sizes
          </button>
        </div>
      )}
    </div>
  )
}
