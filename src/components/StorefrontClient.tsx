'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Palette,
  MessageCircle,
  Check,
  Search,
  SlidersHorizontal,
  ChevronRight,
  X,
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
import { DEFAULT_COUNTRY, parsePhoneForCountry } from '@/lib/phone'
import { PhoneField } from '@/components/PhoneField'
import { hasVariants, priceRange, uniqueOptions } from '@/lib/variants'
import { ProductOptionsDialog } from '@/components/ProductOptionsDialog'
import { categoryOf, collectionName, collectionOf, sizeLabelFor } from '@/lib/catalog'
import { useCatalog } from '@/lib/useCatalog'
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

type SortKey = 'featured' | 'newest' | 'price_asc' | 'price_desc' | 'name'

const SORT_LABELS: Record<SortKey, string> = {
  featured: 'Featured',
  newest: 'Newest',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  name: 'Name: A to Z',
}

/** How many cards render at first, and how many more each "Show more" adds. */
const PAGE_SIZE = 24

function sortProducts(list: Product[], sort: SortKey): Product[] {
  const byNewest = (a: Product, b: Product) => b.createdAt.localeCompare(a.createdAt)
  const sorted = [...list].sort((a, b) => {
    switch (sort) {
      case 'price_asc':
        return priceRange(a).min - priceRange(b).min || a.name.localeCompare(b.name)
      case 'price_desc':
        return priceRange(b).min - priceRange(a).min || a.name.localeCompare(b.name)
      case 'name':
        return a.name.localeCompare(b.name)
      case 'newest':
        return byNewest(a, b)
      default:
        return Number(b.featured) - Number(a.featured) || byNewest(a, b)
    }
  })
  // Browsing orders keep sold-out pieces at the end; explicit price/name sorts are left exact.
  if (sort === 'featured' || sort === 'newest') {
    return [...sorted.filter((p) => p.stock > 0), ...sorted.filter((p) => p.stock <= 0)]
  }
  return sorted
}

/**
 * Filters live in the URL (?category=waist-beads&collection=owambe&q=&sort=&instock=1), so a
 * header link, a shared link or the back button lands on exactly that view.
 */
function readFilters(q: URLSearchParams) {
  const sort = q.get('sort') as SortKey | null
  return {
    search: q.get('q') ?? '',
    category: q.get('category') || 'all',
    collection: q.get('collection') || 'all',
    sort: sort && sort in SORT_LABELS ? sort : ('featured' as SortKey),
    inStockOnly: q.get('instock') === '1',
  }
}

function filtersToQuery(f: ReturnType<typeof readFilters>): string {
  const q = new URLSearchParams()
  if (f.category !== 'all') q.set('category', f.category)
  if (f.collection !== 'all') q.set('collection', f.collection)
  if (f.search.trim()) q.set('q', f.search.trim())
  if (f.sort !== 'featured') q.set('sort', f.sort)
  if (f.inStockOnly) q.set('instock', '1')
  return q.toString()
}

/** Products per category on the grouped shop landing. */
const GROUP_PREVIEW = 4

function validateName(v: string): string | undefined {
  return v.trim().length < 2 ? 'Enter your name so we can follow up.' : undefined
}

