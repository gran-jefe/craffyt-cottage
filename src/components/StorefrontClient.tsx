'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ShoppingBag,
  Sparkles,
  Palette,
  MessageCircle,
  Check,
  Search,
  MapPin,
  Phone,
  Camera,
  Loader2,
  PackageX,
  ArrowRight,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react'
import { fetchProducts, fetchStoreSettings, createBespokeRequest } from '@/lib/storeService'
import {
  BESPOKE_BEADS,
  BESPOKE_SHAPES,
  DEFAULT_PRODUCTS,
  DEFAULT_STORE_SETTINGS,
  formatNaira,
} from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import type { Product, StoreSettings } from '@/types/store'

function validateName(v: string): string | undefined {
  return v.trim().length < 2 ? 'Enter your name so the studio can follow up.' : undefined
}

function validatePhone(v: string): string | undefined {
  return v.replace(/\D/g, '').length < 7 ? 'Enter a WhatsApp or phone number with at least 7 digits.' : undefined
}

export function StorefrontClient() {
  const { addItem, setDrawerOpen, showToast } = useCart()
  const [products, setProducts] = useState<Product[]>(DEFAULT_PRODUCTS)
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS)
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [stockUnavailable, setStockUnavailable] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  // Catalog filters
  const [selectedCollection, setSelectedCollection] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

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
    setStockUnavailable(false)
    Promise.all([fetchProducts(false), fetchStoreSettings()])
      .then(([prods, storeCfg]) => {
        if (!active) return
        if (prods.length > 0) setProducts(prods)
        setSettings(storeCfg)
      })
      .catch(() => {
        // Show the catalogue from defaults, but never sell against made-up stock counts.
        if (active) setStockUnavailable(true)
      })
      .finally(() => {
        if (active) setLoadingProducts(false)
      })
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
        p.tag.toLowerCase().includes(q)
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
      await createBespokeRequest({
        customerName,
        customerPhone,
        shape: selectedShape.name,
        beadColour: selectedBead.name,
        estimatedPrice: bespokeTotal,
        notes,
      })
      setBespokeSubmitted(true)
      showToast('Custom bag request sent to the studio.')
    } catch {
      setBespokeError('Could not save your request right now. Please try again or use WhatsApp.')
    } finally {
      setBespokeSubmitting(false)
    }
  }

  return (
    <main>
      {/* HERO */}
      <section className="py-10 sm:py-16 lg:py-20 border-b border-[#E2DACA]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          <div className="lg:col-span-7 space-y-5">
            <p className="text-sm font-bold text-[#355416] uppercase tracking-wider">
              The signature Prima Collection
            </p>
            <h1 className="font-serif-display font-bold text-4xl sm:text-5xl lg:text-[54px] leading-[1.08] tracking-tight text-[#111B07]">
              Hand-beaded bags, <em className="font-medium text-[#355416]">made in Ibadan.</em>
            </h1>
            <p className="text-base sm:text-lg text-[#4A5240] leading-relaxed max-w-xl">
              Sculptural heart bags, pearl carryalls, and fringe clutches crafted by hand at the Crafty Cottage studio. Add ready-to-ship pieces to your bag or submit custom event colours.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <a
                href="#shop"
                className="min-h-[48px] px-6 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold inline-flex items-center gap-2 transition-colors shadow-sm"
              >
                <ShoppingBag className="w-4 h-4 text-[#E6C975]" />
                <span>Shop the collection</span>
              </a>
              <a
                href="#custom"
                className="min-h-[48px] px-6 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-sm font-bold inline-flex items-center gap-2 transition-colors"
              >
                <Palette className="w-4 h-4" />
                <span>Request custom colours</span>
              </a>
            </div>

            <ul className="pt-6 border-t border-[#E2DACA] grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-[#4A5240]">
              <li className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-[#355416] shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-[#17210E]">Handcrafted</strong>
                  Live inventory updated by studio
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-[#355416] shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-[#17210E]">Direct transfer</strong>
                  Zero gateway markups at checkout
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <ArrowRight className="w-5 h-5 text-[#355416] shrink-0 mt-0.5" />
                <span>
                  <strong className="block text-[#17210E]">Nationwide dispatch</strong>
                  Ibadan pickup, Lagos &amp; beyond
                </span>
              </li>
            </ul>
          </div>

          {/* Mosaic */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3 max-w-md mx-auto w-full">
            <a
              href="#shop"
              className="rounded-2xl overflow-hidden bg-[#E8DEC8] aspect-square block shadow-sm"
            >
              <img
                src="/images/products/dupree-gold.jpg"
                alt="Dupree Midi gold beaded bag"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </a>
            <a
              href="#shop"
              className="rounded-2xl overflow-hidden bg-[#E8DEC8] aspect-square block mt-5 shadow-sm"
            >
              <img
                src="/images/products/pearly.jpg"
                alt="Pearly faux-pearl handbag"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </a>
            <a
              href="#shop"
              className="rounded-2xl overflow-hidden bg-[#E8DEC8] aspect-square block -mt-5 shadow-sm"
            >
              <img
                src="/images/products/dupree-purple.jpg"
                alt="Dupree Midi purple beaded bag"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </a>
            <a
              href="#shop"
              className="rounded-2xl overflow-hidden bg-[#E8DEC8] aspect-square block shadow-sm"
            >
              <img
                src="/images/products/first-lady.jpg"
                alt="First Lady loop-fringe clutch"
                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
              />
            </a>
            <p className="col-span-2 text-center text-xs font-medium text-[#4A5240] pt-1">
              Authentic Prima pieces, starting from ₦35,000
            </p>
          </div>
        </div>
      </section>

      {/* SHOP CATALOG */}
      <section id="shop" className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div className="space-y-1.5">
              <p className="text-sm font-bold text-[#355416] uppercase tracking-wider">
                Live studio inventory
              </p>
              <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-[#111B07]">
                Shop ready-to-ship pieces
              </h2>
              <p className="text-sm text-[#4A5240]">
                Real-time stock synced with the Crafty Cottage studio. Add pieces to your bag and check out securely.
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 text-[#4A5240] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <label htmlFor="catalog-search" className="sr-only">
                Search bags and accessories
              </label>
              <input
                id="catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bags, pearls..."
                className="w-full min-h-[44px] pl-10 pr-4 rounded-xl bg-white border border-[#E2DACA] text-sm text-[#17210E] placeholder:text-[#5E6654]"
              />
            </div>
          </div>

          {/* Collection Filter Chips */}
          {collections.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-8" role="group" aria-label="Filter by collection">
              {collections.map((col) => {
                const active = col === selectedCollection
                return (
                  <button
                    key={col}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedCollection(col)}
                    className={`min-h-[44px] px-4 rounded-xl text-sm font-bold transition-colors border ${
                      active
                        ? 'bg-[#263E0F] text-white border-[#263E0F]'
                        : 'bg-white text-[#4A5240] border-[#E2DACA] hover:border-[#263E0F] hover:text-[#263E0F]'
                    }`}
                  >
                    {col}
                  </button>
                )
              })}
            </div>
          )}

          {stockUnavailable && !loadingProducts && (
            <div
              role="alert"
              className="mb-6 flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-950"
            >
              <p>
                <strong className="block">We couldn&apos;t load live stock right now</strong>
                You can browse the collection, but adding to your bag is paused until stock is confirmed.
              </p>
              <button
                type="button"
                onClick={() => setReloadKey((k) => k + 1)}
                className="min-h-[44px] px-4 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold"
              >
                Try again
              </button>
            </div>
          )}

          {/* Product Grid */}
          {loadingProducts ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((n) => (
                <div
                  key={n}
                  className="bg-white rounded-2xl p-4 border border-[#E2DACA] space-y-3 animate-pulse"
                >
                  <div className="aspect-square rounded-xl bg-[#E8DEC8]" />
                  <div className="h-5 bg-[#E8DEC8] rounded-md w-3/4" />
                  <div className="h-4 bg-[#F4EFE6] rounded-md w-1/3" />
                  <div className="h-11 bg-[#E8DEC8] rounded-xl" />
                </div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2DACA] py-14 px-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F4EFE6] text-[#4A5240] mx-auto flex items-center justify-center">
                <PackageX className="w-6 h-6" />
              </div>
              <h3 className="font-serif-display text-xl font-bold text-[#17210E]">
                No matching pieces found
              </h3>
              <p className="text-sm text-[#4A5240] max-w-md mx-auto">
                Try clearing your search or switching back to all collections.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCollection('All')
                  setSearchQuery('')
                }}
                className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] text-white text-sm font-bold hover:bg-[#111B07] transition-colors"
              >
                Show all products
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredProducts.map((product) => {
                const soldOut = product.stock <= 0
                const cannotBuy = soldOut || stockUnavailable
                const lowStock = product.stock > 0 && product.stock <= 2

                return (
                  <article
                    key={product.id}
                    className="bg-white rounded-2xl p-3.5 border border-[#E2DACA] flex flex-col justify-between gap-4 hover:shadow-md transition-shadow"
                  >
                    <div className="space-y-3">
                      <div className="relative aspect-square rounded-xl overflow-hidden bg-[#E8DEC8]">
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className={`w-full h-full object-cover transition-transform duration-200 hover:scale-105 ${
                            soldOut ? 'opacity-60 grayscale' : ''
                          }`}
                        />
                        {product.tag && (
                          <span className="absolute top-2.5 left-2.5 bg-[#1A2A0C] text-[#FAF8F4] text-xs font-bold px-2.5 py-1 rounded-md">
                            {product.tag}
                          </span>
                        )}
                        <span
                          className={`absolute bottom-2.5 right-2.5 text-xs font-bold px-2.5 py-1 rounded-md ${
                            soldOut
                              ? 'bg-[#B42318] text-white'
                              : lowStock
                              ? 'bg-[#E6C975] text-[#111B07]'
                              : 'bg-[#FAF8F4]/95 text-[#263E0F]'
                          }`}
                        >
                          {soldOut
                            ? 'Sold out'
                            : lowStock
                            ? `Only ${product.stock} left`
                            : `${product.stock} in stock`}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="font-serif-display text-lg font-bold text-[#17210E] leading-snug">
                          {product.name}
                        </h3>
                        <p className="text-base font-extrabold text-[#263E0F] tabular-nums">
                          {formatNaira(product.price)}
                        </p>
                        <p className="text-xs text-[#4A5240] leading-relaxed line-clamp-2">
                          {product.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={cannotBuy}
                      onClick={() => {
                        addItem(product, 1)
                        setDrawerOpen(true)
                      }}
                      className={`w-full min-h-[44px] px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors ${
                        cannotBuy
                          ? 'bg-[#F4EFE6] text-[#4A5240] border border-[#E2DACA] cursor-not-allowed'
                          : 'bg-[#263E0F] hover:bg-[#111B07] text-white shadow-xs'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4 text-[#E6C975]" />
                      <span>{soldOut ? 'Sold out' : stockUnavailable ? 'Checking stock' : 'Add to bag'}</span>
                    </button>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </section>

      {/* BESPOKE CUSTOM COLOUR STUDIO */}
      <section id="custom" className="py-16 sm:py-20 bg-[#1A2A0C] text-[#F4EFE6]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="max-w-2xl mb-10 space-y-2">
            <p className="text-sm font-bold text-[#E6C975] uppercase tracking-wider">
              Made to order
            </p>
            <h2 className="font-serif-display text-3xl sm:text-4xl font-bold text-white">
              Design a bag in your colours
            </h2>
            <p className="text-sm sm:text-base text-[#CFC6B2]">
              Planning a wedding, aso-ebi, or milestone celebration? Pick your silhouette and bead finish, and send your custom spec straight to the studio dashboard.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <form onSubmit={handleBespokeSubmit} className="lg:col-span-7 space-y-7" noValidate>
              {/* Step 1 */}
              <fieldset>
                <legend className="text-sm font-bold flex items-center gap-2.5 mb-3">
                  <span className="w-7 h-7 rounded-md bg-[#E6C975] text-[#111B07] font-extrabold grid place-items-center">
                    1
                  </span>
                  <span>Choose a shape</span>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BESPOKE_SHAPES.map((s) => {
                    const checked = s.id === shapeId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setShapeId(s.id)}
                        className={`min-h-[56px] p-3 rounded-xl border text-left flex items-center justify-between transition-colors ${
                          checked
                            ? 'bg-[#2A3E14] border-[#E6C975] ring-1 ring-[#E6C975]'
                            : 'bg-[#111B07] border-[#7E9364] hover:border-[#E6C975]'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-bold text-white">{s.name}</span>
                          <span className="block text-xs text-[#CFC6B2]">
                            From {formatNaira(s.price)}
                          </span>
                        </span>
                        {checked && <Check className="w-4 h-4 text-[#E6C975]" />}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Step 2 */}
              <fieldset>
                <legend className="text-sm font-bold flex items-center gap-2.5 mb-3">
                  <span className="w-7 h-7 rounded-md bg-[#E6C975] text-[#111B07] font-extrabold grid place-items-center">
                    2
                  </span>
                  <span>Choose a bead colour</span>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BESPOKE_BEADS.map((b) => {
                    const checked = b.id === beadId
                    return (
                      <button
                        key={b.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => setBeadId(b.id)}
                        className={`min-h-[56px] p-3 rounded-xl border text-left flex items-center gap-3 transition-colors ${
                          checked
                            ? 'bg-[#2A3E14] border-[#E6C975] ring-1 ring-[#E6C975]'
                            : 'bg-[#111B07] border-[#7E9364] hover:border-[#E6C975]'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="w-6 h-6 rounded-full border border-white/40 shrink-0"
                          style={{ background: b.swatch }}
                        />
                        <span className="flex-1">
                          <span className="block text-sm font-bold text-white">{b.name}</span>
                          <span className="block text-xs text-[#CFC6B2]">
                            {b.extra > 0 ? `+${formatNaira(b.extra)}` : 'No extra cost'}
                          </span>
                        </span>
                        {checked && <Check className="w-4 h-4 text-[#E6C975]" />}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              {/* Step 3 */}
              <div className="space-y-4">
                <div className="text-sm font-bold flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-md bg-[#E6C975] text-[#111B07] font-extrabold grid place-items-center">
                    3
                  </span>
                  <span>Your contact details &amp; event notes</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="bespoke-name" className="block text-xs font-semibold text-[#CFC6B2] mb-1">
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
                      className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#111B07] border text-sm text-white placeholder:text-[#A9B39A] ${
                        fieldErrors.name ? 'border-[#FCA5A5]' : 'border-[#7E9364]'
                      }`}
                    />
                    {fieldErrors.name && (
                      <p id="bespoke-name-error" className="mt-1 flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="bespoke-phone" className="block text-xs font-semibold text-[#CFC6B2] mb-1">
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
                      placeholder="e.g. 0803 000 0000"
                      className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#111B07] border text-sm text-white placeholder:text-[#A9B39A] ${
                        fieldErrors.phone ? 'border-[#FCA5A5]' : 'border-[#7E9364]'
                      }`}
                    />
                    {fieldErrors.phone && (
                      <p id="bespoke-phone-error" className="mt-1 flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        {fieldErrors.phone}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label htmlFor="bespoke-notes" className="block text-xs font-semibold text-[#CFC6B2] mb-1">
                    Event date and colour notes (optional)
                  </label>
                  <textarea
                    id="bespoke-notes"
                    rows={3}
                    maxLength={400}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Wedding on 14 December, prefer silver chain strap..."
                    className="w-full p-3.5 rounded-xl bg-[#111B07] border border-[#7E9364] text-sm text-white placeholder:text-[#A9B39A]"
                  />
                </div>
              </div>

              {bespokeError && (
                <p role="alert" className="text-sm text-red-300 bg-red-950/60 border border-red-400/40 px-4 py-2.5 rounded-xl">
                  {bespokeError}
                </p>
              )}

              {bespokeSubmitted ? (
                <div role="status" className="bg-[#263E0F] border border-[#E6C975]/60 p-4 rounded-xl text-sm text-[#FAF8F4] space-y-3">
                  <div className="space-y-1">
                    <p className="font-bold text-[#E6C975]">Request received by Crafty Cottage</p>
                    <p>The studio has your {selectedShape.name} in {selectedBead.name} spec and will contact you on {customerPhone}.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setBespokeSubmitted(false)
                      setNotes('')
                    }}
                    className="min-h-[44px] px-4 rounded-xl border border-[#E6C975]/60 text-[#FAF8F4] hover:bg-[#1A2A0C] text-xs font-bold transition-colors"
                  >
                    Design another bag
                  </button>
                </div>
              ) : (
              <button
                type="submit"
                disabled={bespokeSubmitting}
                className="w-full sm:w-auto min-h-[48px] px-7 rounded-xl bg-[#E6C975] hover:bg-[#F1DA9A] text-[#111B07] text-sm font-extrabold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
              >
                {bespokeSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Sending to studio...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Send custom bag request</span>
                  </>
                )}
              </button>
              )}
            </form>

            {/* Summary Card */}
            <aside className="lg:col-span-5 bg-[#111B07] border border-[#3A5222] rounded-2xl p-6 space-y-5 lg:sticky lg:top-24">
              <div className="flex items-baseline justify-between border-b border-[#3A5222] pb-4">
                <h3 className="text-lg font-extrabold text-white">Your custom spec</h3>
                <span className="text-xs text-[#CFC6B2]">Made to order</span>
              </div>

              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[#CFC6B2]">Bag silhouette</dt>
                  <dd className="font-serif-display text-lg font-bold text-white">
                    {selectedShape.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#CFC6B2]">Bead finish</dt>
                  <dd className="font-serif-display text-lg font-bold text-white">
                    {selectedBead.name}
                  </dd>
                </div>
              </dl>

              <div className="pt-4 border-t border-[#3A5222]">
                <span className="text-xs text-[#CFC6B2] block">Estimated production price</span>
                <span className="text-3xl font-extrabold text-[#E6C975] tabular-nums block mt-1">
                  {formatNaira(bespokeTotal)}
                </span>
                <p className="text-xs text-[#CFC6B2] mt-1">
                  Final timeline and custom shade confirmation shared upon studio review.
                </p>
              </div>

              <a
                href={`https://wa.me/${settings.whatsappNumber}?text=${encodeURIComponent(
                  `Hello Crafty Cottage, I'd like to discuss a custom ${selectedShape.name} in ${selectedBead.name} (Est. ${formatNaira(bespokeTotal)}). ${notes}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full min-h-[44px] px-4 rounded-xl border border-[#3A5222] hover:border-[#E6C975] text-sm font-bold text-[#FAF8F4] flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4 text-[#B8F0CF]" />
                <span>Chat directly on WhatsApp</span>
              </a>
            </aside>
          </div>
        </div>
      </section>

      {/* STORY & CONTACT */}
      <section className="py-16 bg-[#F4EFE6] border-t border-[#E2DACA]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7 space-y-4">
            <blockquote className="font-serif-display italic text-2xl sm:text-3xl leading-snug text-[#111B07]">
              “Crafty Cottage is a bead haven where creativity meets simplicity. We source beads that are skin-friendly and fabric-friendly, so every piece helps you stand out.”
            </blockquote>
            <p className="text-sm font-bold text-[#4A5240]">
              Crafty Cottage Studio · {settings.studioLocation}
            </p>
          </div>

          <ul className="lg:col-span-5 divide-y divide-[#E2DACA]">
            <li>
              <a
                href="https://www.google.com/maps/search/?api=1&query=University%20of%20Ibadan%2C%20Ibadan%2C%20Oyo%20State"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[56px] py-3 flex items-center gap-3.5 hover:underline"
              >
                <span className="w-10 h-10 rounded-xl bg-white border border-[#E2DACA] text-[#263E0F] grid place-items-center shrink-0">
                  <MapPin className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-xs text-[#4A5240]">Studio location</span>
                  <strong className="text-sm text-[#17210E]">{settings.studioLocation}</strong>
                </span>
              </a>
            </li>
            <li>
              <a
                href={`tel:+${settings.whatsappNumber}`}
                className="min-h-[56px] py-3 flex items-center gap-3.5 hover:underline"
              >
                <span className="w-10 h-10 rounded-xl bg-white border border-[#E2DACA] text-[#263E0F] grid place-items-center shrink-0">
                  <Phone className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-xs text-[#4A5240]">Call or WhatsApp</span>
                  <strong className="text-sm text-[#17210E]">+234 703 559 6492</strong>
                </span>
              </a>
            </li>
            <li>
              <a
                href="https://www.instagram.com/craftycottage.ng/"
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[56px] py-3 flex items-center gap-3.5 hover:underline"
              >
                <span className="w-10 h-10 rounded-xl bg-white border border-[#E2DACA] text-[#263E0F] grid place-items-center shrink-0">
                  <Camera className="w-4 h-4" />
                </span>
                <span>
                  <span className="block text-xs text-[#4A5240]">Instagram</span>
                  <strong className="text-sm text-[#17210E]">{settings.instagramHandle}</strong>
                </span>
              </a>
            </li>
            <li className="pt-3">
              <Link
                href="/track"
                className="text-sm font-bold text-[#263E0F] hover:underline inline-flex items-center gap-1.5"
              >
                <span>Already ordered? Track your bag status</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </main>
  )
}
