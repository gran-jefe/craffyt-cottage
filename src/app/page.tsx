import React, { Suspense } from 'react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { StorefrontClient } from '@/components/StorefrontClient'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      {/* The shop reads its filters from the URL (?category=…), which needs a Suspense boundary
          for static rendering. The fallback keeps the page height steady while it resolves. */}
      <Suspense fallback={<main className="min-h-screen" />}>
        <StorefrontClient />
      </Suspense>
      <SiteFooter />
    </>
  )
}
