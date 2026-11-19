'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Palette,
  MessageCircle,
  Check,
  Search,
  Phone,
  Camera,
  Loader2,
  PackageX,
  ArrowRight,
  AlertCircle,
} from 'lucide-react'
import { fetchProducts, fetchStoreSettings, createBespokeRequest } from '@/lib/storeService'
import {
  BESPOKE_BEADS,
  BESPOKE_SHAPES,
  DEFAULT_STORE_SETTINGS,
  formatNaira,
  formatNigerianPhone,
  instagramUrl,
} from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import { parsePhone } from '@/lib/phone'
import { hasVariants, priceRange, uniqueOptions } from '@/lib/variants'
import { ProductOptionsDialog } from '@/components/ProductOptionsDialog'
import type { Product, StoreSettings } from '@/types/store'

/** "3 colours · 2 sizes" for the product card. */
function optionsSummary(p: Product): string {
  if (!hasVariants(p)) return ''
  const colors = uniqueOptions(p.variants, 'color').length
  const sizes = uniqueOptions(p.variants, 'size').length
  return [
    colors > 1 ? `${colors} colours` : '',
    sizes > 1 ? `${sizes} sizes` : '',
  ]
    .filter(Boolean)
    .join(' · ')
}

function validateName(v: string): string | undefined {
  return v.trim().length < 2 ? 'Enter your name so we can follow up.' : undefined
}

function validatePhone(v: string): string | undefined {
  const phone = parsePhone(v)
  return phone.ok ? undefined : phone.error
}

