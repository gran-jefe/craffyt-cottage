'use client'

import React from 'react'
import { ChevronDown } from 'lucide-react'
import { COUNTRIES, POPULAR_COUNTRIES, countryByIso, countryForE164, flagOf, parsePhone } from '@/lib/phone'

interface Props {
  id: string
  label: string
  country: string
  value: string
  onCountryChange: (iso: string) => void
  onChange: (value: string) => void
  onBlur?: () => void
  error?: string
  hint?: string
  /** 'light' for cream forms, 'dark' for the teal custom-order section. */
  tone?: 'light' | 'dark'
}

const popular = POPULAR_COUNTRIES.map((iso) => countryByIso(iso))
const rest = [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name))

/**
 * Country code picker + number input. The closed picker shows just the flag and code; the
 * native select underneath gives the full searchable list on every device. Pasting a full
 * "+44…" number switches the country to match.
 */
export function PhoneField({
  id,
  label,
  country,
  value,
  onCountryChange,
  onChange,
  onBlur,
  error,
  hint,
  tone = 'light',
}: Props) {
  const current = countryByIso(country)
  const dark = tone === 'dark'
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = error ? errorId : hint ? hintId : undefined

  function handleBlur() {
    // "+447700900123" typed or pasted: move the code into the picker, keep the rest.
    const raw = value.trim()
    if (raw.startsWith('+') || raw.replace(/[\s()-]/g, '').startsWith('00')) {
      const parsed = parsePhone(raw)
      if (parsed.ok) {
        const match = countryForE164(parsed.e164, country)
        if (match) {
          onCountryChange(match.iso)
          onChange(parsed.e164.slice(1 + match.dial.length))
        }
      }
    }
    onBlur?.()
  }

  const border = error ? (dark ? 'border-[#FCA5A5]' : 'border-[#B42318] ring-1 ring-[#B42318]') : dark ? 'border-[#5F918A]' : 'border-[#8C8270]'
  const field = dark ? 'bg-[#04201F] text-white' : 'bg-[#FAF8F4] text-[#0F1F1D]'

  return (
    <div>
      <label htmlFor={id} className={`block text-xs mb-1.5 ${dark ? 'font-medium text-[#CFC6B2]' : 'font-bold text-[#0F1F1D]'}`}>
        {label}
      </label>
      <div
        className={`flex min-h-[44px] rounded-xl border ${border} ${field} focus-within:outline-2 focus-within:outline-offset-2 ${
          dark ? 'focus-within:outline-[#E6C975]' : 'focus-within:outline-[#0B3D3A]'
        }`}
      >
        <div className={`relative shrink-0 flex items-center gap-1.5 pl-3 pr-2 border-r ${dark ? 'border-[#5F918A]/60' : 'border-[#E2DACA]'}`}>
          <span aria-hidden="true" className="text-base leading-none">
            {flagOf(current.iso)}
          </span>
          <span aria-hidden="true" className="text-sm font-medium tabular-nums">
            +{current.dial}
          </span>
          <ChevronDown aria-hidden="true" className={`w-3.5 h-3.5 ${dark ? 'text-[#CFC6B2]' : 'text-[#3F4F4C]'}`} />
          {/* Transparent native select on top: full list, keyboard and screen-reader support for free. */}
          <select
            aria-label={`Country code, currently ${current.name} +${current.dial}`}
            value={current.iso}
            onChange={(e) => onCountryChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            <optgroup label="Popular">
              {popular.map((c) => (
                <option key={`p-${c.iso}`} value={c.iso}>
                  {c.name} (+{c.dial})
                </option>
              ))}
            </optgroup>
            <optgroup label="All countries">
              {rest.map((c) => (
                <option key={c.iso} value={c.iso}>
                  {c.name} (+{c.dial})
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          placeholder={current.iso === 'NG' ? '0803 123 4567' : 'Phone number'}
          className={`flex-1 min-w-0 px-3 bg-transparent text-base sm:text-sm outline-none focus-visible:shadow-none ${
            dark ? 'placeholder:text-[#93AFAA]' : 'placeholder:text-[#56625F]'
          }`}
        />
      </div>
      {error ? (
        <p id={errorId} className={`mt-1.5 text-xs leading-relaxed ${dark ? 'text-[#FCA5A5]' : 'text-[#B42318]'}`}>
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className={`mt-1.5 text-xs leading-relaxed ${dark ? 'text-[#CFC6B2]' : 'text-[#3F4F4C]'}`}>
          {hint}
        </p>
      ) : null}
    </div>
  )
}
