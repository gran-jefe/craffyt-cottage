import React from 'react'
import { SiteHeader } from '@/components/SiteHeader'
import { SiteFooter } from '@/components/SiteFooter'
import { StorefrontClient } from '@/components/StorefrontClient'

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <StorefrontClient />
      <SiteFooter />
    </>
  )
}
