import type { Metadata } from 'next'

// Keep the studio portal out of search results. No robots.txt entry on purpose:
// listing /admin there would advertise the path to anyone who reads it.
export const metadata: Metadata = {
  title: 'Admin | Crafty Cottage',
  robots: { index: false, follow: false, nocache: true },
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children
}
