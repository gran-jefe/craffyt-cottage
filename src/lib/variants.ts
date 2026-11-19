import type { Product, ProductVariant } from '@/types/store'

/** True when the product is sold through colour/size options rather than as a single piece. */
export function hasVariants(p: Pick<Product, 'variants'>): p is { variants: ProductVariant[] } {
  return Array.isArray(p.variants) && p.variants.length > 0
}

/** "Gold / Large", "Gold", or "Large". */
export function variantLabel(v: Pick<ProductVariant, 'color' | 'size'>): string {
  return [v.color, v.size].map((x) => x.trim()).filter(Boolean).join(' / ')
}

export function variantPrice(p: Pick<Product, 'price'>, v: Pick<ProductVariant, 'price'>): number {
  return typeof v.price === 'number' && v.price > 0 ? v.price : p.price
}

export function findVariant(p: Pick<Product, 'variants'>, variantId: string | undefined): ProductVariant | undefined {
  if (!variantId || !hasVariants(p)) return undefined
  return p.variants.find((v) => v.id === variantId)
}

/** Lowest and highest price a customer can pay for this product. */
export function priceRange(p: Pick<Product, 'price' | 'variants'>): { min: number; max: number } {
  if (!hasVariants(p)) return { min: p.price, max: p.price }
  const prices = p.variants.map((v) => variantPrice(p, v))
  return { min: Math.min(...prices), max: Math.max(...prices) }
}

export function sumStock(variants: ProductVariant[]): number {
  return variants.reduce((n, v) => n + Math.max(0, Math.floor(Number(v.stock) || 0)), 0)
}

/** Distinct non-empty values in first-seen order. */
export function uniqueOptions(variants: ProductVariant[], axis: 'color' | 'size'): string[] {
  const seen: string[] = []
  for (const v of variants) {
    const value = v[axis].trim()
    if (value && !seen.includes(value)) seen.push(value)
  }
  return seen
}

/** One cart/stock line per product option: "productId" or "productId::variantId". */
export function lineKey(productId: string, variantId?: string): string {
  return variantId ? `${productId}::${variantId}` : productId
}

export function newVariantId(): string {
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Cleans variants for storage. Firestore rejects `undefined`, so optional fields are only
 * written when they hold a real value.
 */
export function cleanVariants(raw: ProductVariant[] | undefined): ProductVariant[] {
  if (!Array.isArray(raw)) return []
  return raw.map((v) => {
    const out: ProductVariant = {
      id: String(v.id || newVariantId()),
      color: String(v.color || '').trim(),
      size: String(v.size || '').trim(),
      stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
    }
    const price = Number(v.price)
    if (Number.isFinite(price) && price > 0) out.price = price
    const img = String(v.imageUrl || '').trim()
    if (img) out.imageUrl = img
    return out
  })
}

/**
 * Applies stock moves to one product's stored stock. `moves` maps variantId ('' for the
 * product itself) to a signed quantity. Variant stock and the product total move together.
 * Lines pointing at a variant that no longer exists are skipped.
 */
export function applyStockMoves(
  stored: { stock?: unknown; variants?: ProductVariant[] },
  moves: Map<string, number>
): { stock: number; variants?: ProductVariant[] } {
  const variants = Array.isArray(stored.variants) && stored.variants.length > 0 ? cleanVariants(stored.variants) : null
  if (!variants) {
    let delta = 0
    for (const [, qty] of moves) delta += qty
    return { stock: Math.max(0, Math.floor(Number(stored.stock) || 0) + delta) }
  }
  const next = variants.map((v) => {
    const qty = moves.get(v.id)
    return qty ? { ...v, stock: Math.max(0, v.stock + qty) } : v
  })
  return { stock: sumStock(next), variants: next }
}

/** Stock currently available for a line: the variant's when it has one, else the product's. */
export function stockForLine(
  stored: { stock?: unknown; variants?: ProductVariant[] },
  variantId: string | undefined
): number | null {
  const hasOpts = Array.isArray(stored.variants) && stored.variants.length > 0
  if (variantId) {
    const v = hasOpts ? stored.variants!.find((x) => x.id === variantId) : undefined
    return v ? Math.max(0, Math.floor(Number(v.stock) || 0)) : null
  }
  // An old line without a variant can't be matched to one option of a product that now has several.
  if (hasOpts) return null
  return Math.max(0, Math.floor(Number(stored.stock) || 0))
}
