'use client'

import React, { useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  X,
  Loader2,
  Package,
  Minus,
} from 'lucide-react'
import {
  ReceiptFileError,
  adjustProductStockBy,
  deleteProduct,
  saveProduct,
  seedInitialProducts,
  uploadMediaFile,
  usesCloudStorage,
} from '@/lib/storeService'
import { formatNaira } from '@/lib/defaults'
import { useCart } from '@/context/CartContext'
import { hasVariants, newVariantId, sumStock, variantLabel, variantPrice } from '@/lib/variants'
import type { Product, ProductVariant } from '@/types/store'
import { useDialogFocus } from '@/lib/useDialogFocus'

interface Props {
  products: Product[]
  onRefresh: () => Promise<void>
}

interface VariantDraft {
  id: string
  color: string
  size: string
  /** Blank means "same as the product price". */
  price: string
  stock: string
  imageUrl: string
}

function emptyVariant(stock = '1'): VariantDraft {
  return { id: newVariantId(), color: '', size: '', price: '', stock, imageUrl: '' }
}

/** Firestore documents cap at 1 MB; inline (non-Storage) photos count towards it. */
const MAX_INLINE_PRODUCT_BYTES = 900 * 1024

interface ProductFormState {
  hasOptions: boolean
  variants: VariantDraft[]
  id?: string
  createdAt?: string
  name: string
  collection: string
  price: string
  stock: string
  tag: string
  description: string
  imageUrl: string
  active: boolean
  featured: boolean
}

const EMPTY_FORM: ProductFormState = {
  name: '',
  collection: 'Prima Collection',
  price: '',
  stock: '5',
  tag: '',
  description: '',
  // No default photo: a new piece must never go live wearing another bag's picture.
  imageUrl: '',
  active: true,
  featured: false,
  hasOptions: false,
  variants: [],
}

/** Returns an admin-readable problem with the options, or '' when they can be saved. */
function validateVariants(drafts: VariantDraft[]): string {
  if (drafts.length === 0) return 'Add at least one option, or switch options off.'
  const withColor = drafts.filter((d) => d.color.trim()).length
  const withSize = drafts.filter((d) => d.size.trim()).length
  if (drafts.some((d) => !d.color.trim() && !d.size.trim())) {
    return 'Each option needs a colour, a size, or both.'
  }
  // Mixed rows can't be chosen on the storefront: "Gold" next to a blank colour has no button.
  if (withColor > 0 && withColor < drafts.length) return 'Give every option a colour, or leave colour blank on all of them.'
  if (withSize > 0 && withSize < drafts.length) return 'Give every option a size, or leave size blank on all of them.'
  const seen = new Set<string>()
  for (const d of drafts) {
    const key = `${d.color.trim().toLowerCase()}|${d.size.trim().toLowerCase()}`
    if (seen.has(key)) return `"${variantLabel(d)}" is listed twice. Each colour and size combination should appear once.`
    seen.add(key)
    const stock = Number(d.stock)
    if (!Number.isInteger(stock) || stock < 0) return `Stock for "${variantLabel(d)}" must be 0 or a whole number.`
    if (d.price.trim() && !(Number(d.price) > 0)) return `Price for "${variantLabel(d)}" must be above ₦0, or left blank.`
  }
  return ''
}

function toVariants(drafts: VariantDraft[]): ProductVariant[] {
  return drafts.map((d) => {
    const v: ProductVariant = { id: d.id, color: d.color.trim(), size: d.size.trim(), stock: Number(d.stock) }
    if (d.price.trim()) v.price = Number(d.price)
    if (d.imageUrl.trim()) v.imageUrl = d.imageUrl.trim()
    return v
  })
}

