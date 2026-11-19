import type { MetadataRoute } from 'next'

/** Web app manifest: lets customers (and the owner, for admin) install Crafty Cottage like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Crafty Cottage',
    short_name: 'Crafty Cottage',
    description: 'Hand-beaded bags and accessories, made in Nigeria.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FAF8F4',
    theme_color: '#0B3D3A',
    categories: ['shopping', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Shop the collection', short_name: 'Shop', url: '/#shop', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Track my order', short_name: 'Track', url: '/track', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
