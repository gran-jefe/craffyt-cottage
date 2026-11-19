'use client'

import React, { useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, FolderTree, Loader2, Plus, Trash2 } from 'lucide-react'
import { saveCatalog } from '@/lib/storeService'
import { categoryOf, collectionOf, uniqueId } from '@/lib/catalog'
import { useCart } from '@/context/CartContext'
import type { Catalog, CatalogCategory, CatalogCollection, Product } from '@/types/store'

interface Props {
  catalog: Catalog
  products: Product[]
  /** Catalogue couldn't be loaded: editing is locked so the saved one is never overwritten blind. */
  loadFailed: boolean
  onRefresh: () => Promise<void>
}

type Kind = 'categories' | 'collections'

/** Rows keep a draft key so new rows have a stable React key before they get an id. */
type Row<T> = T & { key: string; isNew?: boolean }

function toRows<T extends { id: string }>(items: T[]): Row<T>[] {
  return items.map((i) => ({ ...i, key: i.id }))
}

/**
 * Admin › Catalogue: the categories customers browse by (Bags, Waist beads…) and the themed
 * collections (Prima, Owambe…). Order here is the order on the storefront.
 */
export function AdminCatalog({ catalog, products, loadFailed, onRefresh }: Props) {
  const { showToast } = useCart()
  const [categories, setCategories] = useState<Row<CatalogCategory>[]>(() => toRows(catalog.categories))
  const [collections, setCollections] = useState<Row<CatalogCollection>[]>(() => toRows(catalog.collections))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const usage = useMemo(() => {
    const cat = new Map<string, number>()
    const col = new Map<string, number>()
    for (const p of products) {
      const c = categoryOf(p, catalog)
      if (c) cat.set(c.id, (cat.get(c.id) ?? 0) + 1)
      const k = collectionOf(p, catalog)
      if (k) col.set(k.id, (col.get(k.id) ?? 0) + 1)
    }
    return { cat, col }
  }, [products, catalog])
  const uncategorised = products.filter((p) => !categoryOf(p, catalog)).length

  const dirty =
    JSON.stringify(categories.map(({ key, isNew, ...c }) => c)) !== JSON.stringify(catalog.categories) ||
    JSON.stringify(collections.map(({ key, isNew, ...c }) => c)) !== JSON.stringify(catalog.collections)

  function move<T>(list: T[], index: number, delta: number): T[] {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return list
    ;[next[index], next[target]] = [next[target], next[index]]
    return next
  }

  function validate(): string {
    for (const [label, rows] of [
      ['category', categories],
      ['collection', collections],
    ] as const) {
      const names = new Set<string>()
      for (const r of rows) {
        const n = r.name.trim().toLowerCase()
        if (!n) return `Every ${label} needs a name.`
        if (n.length > 40) return `"${r.name.trim().slice(0, 20)}…" is too long. Keep ${label} names under 40 characters.`
        if (names.has(n)) return `There are two ${label === 'category' ? 'categories' : 'collections'} called "${r.name.trim()}".`
        names.add(n)
      }
    }
    if (categories.length === 0) return 'Keep at least one category so customers can browse.'
    if (collections.length === 0) return 'Keep at least one collection.'
    return ''
  }

  async function handleSave() {
    const problem = validate()
    setError(problem)
    if (problem) return
    // New rows get a permanent id from their name; existing ids never change, so products stay linked.
    const catIds = categories.filter((c) => !c.isNew).map((c) => c.id)
    const colIds = collections.filter((c) => !c.isNew).map((c) => c.id)
    const nextCategories = categories.map(({ key, isNew, ...c }) => {
      if (!isNew) return c
      const id = uniqueId(c.name, catIds)
      catIds.push(id)
      return { ...c, id }
    })
    const nextCollections = collections.map(({ key, isNew, ...c }) => {
      if (!isNew) return c
      const id = uniqueId(c.name, colIds)
      colIds.push(id)
      return { ...c, id }
    })
    setSaving(true)
    try {
      await saveCatalog({ categories: nextCategories, collections: nextCollections })
      await onRefresh()
      setCategories(toRows(nextCategories))
      setCollections(toRows(nextCollections))
      showToast('Catalogue saved. The shop now shows these categories and collections.')
    } catch {
      setError('Could not save the catalogue. Check your connection and try again. Your changes are still here.')
    } finally {
      setSaving(false)
    }
  }

  function renderList<T extends CatalogCategory | CatalogCollection>(
    kind: Kind,
    rows: Row<T>[],
    setRows: React.Dispatch<React.SetStateAction<Row<T>[]>>,
    counts: Map<string, number>
  ) {
    const singular = kind === 'categories' ? 'category' : 'collection'
    return (
      <ul className="divide-y divide-[#F4EFE6] border-y border-[#F4EFE6]">
        {rows.map((row, index) => {
          const used = row.isNew ? 0 : counts.get(row.id) ?? 0
          const update = (patch: Partial<CatalogCategory & CatalogCollection>) =>
            setRows((prev) => prev.map((r) => (r.key === row.key ? ({ ...r, ...patch } as Row<T>) : r)))
          return (
            <li key={row.key} className="py-3 flex flex-wrap items-start gap-2">
              <div className="flex-1 min-w-[180px] space-y-2">
                <label className="sr-only" htmlFor={`${kind}-${row.key}-name`}>
                  {singular} name
                </label>
                <input
                  id={`${kind}-${row.key}-name`}
                  type="text"
                  value={row.name}
                  maxLength={40}
                  disabled={loadFailed}
                  onChange={(e) => update({ name: e.target.value })}
                  placeholder={kind === 'categories' ? 'e.g. Waist beads' : 'e.g. Owambe Collection'}
                  className="w-full min-h-[44px] px-3 rounded-xl border border-[#8C8270] bg-[#FAF8F4] text-base sm:text-sm font-semibold"
                />
                {kind === 'categories' ? (
                  <>
                    <label className="sr-only" htmlFor={`${kind}-${row.key}-size`}>
                      What size means for {row.name || 'this category'}
                    </label>
                    <input
                      id={`${kind}-${row.key}-size`}
                      type="text"
                      maxLength={40}
                      disabled={loadFailed}
                      value={(row as Row<CatalogCategory>).sizeLabel ?? ''}
                      onChange={(e) => update({ sizeLabel: e.target.value })}
                      placeholder='Size label shown to customers, e.g. "Waist size (inches)"'
                      className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-base sm:text-sm"
                    />
                  </>
                ) : (
                  <>
                    <label className="sr-only" htmlFor={`${kind}-${row.key}-desc`}>
                      Short description of {row.name || 'this collection'}
                    </label>
                    <input
                      id={`${kind}-${row.key}-desc`}
                      type="text"
                      maxLength={140}
                      disabled={loadFailed}
                      value={(row as Row<CatalogCollection>).description ?? ''}
                      onChange={(e) => update({ description: e.target.value })}
                      placeholder="Optional one-line description for the shop"
                      className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-white text-base sm:text-sm"
                    />
                  </>
                )}
                <p className="text-xs text-[#3F4F4C]">
                  {row.isNew ? 'New, not saved yet' : `${used} ${used === 1 ? 'product' : 'products'}`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={index === 0 || loadFailed}
                  onClick={() => setRows((prev) => move(prev, index, -1))}
                  aria-label={`Move ${row.name || singular} up`}
                  className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] hover:border-[#0B3D3A] grid place-items-center disabled:opacity-30"
                >
                  <ArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={index === rows.length - 1 || loadFailed}
                  onClick={() => setRows((prev) => move(prev, index, 1))}
                  aria-label={`Move ${row.name || singular} down`}
                  className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] hover:border-[#0B3D3A] grid place-items-center disabled:opacity-30"
                >
                  <ArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  // Products would lose their place in the shop, so in-use rows can't be removed.
                  disabled={used > 0 || loadFailed}
                  title={used > 0 ? `Move its ${used} products to another ${singular} first` : undefined}
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                  aria-label={
                    used > 0
                      ? `Can't remove ${row.name}: ${used} products use it`
                      : `Remove ${row.name || `new ${singular}`}`
                  }
                  className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] hover:bg-red-50 hover:border-red-300 text-[#B42318] grid place-items-center disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    )
  }

  const addRow = (kind: Kind) => {
    const key = `new-${Date.now()}`
    if (kind === 'categories') setCategories((prev) => [...prev, { id: key, key, name: '', isNew: true }])
    else setCollections((prev) => [...prev, { id: key, key, name: '', isNew: true }])
    requestAnimationFrame(() => document.getElementById(`${kind}-${key}-name`)?.focus())
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-2xl font-bold text-[#0F1F1D]">Catalogue</h2>
          <p className="text-xs text-[#3F4F4C] leading-relaxed max-w-xl">
            Categories are what customers shop by (Bags, Waist beads). Collections are themed ranges that can mix
            categories (Owambe Collection). The order here is the order in the shop.
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving || loadFailed}
          className="min-h-[44px] px-5 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
          {saving ? 'Saving...' : dirty ? 'Save catalogue' : 'All changes saved'}
        </button>
      </div>

      {loadFailed && (
        <p role="alert" className="flex items-start gap-2 p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-[#7A1B14]">
          <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
          The saved catalogue couldn&apos;t be loaded, so editing is paused to avoid overwriting it. Refresh the page to try again.
        </p>
      )}
      {uncategorised > 0 && !loadFailed && (
        <p className="flex items-start gap-2 p-4 rounded-xl bg-amber-50 border border-amber-300 text-sm text-amber-950">
          <FolderTree className="w-5 h-5 shrink-0 text-amber-700" aria-hidden="true" />
          {uncategorised} {uncategorised === 1 ? 'product has' : 'products have'} no category yet, so they only appear
          under "All" in the shop. Edit them in Inventory to choose one.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-[#B42318] bg-red-50 border border-red-200 p-3 rounded-xl">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <section aria-labelledby="cat-heading" className="bg-white rounded-2xl border border-[#E2DACA] p-5 space-y-3">
          <div>
            <h3 id="cat-heading" className="font-serif-display text-lg font-bold text-[#0F1F1D]">Categories</h3>
            <p className="text-xs text-[#3F4F4C] leading-relaxed">
              The size label is what customers see when choosing a size, e.g. &ldquo;Waist size (inches)&rdquo;.
            </p>
          </div>
          {renderList('categories', categories, setCategories, usage.cat)}
          <button
            type="button"
            onClick={() => addRow('categories')}
            disabled={loadFailed}
            className="min-h-[44px] px-3.5 rounded-xl border border-[#0B3D3A]/40 text-[#0B3D3A] hover:bg-[#E3F0EE] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add category
          </button>
        </section>

        <section aria-labelledby="col-heading" className="bg-white rounded-2xl border border-[#E2DACA] p-5 space-y-3">
          <div>
            <h3 id="col-heading" className="font-serif-display text-lg font-bold text-[#0F1F1D]">Collections</h3>
            <p className="text-xs text-[#3F4F4C] leading-relaxed">
              A collection can include bags, waist beads and neckpieces together.
            </p>
          </div>
          {renderList('collections', collections, setCollections, usage.col)}
          <button
            type="button"
            onClick={() => addRow('collections')}
            disabled={loadFailed}
            className="min-h-[44px] px-3.5 rounded-xl border border-[#0B3D3A]/40 text-[#0B3D3A] hover:bg-[#E3F0EE] text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            Add collection
          </button>
        </section>
      </div>
    </div>
  )
}