function validatePhone(v: string, country: string): string | undefined {
  const phone = parsePhoneForCountry(country, v)
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

  // Catalog filters ('all' = no filter). Category and collection hold catalogue ids.
  const { catalog } = useCatalog()
  const searchParams = useSearchParams()
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedCollection, setSelectedCollection] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('featured')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [filtersReady, setFiltersReady] = useState(false)
  const [optionsFor, setOptionsFor] = useState<Product | null>(null)
  /** The query this component last wrote, so its own URL updates aren't read back as navigation. */
  const lastQuery = useRef<string | null>(null)

  // Apply the URL on load and whenever something else changes it (header or hero links, back button).
  const urlQuery = searchParams.toString()
  useEffect(() => {
    if (urlQuery === lastQuery.current) return
    const f = readFilters(new URLSearchParams(urlQuery))
    setSelectedCategory(f.category)
    setSelectedCollection(f.collection)
    setSearchQuery(f.search)
    setSort(f.sort)
    setInStockOnly(f.inStockOnly)
    lastQuery.current = urlQuery
    if (filtersReady && window.location.hash === '#shop') {
      document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    setFiltersReady(true)
  }, [urlQuery, filtersReady])

  // Keep the link in step with the filters.
  useEffect(() => {
    if (!filtersReady) return
    const query = filtersToQuery({
      category: selectedCategory,
      collection: selectedCollection,
      search: searchQuery,
      sort,
      inStockOnly,
    })
    if (query === lastQuery.current) return
    lastQuery.current = query
    const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
    window.history.replaceState(window.history.state, '', url)
  }, [filtersReady, selectedCategory, selectedCollection, searchQuery, sort, inStockOnly])

  // A new filter starts from the top of the results.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [searchQuery, selectedCategory, selectedCollection, sort, inStockOnly])

  // Bespoke studio form
  const [shapeId, setShapeId] = useState(BESPOKE_SHAPES[0].id)
  const [beadId, setBeadId] = useState(BESPOKE_BEADS[0].id)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [bespokeCountry, setBespokeCountry] = useState(DEFAULT_COUNTRY)
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

  const categoryName = (id: string) => catalog.categories.find((c) => c.id === id)?.name
  const activeCategory = selectedCategory === 'all' ? undefined : catalog.categories.find((c) => c.id === selectedCategory)
  const activeCollection =
    selectedCollection === 'all' ? undefined : catalog.collections.find((c) => c.id === selectedCollection)

  /** Category tabs in catalogue order, with how many pieces each holds (empty ones hidden). */
  const categoryTabs = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      const c = categoryOf(p, catalog)
      if (c) counts.set(c.id, (counts.get(c.id) ?? 0) + 1)
    }
    return catalog.categories
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }))
  }, [products, catalog])

  /** Collections present in the chosen category, in catalogue order, with counts. */
  const collectionChips = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of products) {
      if (selectedCategory !== 'all' && categoryOf(p, catalog)?.id !== selectedCategory) continue
      const k = collectionOf(p, catalog)
      if (k) counts.set(k.id, (counts.get(k.id) ?? 0) + 1)
    }
    return catalog.collections
      .filter((c) => (counts.get(c.id) ?? 0) > 0)
      .map((c) => ({ id: c.id, name: c.name, count: counts.get(c.id) ?? 0 }))
  }, [products, catalog, selectedCategory])

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    const matches = products.filter((p) => {
      const matchesCat = selectedCategory === 'all' || categoryOf(p, catalog)?.id === selectedCategory
      const matchesCol = selectedCollection === 'all' || collectionOf(p, catalog)?.id === selectedCollection
      const matchesStock = !inStockOnly || p.stock > 0
      const matchesQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.tag.toLowerCase().includes(q) ||
        collectionName(p, catalog).toLowerCase().includes(q) ||
        (categoryOf(p, catalog)?.name.toLowerCase().includes(q) ?? false) ||
        (p.variants ?? []).some((v) => `${v.color} ${v.size}`.toLowerCase().includes(q))
      return matchesCat && matchesCol && matchesStock && matchesQ
    })
    return sortProducts(matches, sort)
  }, [products, catalog, selectedCategory, selectedCollection, searchQuery, inStockOnly, sort])

  const shownProducts = filteredProducts.slice(0, visibleCount)
  const filtersActive =
    Boolean(searchQuery.trim()) || selectedCategory !== 'all' || selectedCollection !== 'all' || inStockOnly

  /**
   * The unfiltered shop opens grouped by category (a few pieces each, "View all" to go in),
   * so a visitor after waist beads never has to scroll past every bag.
   */
  const groups = useMemo(() => {
    if (filtersActive || sort !== 'featured' || categoryTabs.length < 2) return null
    const sorted = sortProducts(products, 'featured')
    const out = categoryTabs.map((t) => ({
      id: t.id,
      name: t.name,
      count: t.count,
      items: sorted.filter((p) => categoryOf(p, catalog)?.id === t.id).slice(0, GROUP_PREVIEW),
    }))
    const loose = sorted.filter((p) => !categoryOf(p, catalog))
    if (loose.length > 0) out.push({ id: '', name: 'More pieces', count: loose.length, items: loose.slice(0, GROUP_PREVIEW) })
    return out
  }, [filtersActive, sort, categoryTabs, products, catalog])

  /** Featured pieces for the hero strip: featured first, then newest, in stock only. */
  const heroPieces = useMemo(
    () => sortProducts(products.filter((p) => p.stock > 0), 'featured').slice(0, 4),
    [products]
  )

  function clearFilters() {
    setSearchQuery('')
    setSelectedCategory('all')
    setSelectedCollection('all')
    setInStockOnly(false)
  }

  function scrollToShop() {
    document.getElementById('shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Go straight to one category (from the hero, a group heading or a breadcrumb). */
  function openCategory(id: string) {
    setSelectedCategory(id)
    setSelectedCollection('all')
    setSearchQuery('')
    scrollToShop()
  }

  /** From the hero: show this one piece in the shop grid. */
  function viewInShop(p: Product) {
    setSelectedCategory('all')
    setSelectedCollection('all')
    setInStockOnly(false)
    setSearchQuery(p.name)
    scrollToShop()
  }

  const selectedShape = BESPOKE_SHAPES.find((s) => s.id === shapeId) || BESPOKE_SHAPES[0]
  const selectedBead = BESPOKE_BEADS.find((b) => b.id === beadId) || BESPOKE_BEADS[0]
  const bespokeTotal = selectedShape.price + selectedBead.extra

  async function handleBespokeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBespokeError('')
    const nameErr = validateName(customerName)
    const phoneErr = validatePhone(customerPhone, bespokeCountry)
    setFieldErrors({ name: nameErr, phone: phoneErr })
    if (nameErr || phoneErr) {
      document.getElementById(nameErr ? 'bespoke-name' : 'bespoke-phone')?.focus()
      return
    }

    setBespokeSubmitting(true)
    try {
      const phone = parsePhoneForCountry(bespokeCountry, customerPhone)
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
      ? 'bg-[#0B3D3A] border-[#E6C975]'
      : 'bg-[#04201F] border-[#5F918A] hover:border-[#E6C975] active:bg-[#062E2C]'

  /** One product card; `key` lets the same piece appear in two groups safely. */
  const renderProduct = (product: Product, key?: string) => {
    const soldOut = product.stock <= 0
    const withOptions = hasVariants(product)
    // For options, "only N left" would mislead: N is spread across colours and sizes.
    const lowStock = !withOptions && product.stock > 0 && product.stock <= 2
    const range = priceRange(product)
    const summary = optionsSummary(product)

    return (
      <li key={key ?? product.id}>
        <article className="group h-full flex flex-col">
          <div className="relative aspect-[4/5] rounded-xl overflow-hidden bg-[#E8DEC8]">
            <img
              src={product.imageUrl}
              alt={product.name}
              width={600}
              height={750}
              loading="lazy"
              decoding="async"
              className={`w-full h-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.03] ${
                soldOut ? 'opacity-60 grayscale' : ''
              }`}
            />
            {product.tag && !soldOut && (
              <span className="absolute top-2 left-2 sm:top-3 sm:left-3 max-w-[calc(100%-1rem)] truncate bg-[#FAF8F4]/95 text-[#0F1F1D] text-xs font-medium px-2 py-1 rounded-md">
                {product.tag}
              </span>
            )}
            {soldOut && (
              <span className="absolute inset-x-0 bottom-0 bg-[#0F1F1D]/85 text-white text-xs font-semibold uppercase tracking-[0.14em] text-center py-2">
                Sold out
              </span>
            )}
          </div>

          <div className="pt-3 sm:pt-4 flex-1 flex flex-col">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#56625F] truncate">
              {[categoryOf(product, catalog)?.name, collectionName(product, catalog)].filter(Boolean).join(' · ')}
            </p>
            <h3 className="mt-1 font-serif-display text-[17px] sm:text-lg font-medium leading-snug text-[#0F1F1D]">
              {product.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <p className="text-sm sm:text-[15px] font-semibold text-[#0B3D3A] tabular-nums">
                {range.min !== range.max ? `From ${formatNaira(range.min)}` : formatNaira(range.min)}
              </p>
              {lowStock && (
                <p className="text-xs font-medium text-[#8A6A12]">Only {product.stock} left</p>
              )}
            </div>
            {summary && <p className="mt-1 text-xs text-[#3F4F4C]">{summary}</p>}

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
                    ? 'bg-[#F4EFE6] text-[#56625F] border-[#E2DACA] cursor-not-allowed'
                    : 'border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#0B3D3A] hover:text-white active:bg-[#04201F] active:text-white'
                }`}
              >
                {soldOut ? 'Sold out' : withOptions ? 'Choose options' : 'Add to bag'}
              </button>
            </div>
          </div>
        </article>
      </li>
    )
  }

  return (
    <main>
      {/* HERO: the logo's deep teal, one brand moment, type first */}
      <section className="relative overflow-hidden bg-[#062E2C] text-[#FAF8F4]">
        <div aria-hidden="true" className="hero-silk absolute inset-0" />
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-10 sm:pt-20 sm:pb-14 lg:pt-24 lg:pb-16">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#E6C975]">The Prima Collection</p>
            <h1 className="mt-5 font-serif-display font-normal text-[min(42px,10.4vw)] sm:text-6xl lg:text-[68px] leading-[1.06] tracking-[-0.01em] text-white text-balance">
              {/* Keep "Hand-beaded bags," together on one line; the gold phrase always starts the next. */}
              <span className="whitespace-nowrap">Hand-beaded bags,</span>
              <br />
              <em className="italic text-[#E6C975]">made in Nigeria.</em>
            </h1>
            <p className="mt-6 text-base sm:text-lg text-[#CFC6B2] leading-relaxed max-w-md mx-auto">
              Sculptural heart bags, pearl carryalls and fringe clutches, beaded piece by piece.
            </p>
            <div className="mt-9 flex flex-col min-[420px]:flex-row items-center justify-center gap-2 min-[420px]:gap-7">
              <a
                href="#shop"
                className="w-full min-[420px]:w-auto min-h-[48px] px-8 rounded-xl bg-[#E6C975] hover:bg-[#F1DA9A] active:bg-[#D9B95C] text-[#04201F] text-sm font-semibold tracking-wide inline-flex items-center justify-center transition-colors duration-150"
              >
                Shop the collection
              </a>
              <a
                href="#custom"
                className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-[#FAF8F4] underline-offset-4 hover:underline"
              >
                <span>Commission a custom piece</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </a>
            </div>

            {/* Straight to what they came for: every category in the catalogue, always visible.
                An empty one opens on a "none yet, we can make one" message, never a dead end. */}
            {catalog.categories.length > 0 && (
              <nav aria-labelledby="hero-categories-label" className="mt-10">
                <p
                  id="hero-categories-label"
                  className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#CFC6B2]"
                >
                  Shop by category
                </p>
                <ul className="mt-3 flex flex-wrap justify-center gap-2">
                  {catalog.categories.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`/?category=${encodeURIComponent(c.id)}#shop`}
                        onClick={(e) => {
                          e.preventDefault()
                          openCategory(c.id)
                        }}
                        className="min-h-[44px] px-5 rounded-full border border-white/25 bg-white/[0.04] hover:border-[#E6C975] hover:text-[#E6C975] active:bg-white/10 text-sm font-medium text-[#FAF8F4] inline-flex items-center transition-colors duration-150"
                      >
                        {c.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>

          {/* Featured pieces: small and sharp, since photos are shown near their real size */}
          {(loadingProducts || heroPieces.length > 0) && (
            <div className="mt-12 sm:mt-16">
              <ul
                aria-label="Featured pieces"
                aria-busy={loadingProducts}
                className="-mx-4 px-4 scroll-px-4 sm:mx-0 sm:px-0 sm:scroll-px-0 flex sm:justify-center gap-3 sm:gap-5 overflow-x-auto no-scrollbar snap-x"
              >
                {loadingProducts
                  ? [1, 2, 3, 4].map((n) => (
                      <li key={n} className="shrink-0 w-[124px] sm:w-[148px]">
                        <div className="aspect-square rounded-xl bg-white/[0.06] animate-pulse" />
                        <div className="mt-3 h-4 w-3/4 rounded bg-white/[0.06]" />
                      </li>
                    ))
                  : heroPieces.map((p) => {
                      const range = priceRange(p)
                      return (
                        <li key={p.id} className="shrink-0 w-[124px] sm:w-[148px] snap-start">
                          <button
                            type="button"
                            onClick={() => viewInShop(p)}
                            aria-label={`View ${p.name} in the shop`}
                            className="group w-full text-left rounded-xl"
                          >
                            <span className="block aspect-square rounded-xl overflow-hidden bg-[#0B3D3A] ring-1 ring-white/10">
                              <img
                                src={p.imageUrl}
                                alt=""
                                width={148}
                                height={148}
                                className="w-full h-full object-cover transition-transform duration-200 motion-safe:group-hover:scale-[1.04]"
                              />
                            </span>
                            <span className="mt-3 block font-serif-display text-[15px] leading-snug text-white truncate">
                              {p.name}
                            </span>
                            <span className="block text-xs text-[#CFC6B2] tabular-nums">
                              {range.min !== range.max ? `From ${formatNaira(range.min)}` : formatNaira(range.min)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
              </ul>
            </div>
          )}

          <ul className="mt-12 pt-6 border-t border-white/10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[13px] text-[#CFC6B2]">
            {['Beaded by hand', 'Pay by bank transfer', 'Delivery across Nigeria'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span aria-hidden="true" className="w-1 h-1 rounded-full bg-[#E6C975]" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* SHOP CATALOG */}
      <section id="shop" aria-labelledby="shop-heading" className="py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Breadcrumb: where the visitor is, and one tap back up */}
          <nav aria-label="Breadcrumb" className="mb-3">
            <ol className="flex flex-wrap items-center gap-x-1.5 text-sm text-[#3F4F4C]">
              {[
                { label: 'Shop', onClick: clearFilters, current: !activeCategory && !activeCollection },
                ...(activeCategory
                  ? [
                      {
                        label: activeCategory.name,
                        onClick: () => setSelectedCollection('all'),
                        current: !activeCollection,
                      },
                    ]
                  : []),
                ...(activeCollection ? [{ label: activeCollection.name, onClick: () => {}, current: true }] : []),
              ].map((crumb, i) => (
                <li key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-[#8C8270]" aria-hidden="true" />}
                  {crumb.current ? (
                    <span aria-current="page" className="font-semibold text-[#0F1F1D]">
                      {crumb.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="min-h-[44px] inline-flex items-center underline-offset-4 hover:underline hover:text-[#0B3D3A]"
                    >
                      {crumb.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 mb-6">
            <div>
              <h2
                id="shop-heading"
                className="font-serif-display font-medium text-3xl sm:text-4xl tracking-[-0.01em] text-[#04201F]"
              >
                {activeCollection?.name ?? activeCategory?.name ?? 'The collection'}
              </h2>
              {activeCollection?.description && (
                <p className="mt-2 text-sm text-[#3F4F4C] leading-relaxed max-w-xl">{activeCollection.description}</p>
              )}
            </div>
            {!loadingProducts && products.length > 0 && (
              <p className="text-sm text-[#3F4F4C] tabular-nums">
                {products.length} {products.length === 1 ? 'piece' : 'pieces'} in the shop
              </p>
            )}
          </div>

          {/* Toolbar: search, sort, availability */}
          <div className="flex flex-col md:flex-row md:items-center gap-3 pb-4 border-b border-[#E2DACA]">
            <div className="relative flex-1 min-w-0">
              <Search
                aria-hidden="true"
                className="w-4 h-4 text-[#3F4F4C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
              />
              <label htmlFor="catalog-search" className="sr-only">
                Search the collection
              </label>
              <input
                id="catalog-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bags, colours..."
                className="w-full min-h-[44px] pl-10 pr-10 rounded-xl bg-white border border-[#E2DACA] hover:border-[#C9BEA6] text-base sm:text-sm text-[#0F1F1D] placeholder:text-[#56625F] transition-colors duration-150"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-0 top-0 min-w-[44px] min-h-[44px] grid place-items-center text-[#3F4F4C] hover:text-[#0F1F1D]"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="catalog-sort" className="sr-only">
                Sort by
              </label>
              <div className="relative flex-1 md:flex-none">
                <SlidersHorizontal
                  aria-hidden="true"
                  className="w-4 h-4 text-[#3F4F4C] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                />
                <select
                  id="catalog-sort"
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="w-full md:w-52 min-h-[44px] pl-10 pr-8 rounded-xl bg-white border border-[#E2DACA] hover:border-[#C9BEA6] text-sm font-medium text-[#0F1F1D] transition-colors duration-150"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                aria-pressed={inStockOnly}
                onClick={() => setInStockOnly((v) => !v)}
                className={`flex-1 md:flex-none min-h-[44px] px-4 rounded-xl border text-sm font-medium whitespace-nowrap inline-flex items-center justify-center gap-2 transition-colors duration-150 ${
                  inStockOnly
                    ? 'bg-[#0F1F1D] border-[#0F1F1D] text-white'
                    : 'bg-white border-[#E2DACA] text-[#0F1F1D] hover:border-[#C9BEA6]'
                }`}
              >
                {inStockOnly && <Check className="w-4 h-4" aria-hidden="true" />}
                In stock only
              </button>
            </div>
          </div>

          {/* Categories: the main way in. One swipeable row of tabs. */}
          {categoryTabs.length > 1 && (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 mt-4 overflow-x-auto no-scrollbar border-b border-[#E2DACA]">
              <div className="flex gap-6 w-max" role="group" aria-label="Shop by category">
                {[{ id: 'all', name: 'All', count: products.length }, ...categoryTabs].map((tab) => {
                  const active = tab.id === selectedCategory
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setSelectedCategory(tab.id)
                        setSelectedCollection('all')
                      }}
                      className={`min-h-[48px] -mb-px border-b-2 whitespace-nowrap text-[15px] transition-colors duration-150 ${
                        active
                          ? 'border-[#0B3D3A] text-[#0F1F1D] font-semibold'
                          : 'border-transparent text-[#3F4F4C] font-medium hover:text-[#0B3D3A]'
                      }`}
                    >
                      {tab.name}
                      <span className="ml-1.5 text-xs tabular-nums text-[#56625F]">{tab.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Collections inside the chosen category */}
          {collectionChips.length > 1 && (
            <div className="-mx-4 px-4 sm:mx-0 sm:px-0 pt-4 overflow-x-auto no-scrollbar">
              <div className="flex gap-2 w-max" role="group" aria-label="Filter by collection">
                {[{ id: 'all', name: 'All collections', count: 0 }, ...collectionChips].map((col) => {
                  const active = col.id === selectedCollection
                  return (
                    <button
                      key={col.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedCollection(col.id)}
                      className={`min-h-[44px] px-4 rounded-full whitespace-nowrap text-sm font-medium border transition-colors duration-150 ${
                        active
                          ? 'bg-[#0F1F1D] text-white border-[#0F1F1D]'
                          : 'bg-transparent text-[#3F4F4C] border-[#E2DACA] hover:border-[#0B3D3A] hover:text-[#0B3D3A]'
                      }`}
                    >
                      {col.name}
                      {col.id !== 'all' && (
                        <span className={`ml-1.5 tabular-nums ${active ? 'text-white/70' : 'text-[#56625F]'}`}>{col.count}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Results line */}
          {!loadingProducts && !catalogueError && products.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-4 pb-6 min-h-[60px]">
              <p className="text-sm text-[#3F4F4C]" aria-live="polite">
                {filteredProducts.length === products.length
                  ? `Showing all ${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`
                  : `${filteredProducts.length} of ${products.length} ${products.length === 1 ? 'piece' : 'pieces'}`}
                {searchQuery.trim() && (
                  <>
                    {' '}
                    for <span className="font-semibold text-[#0F1F1D]">&ldquo;{searchQuery.trim()}&rdquo;</span>
                  </>
                )}
              </p>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[44px] px-2 -mr-2 text-sm font-semibold text-[#0B3D3A] underline-offset-4 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {catalogueError && !loadingProducts ? (
            <div role="alert" className="mt-6 bg-white rounded-2xl border border-amber-300 py-14 px-6 text-center">
              <AlertCircle className="w-7 h-7 text-amber-800 mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#0F1F1D]">
                We couldn&apos;t load the collection
              </h3>
              <p className="mt-2 text-sm text-[#3F4F4C] leading-relaxed max-w-md mx-auto">
                This is usually a connection problem. Try again, or message us on WhatsApp to order directly.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setReloadKey((k) => k + 1)}
                  className="min-h-[44px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-semibold transition-colors duration-150"
                >
                  Try again
                </button>
                <a
                  href={`https://wa.me/${settings.whatsappNumber}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-5 rounded-xl border border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#E3F0EE] text-sm font-semibold inline-flex items-center gap-2 transition-colors duration-150"
                >
                  <MessageCircle className="w-4 h-4" aria-hidden="true" />
                  <span>Order on WhatsApp</span>
                </a>
              </div>
            </div>
          ) : loadingProducts ? (
            <div
              className="pt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-10 sm:gap-x-6"
              aria-busy="true"
              aria-label="Loading the collection"
            >
              {Array.from({ length: 8 }, (_, n) => (
                <div key={n} className="animate-pulse">
                  <div className="aspect-[4/5] rounded-xl bg-[#E8DEC8]" />
                  <div className="mt-4 h-5 bg-[#E8DEC8] rounded-md w-3/4" />
                  <div className="mt-2 h-4 bg-[#F4EFE6] rounded-md w-1/3" />
                  <div className="mt-4 h-11 bg-[#F4EFE6] rounded-xl" />
                </div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="mt-6 bg-white rounded-2xl border border-[#E2DACA] py-14 px-6 text-center">
              <Palette className="w-7 h-7 text-[#0B3D3A] mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#0F1F1D]">New pieces are being beaded</h3>
              <p className="mt-2 text-sm text-[#3F4F4C] leading-relaxed max-w-md mx-auto">
                Every ready-to-ship bag has found a home. You can still order one made in your colours.
              </p>
              <a
                href="#custom"
                className="mt-6 inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-semibold transition-colors duration-150"
              >
                Design a custom bag
              </a>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#E2DACA] py-14 px-6 text-center">
              <PackageX className="w-7 h-7 text-[#3F4F4C] mx-auto" aria-hidden="true" />
              <h3 className="mt-4 font-serif-display text-xl font-medium text-[#0F1F1D]">
                {activeCategory && !searchQuery.trim() && !activeCollection && !inStockOnly
                  ? `No ${activeCategory.name.toLowerCase()} in the shop yet`
                  : 'No pieces match'}
              </h3>
              <p className="mt-2 text-sm text-[#3F4F4C] leading-relaxed max-w-md mx-auto">
                {activeCategory && !searchQuery.trim() && !activeCollection && !inStockOnly
                  ? `New ${activeCategory.name.toLowerCase()} are on the way. We can also make one to order in your colours.`
                  : inStockOnly
                  ? 'Nothing in stock matches these filters. Try showing sold-out pieces too, or ask for one in your colours.'
                  : 'Try a different search, category or collection.'}
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[44px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-semibold transition-colors duration-150"
                >
                  See everything
                </button>
                <a
                  href="#custom"
                  className="min-h-[44px] px-5 rounded-xl border border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#E3F0EE] text-sm font-semibold inline-flex items-center transition-colors duration-150"
                >
                  Order a custom piece
                </a>
              </div>
            </div>
          ) : groups ? (
            <div className="space-y-14">
              {groups.map((g) => (
                <section key={g.id || 'more'} aria-labelledby={`group-${g.id || 'more'}`}>
                  <div className="flex items-end justify-between gap-4 mb-5">
                    <h3
                      id={`group-${g.id || 'more'}`}
                      className="font-serif-display text-2xl font-medium text-[#04201F]"
                    >
                      {g.name}
                    </h3>
                    {g.id && g.count > g.items.length && (
                      <button
                        type="button"
                        onClick={() => openCategory(g.id)}
                        className="min-h-[44px] shrink-0 inline-flex items-center gap-1 text-sm font-semibold text-[#0B3D3A] underline-offset-4 hover:underline"
                      >
                        View all {g.count}
                        <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-10 sm:gap-x-6">
                    {g.items.map((p) => renderProduct(p, `${g.id}-${p.id}`))}
                  </ul>
                </section>
              ))}
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-10 sm:gap-x-6">
                {shownProducts.map((product) => renderProduct(product))}
              </ul>

              {filteredProducts.length > shownProducts.length && (
                <div className="mt-12 flex flex-col items-center gap-3">
                  <p className="text-sm text-[#3F4F4C] tabular-nums">
                    Showing {shownProducts.length} of {filteredProducts.length}
                  </p>
                  <div
                    aria-hidden="true"
                    className="w-48 h-0.5 rounded-full bg-[#E2DACA] overflow-hidden"
                  >
                    <div
                      className="h-full bg-[#0B3D3A]"
                      style={{ width: `${(shownProducts.length / filteredProducts.length) * 100}%` }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                    className="mt-2 min-h-[48px] px-8 rounded-xl border border-[#0B3D3A] text-[#0B3D3A] hover:bg-[#0B3D3A] hover:text-white text-sm font-semibold transition-colors duration-150"
                  >
                    Show {Math.min(PAGE_SIZE, filteredProducts.length - shownProducts.length)} more
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* MADE TO ORDER */}
      <section id="custom" className="py-16 sm:py-24 bg-[#062E2C] text-[#F4EFE6]">
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
                      className={`w-full min-h-[44px] px-3.5 rounded-xl bg-[#04201F] border text-base sm:text-sm text-white placeholder:text-[#93AFAA] ${
                        fieldErrors.name ? 'border-[#FCA5A5]' : 'border-[#5F918A]'
                      }`}
                    />
                    {fieldErrors.name && (
                      <p id="bespoke-name-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-[#FCA5A5]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        {fieldErrors.name}
                      </p>
                    )}
                  </div>
                  <PhoneField
                    id="bespoke-phone"
                    label="Phone or WhatsApp number *"
                    tone="dark"
                    country={bespokeCountry}
                    value={customerPhone}
                    onCountryChange={(iso) => {
                      setBespokeCountry(iso)
                      if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: validatePhone(customerPhone, iso) }))
                    }}
                    onChange={(v) => {
                      setCustomerPhone(v)
                      if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: validatePhone(v, bespokeCountry) }))
                    }}
                    onBlur={() =>
                      customerPhone && setFieldErrors((f) => ({ ...f, phone: validatePhone(customerPhone, bespokeCountry) }))
                    }
                    error={fieldErrors.phone}
                  />
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
                    className="w-full p-3.5 rounded-xl bg-[#04201F] border border-[#5F918A] text-base sm:text-sm text-white placeholder:text-[#93AFAA] leading-relaxed"
                  />
                </div>
              </fieldset>

              {/* Mobile and tablet: the estimate sits right above the action it informs */}
              <div className="lg:hidden flex items-baseline justify-between gap-4 pt-5 border-t border-[#1F5550]">
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
                <div role="status" className="bg-[#0B3D3A] border border-[#E6C975]/60 p-5 rounded-xl text-sm text-[#FAF8F4]">
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
                    className="mt-4 min-h-[44px] px-4 rounded-xl border border-[#E6C975]/60 text-[#FAF8F4] hover:bg-[#062E2C] text-sm font-semibold transition-colors duration-150"
                  >
                    Design another bag
                  </button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6">
                  <button
                    type="submit"
                    disabled={bespokeSubmitting}
                    className="w-full sm:w-auto min-h-[48px] px-7 rounded-xl bg-[#E6C975] hover:bg-[#F1DA9A] active:bg-[#D9B95C] text-[#04201F] text-sm font-semibold tracking-wide inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
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
            <aside className="hidden lg:block lg:col-span-5 bg-[#04201F] border border-[#1F5550] rounded-2xl p-7 lg:sticky lg:top-24">
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

              <div className="mt-6 pt-6 border-t border-[#1F5550]">
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
                className="mt-6 w-full min-h-[44px] px-4 rounded-xl border border-[#1F5550] hover:border-[#E6C975] text-sm font-semibold text-[#FAF8F4] flex items-center justify-center gap-2 transition-colors duration-150"
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
        eyebrow={
          optionsFor
            ? [categoryOf(optionsFor, catalog)?.name, collectionName(optionsFor, catalog)].filter(Boolean).join(' · ')
            : undefined
        }
        sizeLabel={optionsFor ? sizeLabelFor(optionsFor, catalog) : undefined}
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
            <blockquote className="font-serif-display italic text-2xl sm:text-[32px] leading-snug text-[#04201F]">
              “A bead haven where creativity meets simplicity. We source beads that are skin-friendly and
              fabric-friendly, so every piece helps you stand out.”
            </blockquote>
            <figcaption className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-[#3F4F4C]">
              Crafty Cottage · Handmade in Nigeria
            </figcaption>
          </figure>

          <ul className="lg:col-span-5 divide-y divide-[#E2DACA] border-y border-[#E2DACA]">
            <li>
              <a
                href={`tel:+${settings.whatsappNumber}`}
                className="group min-h-[64px] py-3 flex items-center gap-4"
              >
                <Phone className="w-5 h-5 text-[#0B3D3A] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#3F4F4C]">Call or WhatsApp</span>
                  <span className="block text-sm font-semibold text-[#0F1F1D] tabular-nums group-hover:underline underline-offset-4">
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
                <Camera className="w-5 h-5 text-[#0B3D3A] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#3F4F4C]">Instagram</span>
                  <span className="block text-sm font-semibold text-[#0F1F1D] group-hover:underline underline-offset-4">
                    {settings.instagramHandle}
                  </span>
                </span>
              </a>
            </li>
            <li>
              <Link href="/track" className="group min-h-[64px] py-3 flex items-center gap-4">
                <ArrowRight className="w-5 h-5 text-[#0B3D3A] shrink-0" aria-hidden="true" />
                <span className="flex-1">
                  <span className="block text-xs text-[#3F4F4C]">Already ordered?</span>
                  <span className="block text-sm font-semibold text-[#0F1F1D] group-hover:underline underline-offset-4">
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
