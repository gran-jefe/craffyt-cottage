import type { Metadata } from 'next'
import { Playfair_Display, Plus_Jakarta_Sans } from 'next/font/google'
import { CartProvider } from '@/context/CartContext'
import { CartDrawer } from '@/components/CartDrawer'
import './globals.css'

const playfair = Playfair_Display({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-serif',
})

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  // 300 is the light "CRAFTY" in the logo.
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-sans',
})

export const metadata: Metadata = {
  title: 'Crafty Cottage | Hand-Beaded Bags & Accessories',
  description:
    'Shop the Prima collection of hand-beaded bags, made in Nigeria. Order online with bank transfer checkout or design a bespoke piece in your colours.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${playfair.variable} ${jakarta.variable}`}>
      <body className="antialiased min-h-screen flex flex-col">
        <CartProvider>
          <div className="flex-1 flex flex-col">{children}</div>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  )
}
