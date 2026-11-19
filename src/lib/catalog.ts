import type { Catalog, CatalogCategory, CatalogCollection, Product } from '@/types/store'

/** "Owambe Collection" → "owambe-collection". Used for ids and for readable shop links. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50) || 'item'
  )
}

/** A new id from a name that doesn't clash with `taken` (ids never change once created). */
export function uniqueId(name: string, taken: string[]): string {
  const base = slugify(name)
  let id = base
  for (let n = 2; taken.includes(id); n++) id = `${base}-${n}`
  return id
}

export function categoryOf(p: Pick<Product, 'categoryId'>, catalog: Catalog): CatalogCategory | undefined {
  return p.categoryId ? catalog.categories.find((c) => c.id === p.categoryId) : undefined
}

/**
 * The product's collection. Products saved before collections had ids are matched by name,
 * so the original "Prima Collection" products still group correctly.
 */
export function collectionOf(
  p: Pick<Product, 'collectionId' | 'collection'>,
  catalog: Catalog
): CatalogCollection | undefined {
  if (p.collectionId) {
    const byId = catalog.collections.find((c) => c.id === p.collectionId)
    if (byId) return byId
  }
  const name = (p.collection || '').trim().toLowerCase()
  return name ? catalog.collections.find((c) => c.name.trim().toLowerCase() === name) : undefined
}

/** Display name for the product's collection, falling back to the text it was saved with. */
export function collectionName(p: Pick<Product, 'collectionId' | 'collection'>, catalog: Catalog): string {
  return collectionOf(p, catalog)?.name ?? (p.collection || '').trim()
}

/** "Size", or the category's own wording such as "Waist size (inches)". */
export function sizeLabelFor(p: Pick<Product, 'categoryId'>, catalog: Catalog): string {
  return categoryOf(p, catalog)?.sizeLabel?.trim() || 'Size'
}