export function AdminInventory({ products, onRefresh }: Props) {
  const { showToast } = useCart()
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM)
  const [uploadingImg, setUploadingImg] = useState(false)
  const [uploadingVariantId, setUploadingVariantId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [formError, setFormError] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const modalRef = useDialogFocus<HTMLDivElement>(modalOpen)

  // Two-step delete: the armed state expires so a stray tap later can't delete.
  useEffect(() => {
    if (!confirmDeleteId) return
    const timer = setTimeout(() => setConfirmDeleteId(null), 4000)
    return () => clearTimeout(timer)
  }, [confirmDeleteId])

  useEffect(() => {
    if (!modalOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving && !uploadingImg && !uploadingVariantId) setModalOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [modalOpen, saving, uploadingImg, uploadingVariantId])

  function openNew() {
    setForm(EMPTY_FORM)
    setFormError('')
    setModalOpen(true)
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id,
      createdAt: p.createdAt,
      name: p.name,
      collection: p.collection,
      price: String(p.price),
      stock: String(p.stock),
      tag: p.tag,
      description: p.description,
      imageUrl: p.imageUrl,
      active: p.active,
      featured: p.featured,
      hasOptions: hasVariants(p),
      variants: (p.variants ?? []).map((v) => ({
        id: v.id,
        color: v.color,
        size: v.size,
        price: v.price ? String(v.price) : '',
        stock: String(v.stock),
        imageUrl: v.imageUrl ?? '',
      })),
    })
    setFormError('')
    setModalOpen(true)
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Product image must be under 5 MB.')
      return
    }
    setUploadingImg(true)
    setFormError('')
    try {
      const url = await uploadMediaFile(file, 'products')
      setForm((prev) => ({ ...prev, imageUrl: url }))
      showToast('Product photo uploaded.')
    } catch (err) {
      setFormError(
        err instanceof ReceiptFileError
          ? 'We couldn’t read this photo (iPhone HEIC photos often can’t be opened). Please use a JPG or PNG.'
          : 'Could not upload the photo. Check your connection and try again.'
      )
    } finally {
      setUploadingImg(false)
    }
  }

  function updateVariant(id: string, patch: Partial<VariantDraft>) {
    setForm((f) => ({ ...f, variants: f.variants.map((v) => (v.id === id ? { ...v, ...patch } : v)) }))
  }

  function setHasOptions(on: boolean) {
    setForm((f) => ({
      ...f,
      hasOptions: on,
      // Start with one row carrying the current stock so nothing is lost when switching on.
      variants: on && f.variants.length === 0 ? [emptyVariant(f.stock || '0')] : f.variants,
    }))
  }

  async function handleVariantImage(id: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Option photos must be under 5 MB.')
      return
    }
    setUploadingVariantId(id)
    setFormError('')
    try {
      const url = await uploadMediaFile(file, 'products')
      updateVariant(id, { imageUrl: url })
    } catch (err) {
      setFormError(
        err instanceof ReceiptFileError
          ? 'We couldn’t read this photo (iPhone HEIC photos often can’t be opened). Please use a JPG or PNG.'
          : 'Could not upload the photo. Check your connection and try again.'
      )
    } finally {
      setUploadingVariantId(null)
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setFormError('')
    const numPrice = Number(form.price)
    const numStock = Number(form.stock)

    if (form.name.trim().length < 2) {
      setFormError('Product name is required.')
      return
    }
    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      setFormError('Please enter a valid price in Naira.')
      return
    }
    if (!form.hasOptions && (!Number.isInteger(numStock) || numStock < 0)) {
      setFormError('Stock count must be 0 or a positive whole number.')
      return
    }
    if (form.hasOptions) {
      const problem = validateVariants(form.variants)
      if (problem) {
        setFormError(problem)
        return
      }
    }
    if (!form.imageUrl.trim()) {
      setFormError('Upload a photo of this piece (or paste its image URL) before saving.')
      return
    }

    const variants = form.hasOptions ? toVariants(form.variants) : []
    const input = {
      id: form.id,
      createdAt: form.createdAt,
      name: form.name,
      collection: form.collection || 'Prima Collection',
      price: numPrice,
      stock: form.hasOptions ? sumStock(variants) : numStock,
      tag: form.tag,
      description: form.description,
      imageUrl: form.imageUrl,
      active: form.active,
      featured: form.featured,
      variants,
    }
    if (!usesCloudStorage && new Blob([JSON.stringify(input)]).size > MAX_INLINE_PRODUCT_BYTES) {
      setFormError(
        'This product has too many photos to store in one record. Remove some option photos (options without a photo use the main one), or turn on Firebase Storage.'
      )
      return
    }

    setSaving(true)
    try {
      await saveProduct(input)
      await onRefresh()
      setModalOpen(false)
      showToast(form.id ? 'Product updated.' : 'New product added to store!')
    } catch {
      setFormError('Could not save product. Make sure your admin account has write permissions.')
    } finally {
      setSaving(false)
    }
  }

  async function handleStockDelta(product: Product, delta: number, variant?: ProductVariant) {
    const name = variant ? `${product.name} (${variantLabel(variant)})` : product.name
    setBusyId(variant ? `${product.id}::${variant.id}` : product.id)
    try {
      const next = await adjustProductStockBy(product.id, delta, variant?.id)
      await onRefresh()
      showToast(`Stock for ${name} updated to ${next}.`)
    } catch {
      showToast(`Could not update stock for ${name}. Check your connection and try again.`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(product: Product) {
    if (confirmDeleteId !== product.id) {
      setConfirmDeleteId(product.id)
      return
    }
    setConfirmDeleteId(null)
    setBusyId(product.id)
    try {
      await deleteProduct(product.id)
      await onRefresh()
      showToast(`${product.name} removed from inventory.`)
    } catch {
      showToast(`Could not delete ${product.name}. Check your connection and try again.`, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSeed() {
    setSeeding(true)
    try {
      await seedInitialProducts()
      await onRefresh()
      showToast('Prima Collection starter products loaded!')
    } catch {
      showToast('Could not load the starter products. Check your connection and try again.', 'error')
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-display text-2xl font-bold text-[#17210E]">
            Inventory
          </h2>
          <p className="text-xs text-[#4A5240]">
            Add new beaded bags, adjust live stock counts, or hide seasonal pieces.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openNew}
            className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 shadow-xs"
          >
            <Plus className="w-4 h-4 text-[#E6C975]" />
            <span>Add product</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {products.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E2DACA] p-10 text-center space-y-4">
          <Package className="w-8 h-8 text-[#4A5240] mx-auto opacity-60" />
          <div className="space-y-1">
            <p className="font-serif-display text-lg font-bold text-[#17210E]">
              Your shop has no products yet
            </p>
            <p className="text-sm text-[#4A5240]">
              Seed the authentic 4 Prima bags with one click or create your first piece manually.
            </p>
          </div>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={handleSeed}
              disabled={seeding}
              className="min-h-[44px] px-5 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-60"
            >
              {seeding && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{seeding ? 'Loading products...' : 'Load Prima Collection'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl border border-[#E2DACA] p-4 flex gap-4 items-start"
            >
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-20 h-20 rounded-xl object-cover bg-[#E8DEC8] shrink-0"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-serif-display text-base font-bold text-[#17210E] truncate">
                      {product.name}
                    </h3>
                    <p className="text-xs text-[#4A5240]">
                      {product.collection} · <strong className="text-[#263E0F]">{formatNaira(product.price)}</strong>
                    </p>
                  </div>
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      !product.active
                        ? 'bg-neutral-200 text-neutral-700'
                        : product.stock <= 0
                        ? 'bg-red-100 text-[#B42318]'
                        : 'bg-[#EAF2DE] text-[#263E0F]'
                    }`}
                  >
                    {!product.active
                      ? 'Hidden'
                      : product.stock <= 0
                      ? 'Sold out'
                      : `${product.stock} left`}
                  </span>
                </div>

                {hasVariants(product) && (
                  <ul className="divide-y divide-[#F4EFE6] border-y border-[#F4EFE6]">
                    {product.variants.map((v) => {
                      const busy = busyId === `${product.id}::${v.id}`
                      const label = variantLabel(v)
                      return (
                        <li key={v.id} className="flex items-center gap-2 py-1">
                          {v.imageUrl && (
                            <img src={v.imageUrl} alt="" width={28} height={28} className="w-7 h-7 rounded-md object-cover shrink-0" />
                          )}
                          <span className="flex-1 min-w-0 text-xs">
                            <span className="block font-semibold text-[#17210E] truncate">{label}</span>
                            {v.price ? (
                              <span className="block text-[#4A5240] tabular-nums">{formatNaira(variantPrice(product, v))}</span>
                            ) : null}
                          </span>
                          <button
                            type="button"
                            disabled={busy || v.stock <= 0}
                            onClick={() => handleStockDelta(product, -1, v)}
                            aria-label={`Decrease stock for ${product.name}, ${label}`}
                            className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] disabled:opacity-40 flex items-center justify-center"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span
                            className={`text-xs font-bold w-7 text-center tabular-nums ${v.stock <= 0 ? 'text-[#B42318]' : ''}`}
                          >
                            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : v.stock}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => handleStockDelta(product, 1, v)}
                            aria-label={`Increase stock for ${product.name}, ${label}`}
                            className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] disabled:opacity-40 flex items-center justify-center"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {/* Stock Controls & Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {hasVariants(product) ? (
                    <span className="text-xs text-[#4A5240]">
                      {product.variants.length} options · {product.stock} in total
                    </span>
                  ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={busyId === product.id || product.stock <= 0}
                      onClick={() => handleStockDelta(product, -1)}
                      aria-label={`Decrease stock for ${product.name}`}
                      className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] disabled:opacity-40 flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold w-8 text-center tabular-nums">
                      {product.stock}
                    </span>
                    <button
                      type="button"
                      disabled={busyId === product.id}
                      onClick={() => handleStockDelta(product, 1)}
                      aria-label={`Increase stock for ${product.name}`}
                      className="min-w-[44px] min-h-[44px] rounded-lg border border-[#E2DACA] bg-[#FAF8F4] hover:bg-[#F4EFE6] flex items-center justify-center"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEdit(product)}
                      className="min-h-[44px] px-3 rounded-lg border border-[#E2DACA] hover:border-[#263E0F] text-xs font-semibold text-[#17210E] flex items-center gap-1"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === product.id}
                      onClick={() => handleDelete(product)}
                      aria-label={
                        confirmDeleteId === product.id
                          ? `Confirm delete ${product.name}`
                          : `Delete ${product.name}`
                      }
                      className={`min-w-[44px] min-h-[44px] rounded-lg border flex items-center justify-center gap-1.5 text-xs font-bold transition-colors disabled:opacity-40 ${
                        confirmDeleteId === product.id
                          ? 'px-3 bg-[#B42318] border-[#B42318] text-white hover:bg-[#912018]'
                          : 'border-[#E2DACA] hover:bg-red-50 hover:border-red-300 text-[#B42318]'
                      }`}
                    >
                      {busyId === product.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                      {confirmDeleteId === product.id && <span>Tap again to delete</span>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#111B07]/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-modal-title"
          onClick={() => !saving && !uploadingImg && !uploadingVariantId && setModalOpen(false)}
        >
          <div
            ref={modalRef}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl border border-[#E2DACA] max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2DACA] pb-3">
              <h3 id="product-modal-title" className="font-serif-display text-xl font-bold text-[#17210E]">
                {form.id ? 'Edit product' : 'Add a new piece'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close product dialog"
                className="min-w-[44px] min-h-[44px] rounded-xl border border-[#E2DACA] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {/* Image preview + upload */}
              <div className="flex items-center gap-4">
                {form.imageUrl ? (
                  <img
                    src={form.imageUrl}
                    alt="Product preview"
                    width={80}
                    height={80}
                    className="w-20 h-20 rounded-xl object-cover bg-[#E8DEC8] border border-[#E2DACA] shrink-0"
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className="w-20 h-20 rounded-xl bg-[#F4EFE6] border border-dashed border-[#8C8270] text-[#4A5240] grid place-items-center shrink-0"
                  >
                    <Package className="w-6 h-6" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <label
                    htmlFor="prod-img-upload"
                    className="inline-flex items-center gap-2 min-h-[44px] px-3.5 rounded-xl border border-[#263E0F] text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold cursor-pointer"
                  >
                    {uploadingImg ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                    <span>{uploadingImg ? 'Uploading...' : 'Upload photo'}</span>
                    <input
                      id="prod-img-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="sr-only"
                    />
                  </label>
                  <label htmlFor="prod-img-url" className="sr-only">
                    Product image URL
                  </label>
                  <input
                    id="prod-img-url"
                    type="text"
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                    placeholder="Or paste image URL"
                    className="w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-[#FAF8F4] text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="prod-name" className="block text-xs font-bold mb-1">
                    Product name *
                  </label>
                  <input
                    id="prod-name"
                    data-autofocus
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Dupree Midi"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="prod-col" className="block text-xs font-bold mb-1">
                    Collection *
                  </label>
                  <input
                    id="prod-col"
                    type="text"
                    value={form.collection}
                    onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value }))}
                    placeholder="Prima Collection"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                  />
                </div>
              </div>

              <div className={`grid gap-3 ${form.hasOptions ? 'grid-cols-2' : 'grid-cols-3'}`}>
                <div>
                  <label htmlFor="prod-price" className="block text-xs font-bold mb-1">
                    {form.hasOptions ? 'Base price (₦) *' : 'Price (₦) *'}
                  </label>
                  <input
                    id="prod-price"
                    type="number"
                    min="1"
                    value={form.price}
                    onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                    placeholder="45000"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                  />
                </div>
                {!form.hasOptions && (
                <div>
                  <label htmlFor="prod-stock" className="block text-xs font-bold mb-1">
                    Stock quantity *
                  </label>
                  <input
                    id="prod-stock"
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                  />
                </div>
                )}
                <div>
                  <label htmlFor="prod-tag" className="block text-xs font-bold mb-1">
                    Badge
                  </label>
                  <input
                    id="prod-tag"
                    type="text"
                    value={form.tag}
                    onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                    placeholder="Signature"
                    className="w-full min-h-[44px] px-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                  />
                </div>
              </div>

              {/* Colour & size options */}
              <div className="rounded-xl border border-[#E2DACA] p-3.5 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.hasOptions}
                    onChange={(e) => setHasOptions(e.target.checked)}
                    className="w-4 h-4 mt-0.5 accent-[#263E0F]"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[#17210E]">
                      Comes in different colours or sizes
                    </span>
                    <span className="block text-xs text-[#4A5240] leading-relaxed">
                      Customers pick an option before adding to bag. Each option has its own stock, and can
                      have its own price and photo.
                    </span>
                  </span>
                </label>

                {form.hasOptions && (
                  <div className="space-y-2.5">
                    {form.variants.map((v, index) => {
                      const uploading = uploadingVariantId === v.id
                      const n = index + 1
                      return (
                        <fieldset key={v.id} className="rounded-xl bg-[#FAF8F4] border border-[#E2DACA] p-3">
                          <legend className="sr-only">Option {n}</legend>
                          <div className="flex gap-3">
                            <label
                              htmlFor={`var-img-${v.id}`}
                              className="w-14 h-14 rounded-lg border border-dashed border-[#8C8270] bg-white overflow-hidden grid place-items-center shrink-0 cursor-pointer hover:border-[#263E0F]"
                              title="Upload a photo of this option"
                            >
                              {uploading ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#263E0F]" />
                              ) : v.imageUrl ? (
                                <img src={v.imageUrl} alt="" width={56} height={56} className="w-full h-full object-cover" />
                              ) : (
                                <Upload className="w-4 h-4 text-[#4A5240]" />
                              )}
                              <span className="sr-only">Photo for option {n} (optional)</span>
                              <input
                                id={`var-img-${v.id}`}
                                type="file"
                                accept="image/*"
                                disabled={uploading}
                                onChange={(e) => handleVariantImage(v.id, e)}
                                className="sr-only"
                              />
                            </label>
                            <div className="flex-1 min-w-0 grid grid-cols-2 gap-2">
                              <div>
                                <label htmlFor={`var-color-${v.id}`} className="block text-xs font-semibold mb-1">
                                  Colour
                                </label>
                                <input
                                  id={`var-color-${v.id}`}
                                  type="text"
                                  value={v.color}
                                  maxLength={40}
                                  onChange={(e) => updateVariant(v.id, { color: e.target.value })}
                                  placeholder="e.g. Gold"
                                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-white text-sm"
                                />
                              </div>
                              <div>
                                <label htmlFor={`var-size-${v.id}`} className="block text-xs font-semibold mb-1">
                                  Size
                                </label>
                                <input
                                  id={`var-size-${v.id}`}
                                  type="text"
                                  value={v.size}
                                  maxLength={40}
                                  onChange={(e) => updateVariant(v.id, { size: e.target.value })}
                                  placeholder="e.g. Midi"
                                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-white text-sm"
                                />
                              </div>
                              <div>
                                <label htmlFor={`var-price-${v.id}`} className="block text-xs font-semibold mb-1">
                                  Price (₦)
                                </label>
                                <input
                                  id={`var-price-${v.id}`}
                                  type="number"
                                  min="1"
                                  value={v.price}
                                  onChange={(e) => updateVariant(v.id, { price: e.target.value })}
                                  placeholder={form.price ? `${form.price} (base)` : 'Base price'}
                                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-white text-sm tabular-nums"
                                />
                              </div>
                              <div>
                                <label htmlFor={`var-stock-${v.id}`} className="block text-xs font-semibold mb-1">
                                  Stock *
                                </label>
                                <input
                                  id={`var-stock-${v.id}`}
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={v.stock}
                                  onChange={(e) => updateVariant(v.id, { stock: e.target.value })}
                                  className="w-full min-h-[44px] px-3 rounded-lg border border-[#E2DACA] bg-white text-sm tabular-nums"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-end gap-1">
                            {v.imageUrl && (
                              <button
                                type="button"
                                onClick={() => updateVariant(v.id, { imageUrl: '' })}
                                className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-[#4A5240] hover:bg-[#F4EFE6]"
                              >
                                Remove photo
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() =>
                                setForm((f) => ({ ...f, variants: f.variants.filter((x) => x.id !== v.id) }))
                              }
                              aria-label={`Remove option ${n}${variantLabel(v) ? `, ${variantLabel(v)}` : ''}`}
                              className="min-h-[44px] px-3 rounded-lg text-xs font-semibold text-[#B42318] hover:bg-red-50 flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </fieldset>
                      )
                    })}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, variants: [...f.variants, emptyVariant()] }))}
                        className="min-h-[44px] px-3.5 rounded-xl border border-[#263E0F]/40 text-[#263E0F] hover:bg-[#EAF2DE] text-xs font-bold flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add option</span>
                      </button>
                      <span className="text-xs text-[#4A5240] tabular-nums">
                        Total stock: {sumStock(toVariants(form.variants.filter((d) => Number.isInteger(Number(d.stock)))))}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="prod-desc" className="block text-xs font-bold mb-1">
                  Description
                </label>
                <textarea
                  id="prod-desc"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Hand-beaded crystal texture with satin inner lining..."
                  className="w-full p-3 rounded-xl border border-[#E2DACA] bg-[#FAF8F4] text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
                    className="w-4 h-4 accent-[#263E0F]"
                  />
                  <span className="font-semibold">Visible on storefront</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.featured}
                    onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
                    className="w-4 h-4 accent-[#263E0F]"
                  />
                  <span className="font-semibold">Featured piece</span>
                </label>
              </div>

              {formError && (
                <p role="alert" className="text-xs text-[#B42318] bg-red-50 border border-red-200 p-3 rounded-xl">
                  {formError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="min-h-[44px] px-4 rounded-xl border border-[#E2DACA] text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || uploadingImg || Boolean(uploadingVariantId)}
                  className="min-h-[44px] px-6 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{saving ? 'Saving...' : 'Save product'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
