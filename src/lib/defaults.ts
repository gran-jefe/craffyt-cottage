import type { Product, StoreSettings } from '@/types/store'

export const DEFAULT_PRODUCTS: Product[] = [
  {
    id: 'dupree-gold',
    name: 'Dupree Midi, Gold',
    collection: 'Prima Collection',
    price: 45000,
    stock: 4,
    tag: 'Signature',
    description:
      'Sculptural heart silhouette crafted with faceted metallic gold acrylic beads, sturdy beaded top handle, and satin lining.',
    imageUrl: '/images/products/dupree-gold.jpg',
    active: true,
    featured: true,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
  },
  {
    id: 'dupree-purple',
    name: 'Dupree Midi, Purple',
    collection: 'Prima Collection',
    price: 45000,
    stock: 3,
    tag: 'Royal Amethyst',
    description:
      'The signature heart shape in deep translucent amethyst purple crystal beads that catch direct light effortlessly.',
    imageUrl: '/images/products/dupree-purple.jpg',
    active: true,
    featured: true,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
  },
  {
    id: 'pearly',
    name: 'Pearly',
    collection: 'Prima Collection',
    price: 35000,
    stock: 5,
    tag: 'Oversized Pearls',
    description:
      'Lustrous jumbo faux pearls with an arched oversized pearl handle and satin interior. Made for weddings and dinner dates.',
    imageUrl: '/images/products/pearly.jpg',
    active: true,
    featured: true,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
  },
  {
    id: 'first-lady',
    name: 'First Lady',
    collection: 'Prima Collection',
    price: 40000,
    stock: 2,
    tag: 'Fringe Clutch',
    description:
      'Statement loop-fringe beadwork in ivory champagne. Designed to hold essentials while turning heads at galas.',
    imageUrl: '/images/products/first-lady.jpg',
    active: true,
    featured: true,
    createdAt: '2026-11-05T12:00:00.000Z',
    updatedAt: '2026-11-05T12:00:00.000Z',
  },
]

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  brandName: 'Crafty Cottage',
  tagline: 'Bead to perfection',
  bankName: 'GTBank (Update in Admin Settings)',
  accountName: 'Crafty Cottage Enterprise',
  accountNumber: '0123456789',
  whatsappNumber: '2347035596492',
  instagramHandle: '@craftycottage.ng',
  studioLocation: 'University of Ibadan, Oyo State',
  deliveryZones: [
    { id: 'ui-pickup', label: 'University of Ibadan / Studio Pickup', fee: 0, eta: 'Same day (by appointment)' },
    { id: 'ibadan', label: 'Ibadan Dispatch Rider', fee: 2000, eta: '1–2 business days' },
    { id: 'lagos', label: 'Lagos Doorstep Delivery', fee: 4500, eta: '2–3 business days' },
    { id: 'nationwide', label: 'Nationwide Waybill (Abuja / PH / Others)', fee: 6000, eta: '3–5 business days' },
  ],
}

export const BESPOKE_SHAPES = [
  { id: 'dupree', name: 'Dupree Heart', price: 45000 },
  { id: 'pearly', name: 'Pearly Handbag', price: 35000 },
  { id: 'first-lady', name: 'First Lady Fringe', price: 40000 },
  { id: 'box', name: 'Structured Box', price: 32000 },
]

export const BESPOKE_BEADS = [
  { id: 'gold', name: 'Gold Amber Crystal', extra: 0, swatch: 'linear-gradient(135deg,#F3D27A,#B8860B)' },
  { id: 'purple', name: 'Royal Purple Crystal', extra: 0, swatch: 'linear-gradient(135deg,#9B59B6,#4A235A)' },
  { id: 'pearl', name: 'White Satin Pearl', extra: 0, swatch: 'radial-gradient(circle at 35% 35%,#FFFFFF,#DCD6CC)' },
  { id: 'emerald', name: 'Emerald & Clear', extra: 3000, swatch: 'linear-gradient(135deg,#2ECC71 0 50%,#E8F6EF 50% 100%)' },
]

export function formatNaira(amount: number): string {
  return `₦${Number(amount || 0).toLocaleString('en-NG')}`
}