export function StorefrontClient() {
  const { addItem, setDrawerOpen, showToast } = useCart()
  // Only ever show products the studio has actually published: no seeded stand-ins with invented stock.
  const [products, setProducts] = useState<Product[]>([])
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [catalogueError, setCatalogueError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Catalog filters
  const [selectedCollection, setSelectedCollection] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [optionsFor, setOptionsFor] = useState<Product | null>(null)

  // Bespoke studio form
  const [shapeId, setShapeId] = useState(BESPOKE_SHAPES[0].id)
  const [beadId, setBeadId] = useState(BESPOKE_BEADS[0].id)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [bespokeSubmitting, setBespokeSubmitting] = useState(false)
  const [bespokeSubmitted, setBespokeSubmitted] = useState(false)
  const [bespokeError, setBespokeError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({})

  useEffect(() => {
    let active = true
    setLoadingProducts(true)
    setCatalogueError(false)
    fetchProducts(false)
      .then((prods) => {
        if (active) setProducts(prods)
      })
      .catch(() => {
        if (!active) return
        setProducts([])
        setCatalogueError(true)
      })
      .finally(() => {
        if (active) setLoadingProducts(false)
      })
    // Contact details only; the storefront can fall back to defaults if this fails.
    fetchStoreSettings()
      .then((cfg) => {
        if (active && cfg) setSettings(cfg)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [reloadKey])

  const collections = useMemo(() => {
    const names = Array.from(new Set(products.map((p) => p.collection).filter(Boolean)))
    return ['All', ...names]
  }, [products])

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return products.filter((p) => {
      const matchesCol = selectedCollection === 'All' || p.collection === selectedCollection
      const matchesQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        (p.variants ?? []).some((v) => `${v.color} ${v.size}`.toLowerCase().includes(q))
      return matchesCol && matchesQ
    })
  }, [products, selectedCollection, searchQuery])

  const selectedShape = BESPOKE_SHAPES.find((s) => s.id === shapeId) || BESPOKE_SHAPES[0]
  const selectedBead = BESPOKE_BEADS.find((b) => b.id === beadId) || BESPOKE_BEADS[0]
  const bespokeTotal = selectedShape.price + selectedBead.extra

  async function handleBespokeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBespokeError('')
    const nameErr = validateName(customerName)
    const phoneErr = validatePhone(customerPhone)
    setFieldErrors({ name: nameErr, phone: phoneErr })
    if (nameErr || phoneErr) {
      document.getElementById(nameErr ? 'bespoke-name' : 'bespoke-phone')?.focus()
      return
    }

    setBespokeSubmitting(true)
    try {
      const phone = parsePhone(customerPhone)
      await createBespokeRequest({
        customerName,
        customerPhone: phone.ok ? phone.e164 : customerPhone.trim(),
        shape: selectedShape.name,
        beadColour: selectedBead.name,
        estimatedPrice: bespokeTotal,
        notes,
      })
      setBespokeSubmitted(true)
      showToast('Custom bag request sent to Crafty Cottage.')
    } catch {
      setBespokeError('Could not save your request right now. Please try again or use WhatsApp.')
    } finally {
      setBespokeSubmitting(false)
    }
  }

  const whatsappSpecUrl = `https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
    `Hello Crafty Cottage, I'd like to discuss a custom ${selectedShape.name} in ${selectedBead.name} (Est. ${formatNaira(bespokeTotal)}). ${notes}`
  )}`

  const optionBase =
    'min-h-[56px] p-3 rounded-xl border text-left flex items-center gap-3 transition-colors duration-150'
  const optionState = (checked: boolean) =>
    checked
      ? 'bg-[#263E0F] border-[#E6C975]'
      : 'bg-[#111B07] border-[#7E9364] hover:border-[#E6C975] active:bg-[#1A2A0C]'

  return (
    <main>
      {/* HERO */}
      <section className="border-b border-[#E2DACA]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 sm:pt-14 sm:pb-16 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#355416]">
              The Prima Collection
            </p>
            <h1 className="mt-4 font-serif-display font-medium text-[40px] sm:text-5xl lg:text-[56px] leading-[1.06] tracking-[-0.01em] text-[#111B07]">
              Hand-beaded bags,{' '}
              <em className="italic text-[#355416]">made in Nigeria.</em>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[#4A5240] leading-relaxed max-w-md">
              Sculptural heart bags, pearl carryalls and fringe clutches, beaded piece by piece. Shop
              ready-to-ship, or commission one in your event colours.
            </p>

            <div className="mt-8 flex flex-col min-[400px]:flex-row min-[400px]:items-center gap-2 min-[400px]:gap-6">
              <a
                href="#shop"
                className="min-h-[48px] px-7 rounded-xl bg-[#263E0F] hover:bg-[#111B07] active:bg-[#0B1204] text-white text-sm font-semibold tracking-wide inline-flex items-center justify-center transition-colors duration-150"
              >
                Shop the collection
              </a>
              <a
                href="#custom"
                className="min-h-[44px] inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-[#263E0F] underline-offset-4 hover:underline"
              >
                <span>Commission a custom piece</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            <ul className="mt-10 pt-6 border-t border-[#E2DACA] flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-[#4A5240]">
              {['Beaded by hand', 'Pay by bank transfer', 'Delivery across Nigeria'].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span aria-hidden="true" className="w-1 h-1 rounded-full bg-[#8A6A12]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Editorial composition: one tall piece, two supporting */}
          <figure className="lg:col-span-6">
            <a
              href="#shop"
              aria-label="Shop the Prima Collection"
              className="grid grid-cols-[3fr_2fr] gap-3 sm:gap-4"
            >
              <span className="block aspect-[4/5] rounded-xl overflow-hidden bg-[#E8DEC8]">
                <img
                  src="/images/products/dupree-gold.jpg"
                  alt="Dupree Midi heart bag in gold beads"
                  width={600}
                  height={750}
                  className="w-full h-full object-cover"
                />
              </span>
              <span className="grid grid-rows-2 gap-3 sm:gap-4">
                <span className="block rounded-xl overflow-hidden bg-[#E8DEC8]">
                  <img
                    src="/images/products/pearly.jpg"
                    alt="Pearly handbag with oversized faux pearls"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </span>
                <span className="block rounded-xl overflow-hidden bg-[#E8DEC8]">
                  <img
                    src="/images/products/first-lady.jpg"
                    alt="First Lady loop-fringe clutch"
                    width={400}
                    height={400}
                    className="w-full h-full object-cover"
                  />
                </span>
              </span>
            </a>
            <figcaption className="mt-3 text-xs text-[#4A5240]">
              Prima pieces from <span className="font-semibold text-[#17210E]">₦35,000</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* SHOP CATALOG */}
      <section id="shop" className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 mb-6 sm:mb-8">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#355416]">
                Ready to ship
              </p>
              <h2 className="mt-3 font-serif-display font-medium text-3xl sm:text-4xl tracking-[-0.01em] text-[#111B07]">
                The collection
              </h2>
              <p className="mt-2 text-sm text-[#4A5240] leading-relaxed">
                Add pieces to your bag and pay by bank transfer at checkout.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <Search
                aria-hidden="true"
                className="w-4 h-4 text-[#4A5240] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <label htmlFor="catalog-search" className="sr-only">
                Search bags and accessories
              </label>
              <input
                id="catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bags, pearls..."
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-white border border-[#E2DACA] hover:border-[#C9BEA6] text-sm text-[#17210E] placeholder:text-[#5E6654] transition-colors duration-150"
              />
            </div>
          </div>

          {/* Collection filters: one swipeable row on mobile */}
          {collections.length > 1 && (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mb-8 overflow-x-auto no-scrollbar">
              <div className="flex gap-2 w-max" role="group" aria-label="Filter by collection">
                {collections.map((col) => {
                  const active = col === selectedCollection
                  return (
                    <button
                      key={col}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCollection(col)}
                      className={`min-h-[44px] px-4 rounded-full whitespace-nowrap text-sm font-medium border transition-colors duration-150 ${
                        active
                          ? 'bg-[#17210E] text-white border-[#17210E]'
                          : 'bg-transparent text-[#4A5240] border-[#E2DACA] hover:border-[#263E0F] hover:text-[#263E0F]'
                      }`}
                    >
                      {col}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {catalogueError && !loadingProducts ? (
            <div
              role="alert"
              className="bg-white rounded-2xl border border-amber-300 py-14 px-6 text-center"
            >
              <AlertCircle className="w-7 h-7 text-amber-800 mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#17210E]">
                We couldn&apos;t load the collection
              </h3>
              <p className="mt-2 text-sm text-[#4A5240] leading-relaxed max-w-md mx-auto">
                This is usually a connection problem. Try again, or message us on WhatsApp to order directly.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-semibold transition-colors duration-150"
                >
                  Try again
                </button>
                <a
                  href={`https://wa.me/${settings.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-5 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-sm font-semibold inline-flex items-center gap-2 transition-colors duration-150"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Order on WhatsApp</span>
                </a>
              </div>
            </div>
          ) : loadingProducts ? (
            <div
              className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-10 sm:gap-x-6"
              aria-busy="true"
              aria-label="Loading the collection"
            >
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="animate-pulse">
                  <div className="aspect-[4/5] rounded-xl bg-[#E8DEC8]" />
                  <div className="mt-4 h-5 bg-[#E8DEC8] rounded-md w-3/4" />
                  <div className="mt-2 h-4 bg-[#F4EFE6] rounded-md w-1/3" />
                  <div className="mt-4 h-11 bg-[#F4EFE6] rounded-xl" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2DACA] py-14 px-6 text-center">
              <Palette className="w-7 h-7 text-[#263E0F] mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#17210E]">
                New pieces are being beaded
              </h3>
              <p className="mt-2 text-sm text-[#4A5240] leading-relaxed max-w-md mx-auto">
                Every ready-to-ship bag has found a home. You can still order one made in your colours.
              </p>
              <a
                href="#custom"
                className="mt-6 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-semibold transition-colors duration-150"
              >
                Design a custom bag
              </a>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2DACA] py-14 px-6 text-center">
              <PackageX className="w-7 h-7 text-[#4A5240] mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#17210E]">
                No matching pieces found
              </h3>
              <p className="mt-2 text-sm text-[#4A5240] leading-relaxed max-w-md mx-auto">
                Try clearing your search or switching back to all collections.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCollection('All')
                  setSearchQuery('')
                }}
                className="mt-6 min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-semibold transition-colors duration-150"
              >
                Show all pieces
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-3 gap-y-10 sm:gap-x-6">
              {filteredProducts.map((product) => {
                const soldOut = product.stock <= 0
                const withOptions = hasVariants(product)
                // For options, "only N left" would mislead: N is spread across colours and sizes.
                const lowStock = !withOptions && product.stock > 0 && product.stock <= 2
                const range = priceRange(product)
                const summary = optionsSummary(product)

                return (
                  <article key={product.id} className="group flex flex-col">
                    <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#E8DEC8]">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        width={600}
                        height={750}
                        loading="lazy"
                        className={`w-full h-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.03] ${
                          soldOut ? 'opacity-60 grayscale' : ''
                        }`}
                      />
                      {product.tag && !soldOut && (
                        <span className="absolute top-2 left-2 sm:top-3 sm:left-3 max-w-[calc(100%-1rem)] truncate bg-[#FAF8F4]/95 text-[#17210E] text-xs font-medium px-2 py-1 rounded-md">
                          {product.tag}
                        </span>
                      )}
                      {soldOut && (
                        <span className="absolute inset-x-0 bottom-0 bg-[#17210E]/85 text-white text-xs font-semibold uppercase tracking-[0.14em] text-center py-2">
                          Sold out
                        </span>
                      )}
                    </div>

                    <div className="pt-3 sm:pt-4 flex-1 flex flex-col">
                      <h3 className="font-serif-display text-[17px] sm:text-lg font-medium leading-snug text-[#17210E]">
                        {product.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                        <p className="text-sm sm:text-[15px] font-semibold text-[#263E0F] tabular-nums">
                          {range.min !== range.max ? `From ${formatNaira(range.min)}` : formatNaira(range.min)}
                        </p>
                        {lowStock && (
                          <p className="text-xs font-medium text-[#8A6A12]">Only {product.stock} left</p>
                        )}
                      </div>
                      {summary && <p className="mt-1 text-xs text-[#4A5240]">{summary}</p>}
                      <p className="hidden sm:block mt-2 text-[13px] text-[#4A5240] leading-relaxed line-clamp-2">
                        {product.description}
                      </p>

                      <div className="mt-auto pt-3 sm:pt-4">
                        <button
                          type="button"
                          disabled={soldOut}
                          aria-label={
                            soldOut
                              ? `${product.name} is sold out`
                              : withOptions
                              ? `Choose options for ${product.name}`
                              : `Add ${product.name} to bag`
                          }
                          aria-haspopup={withOptions ? 'dialog' : undefined}
                          onClick={() => {
                            if (withOptions) {
                              setOptionsFor(product)
                              return
                            }
                            addItem(product, 1)
                            setDrawerOpen(true)
                          }}
                          className={`w-full min-h-[44px] px-3 rounded-xl border text-sm font-semibold transition-colors duration-150 ${
                            soldOut
                              ? 'bg-[#F4EFE6] text-[#5E6654] border-[#E2DACA] cursor-not-allowed'
                              : 'border-[#263E0F] text-[#263E0F] hover:bg-[#263E0F] hover:text-white active:bg-[#111B07] active:text-white'
                          }`}
                        >
                          {soldOut ? 'Sold out' : withOptions ? 'Choose options' : 'Add to bag'}
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* MADE TO ORDER */}
      <section id="custom" className="py-16 sm:py-24 bg-[#1A2A0C] text-[#F4EFE6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10 sm:mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#E6C975]">
              Made to order
            </p>
            <h2 className="mt-3 font-serif-display font-medium text-3xl sm:text-4xl tracking-[-0.01em] text-white">
              A bag in your colours
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#CFC6B2] leading-relaxed">
              Planning a wedding, aso-ebi or milestone celebration? Choose a silhouette and bead finish, and
              we&apos;ll confirm the shade and timeline with you directly.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <form onSubmit={handleBespokeSubmit} className="lg:col-span-7 space-y-9" noValidate>
              <fieldset>
                <legend className="mb-4 flex items-baseline gap-3">
                  <span className="font-serif-display italic text-lg text-[#E6C975]" aria-hidden="true">
                    01
                  </span>
                  <span className="text-sm font-semibold tracking-wide text-white">Choose a shape</span>
                </legend>
                <div className="grid grid-cols-2 gap-2.5">
                  {BESPOKE_SHAPES.map((s) => {
                    const checked = s.id === shapeId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setShapeId(s.id)}
                        className={`${optionBase} justify-between ${optionState(checked)}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-white leading-snug">{s.name}</span>
                          <span className="block text-xs text-[#CFC6B2] tabular-nums mt-0.5">
                            From {formatNaira(s.price)}
                          </span>
                        </span>
                        {checked && <Check className="w-4 h-4 text-[#E6C975] shrink-0" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-4 flex items-baseline gap-3">
                  <span className="font-serif-display italic text-lg text-[#E6C975]" aria-hidden="true">
                    02
                  </span>
                  <span className="text-sm font-semibold tracking-wide text-white">Choose a bead finish</span>
                </legend>
                <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2.5">
                  {BESPOKE_BEADS.map((b) => {
                    const checked = b.id === beadId
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setBeadId(b.id)}
                        className={`${optionBase} ${optionState(checked)}`}
                      >
                        <span
                          aria-hidden="true"
                          className="w-6 h-6 rounded-full border border-white/40 shrink-0"
                          style={{ background: b.swatch }}
                        />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-semibold text-white leading-snug">{b.name}</span>
                          <span className="block text-xs text-[#CFC6B2] tabular-nums mt-0.5">
                            {b.extra > 0 ? `+${formatNaira(b.extra)}` : 'No extra cost'}
                          </span>
                        </span>
                        {checked && <Check className="w-4 h-4 text-[#E6C975] shrink-0" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <fieldset className="space-y-4">
                <legend className="mb-4 flex items-baseline gap-3">
                  <span className="font-serif-display italic text-lg text-[#E6C975]" aria-hidden="true">
                    03
                  </span>
                  <span className="text-sm font-semibold tracking-wide text-white">Your details</span>
                </legend>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="bespoke-name" className="block text-xs font-medium text-[#CFC6B2] mb-1.5">
                      Full name *
                    </label>
                    <input
                      id="bespoke-name"
                      type="text"
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value)
                        if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: validateName(e.target.value) }))
                      }}
                      onBlur={() => customerName && setFieldErrors((f) => ({ ...f, name: validateName(customerName) }))}
                      aria-invalid={Boolean(fieldErrors.name)}
                      aria-describedby={fieldErrors.name ? 'bespoke-name-error' : undefined}
                      placeholder="e.g. Tolu Adeyemi"
                      className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#111B07] border text-base sm:text-sm text-white placeholder:text-[#A9B39A] ${
                        fieldErrors.name ? 'border-[#FCA5A5]' : 'border-[#7E9364]'
                      }`}
                    />
                    {fieldErrors.name && (
                      <p id="bespoke-name-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="bespoke-phone" className="block text-xs font-medium text-[#CFC6B2] mb-1.5">
                      Phone or WhatsApp number *
                    </label>
                    <input
                      id="bespoke-phone"
                      type="tel"
                      autoComplete="tel"
                      value={customerPhone}
                      onChange={(e) => {
                        setCustomerPhone(e.target.value)
                        if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: validatePhone(e.target.value) }))
                      }}
                      onBlur={() => customerPhone && setFieldErrors((f) => ({ ...f, phone: validatePhone(customerPhone) }))}
                      aria-invalid={Boolean(fieldErrors.phone)}
                      aria-describedby={fieldErrors.phone ? 'bespoke-phone-error' : undefined}
                      placeholder="e.g. 0803 000 0000 or +44 7700 900123"
                      className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#111B07] border text-base sm:text-sm text-white placeholder:text-[#A9B39A] ${
                        fieldErrors.phone ? 'border-[#FCA5A5]' : 'border-[#7E9364]'
                      }`}
                    />
                    {fieldErrors.phone && (
                      <p id="bespoke-phone-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="bespoke-notes" className="block text-xs font-medium text-[#CFC6B2] mb-1.5">
                    Event date and colour notes (optional)
                  </label>
                  <textarea
                    id="bespoke-notes"
                    rows={3}
                    maxLength={400}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Wedding on 14 December, prefer a silver chain strap"
                    className="w-full p-3.5 rounded-xl bg-[#111B07] border border-[#7E9364] text-base sm:text-sm text-white placeholder:text-[#A9B39A] leading-relaxed"
                  />
                </div>
              </fieldset>

              {/* Mobile and tablet: the estimate sits right above the action it informs */}
              <div className="lg:hidden flex items-baseline justify-between gap-4 pt-5 border-t border-[#3A5222]">
                <span className="text-sm text-[#CFC6B2]">
                  {selectedShape.name}, {selectedBead.name}
                </span>
                <span className="font-serif-display text-2xl text-[#E6C975] tabular-nums shrink-0">
                  {formatNaira(bespokeTotal)}
                </span>
              </div>

              {bespokeError && (
                <p
                  role="alert"
                  className="flex items-start gap-2 text-sm text-red-200 bg-red-950/60 border border-red-400/40 px-4 py-3 rounded-xl"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  {bespokeError}
                </p>
              )}

              {bespokeSubmitted ? (
                <div role="status" className="bg-[#263E0F] border border-[#E6C975]/60 p-5 rounded-xl text-sm text-[#FAF8F4]">
                  <p className="font-semibold text-[#E6C975]">Request received</p>
                  <p className="mt-1 leading-relaxed">
                    We have your {selectedShape.name} in {selectedBead.name} and will contact you on{' '}
                    {customerPhone}.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setBespokeSubmitted(false)
                      setNotes('')
                    }}
                    className="mt-4 min-h-[44px] px-4 rounded-xl border border-[#E6C975]/60 text-[#FAF8F4] hover:bg-[#1A2A0C] text-sm font-semibold transition-colors duration-150"
                  >
                    Design another bag
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                  <button
                    type="submit"
                    disabled={bespokeSubmitting}
                    className="w-full sm:w-auto min-h-[48px] px-7 rounded-xl bg-[#E6C975] hover:bg-[#F1DA9A] active:bg-[#D9B95C] text-[#111B07] text-sm font-semibold tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {bespokeSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>Sending request...</span>
                      </>
                    ) : (
                      <span>Send custom request</span>
                    )}
                  </button>
                  <a
                    href={whatsappSpecUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="lg:hidden min-h-[44px] inline-flex items-center justify-center gap-2 text-sm font-semibold text-[#FAF8F4] underline-offset-4 hover:underline"
                  >
                    <MessageCircle className="w-4 h-4 text-[#B8F0CF]" aria-hidden="true" />
                    <span>Or chat on WhatsApp</span>
                  </a>
                </div>
              )}
            </form>

            {/* Desktop summary */}
            <aside className="hidden lg:block lg:col-span-5 bg-[#111B07] border border-[#3A5222] rounded-2xl p-7 lg:sticky lg:top-24">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#CFC6B2]">Your piece</p>

              <dl className="mt-5 space-y-4">
                <div>
                  <dt className="text-xs text-[#CFC6B2]">Silhouette</dt>
                  <dd className="mt-0.5 font-serif-display text-xl text-white">{selectedShape.name}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#CFC6B2]">Bead finish</dt>
                  <dd className="mt-0.5 font-serif-display text-xl text-white">{selectedBead.name}</dd>
                </div>
              </dl>

              <div className="mt-6 pt-6 border-t border-[#3A5222]">
                <span className="text-xs text-[#CFC6B2] block">Estimated price</span>
                <span className="mt-1 block font-serif-display text-4xl text-[#E6C975] tabular-nums">
                  {formatNaira(bespokeTotal)}
                </span>
                <p className="mt-2 text-xs text-[#CFC6B2] leading-relaxed">
                  We confirm the final shade and timeline once we review your request.
                </p>
              </div>

              <a
                href={whatsappSpecUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-6 w-full min-h-[44px] px-4 rounded-xl border border-[#3A5222] hover:border-[#E6C975] text-sm font-semibold text-[#FAF8F4] flex items-center justify-center gap-2 transition-colors duration-150"
              >
                <MessageCircle className="w-4 h-4 text-[#B8F0CF]" aria-hidden="true" />
                <span>Chat on WhatsApp</span>
              </a>
            </aside>
          </div>
        </div>
      </section>

      <ProductOptionsDialog
        product={optionsFor}
        onClose={() => setOptionsFor(null)}
        onAdd={(product, variant) => {
          addItem(product, 1, variant)
          setOptionsFor(null)
          setDrawerOpen(true)
        }}
      />

      {/* STORY & CONTACT */}
      <section className="py-16 sm:py-24 bg-[#F4EFE6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <figure className="lg:col-span-7">
            <blockquote className="font-serif-display italic text-2xl sm:text-[32px] leading-snug text-[#111B07]">
              “A bead haven where creativity meets simplicity. We source beads that are skin-friendly and
              fabric-friendly, so every piece helps you stand out.”
            </blockquote>
            <figcaption className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#4A5240]">
              Crafty Cottage · Handmade in Nigeria
            </figcaption>
          </figure>

          <ul className="lg:col-span-5 divide-y divide-[#E2DACA] border-y border-[#E2DACA]">
            <li>
              <a
                href={`tel:+${settings.whatsappNumber}`}
                className="group min-h-[64px] py-3 flex items-center gap-4"
              >
                <Phone className="w-5 h-5 text-[#263E0F] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#4A5240]">Call or WhatsApp</span>
                  <span className="block text-sm font-semibold text-[#17210E] tabular-nums group-hover:underline underline-offset-4">
                    {formatNigerianPhone(settings.whatsappNumber)}
                  </span>
                </span>
              </a>
            </li>
            <li>
              <a
                href={instagramUrl(settings.instagramHandle)}
                target="_blank"
                rel="noopener noreferrer"
                className="group min-h-[64px] py-3 flex items-center gap-4"
              >
                <Camera className="w-5 h-5 text-[#263E0F] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#4A5240]">Instagram</span>
                  <span className="block text-sm font-semibold text-[#17210E] group-hover:underline underline-offset-4">
                    {settings.instagramHandle}
                  </span>
                </span>
              </a>
            </li>
            <li>
              <Link href="/track" className="group min-h-[64px] py-3 flex items-center gap-4">
                <ArrowRight className="w-5 h-5 text-[#263E0F] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#4A5240]">Already ordered?</span>
                  <span className="block text-sm font-semibold text-[#17210E] group-hover:underline underline-offset-4">
                    Track your order
                  </span>
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
