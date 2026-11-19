'use client'

import { useEffect, useState } from 'react'
import { fetchCatalog } from '@/lib/storeService'
import { DEFAULT_CATALOG } from '@/lib/defaults'
import type { Catalog } from '@/types/store'

// One request per page load, shared by the header and the shop.
let pending: Promise<Catalog> | null = null

/**
 * The shop's categories and collections. Starts from the starter catalogue so navigation
 * renders immediately, then swaps in the admin's saved one.
 */
export function useCatalog(): { catalog: Catalog; loaded: boolean } {
  const [state, setState] = useState<{ catalog: Catalog; loaded: boolean }>({ catalog: DEFAULT_CATALOG, loaded: false })
  useEffect(() => {
    let active = true
    pending ??= fetchCatalog().catch(() => {
      pending = null // let a later page retry
      return DEFAULT_CATALOG
    })
    pending.then((catalog) => {
      if (active) setState({ catalog, loaded: true })
    })
    return () => {
      active = false
    }
  }, [])
  return state
}
