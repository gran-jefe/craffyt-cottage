'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker in production only: in development it would cache hot-reloaded
 * files and make edits look like they didn't apply.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Not fatal: the shop works the same without it, just without offline support.
    })
  }, [])
  return null
}
