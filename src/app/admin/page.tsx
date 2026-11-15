'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import {
  LayoutDashboard,
  Package,
  Receipt,
  Sparkles,
  Settings,
  LogOut,
  Lock,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react'
import { auth, isFirebaseConfigured } from '@/lib/firebase'
import {
  checkAdminAccess,
  fetchBespokeRequests,
  fetchOrders,
  fetchProducts,
  fetchStoreSettings,
} from '@/lib/storeService'
import { DEFAULT_STORE_SETTINGS, hasPaymentDetails } from '@/lib/defaults'
import { AdminInventory } from '@/components/admin/AdminInventory'
import { AdminOrders } from '@/components/admin/AdminOrders'
import { AdminBespoke } from '@/components/admin/AdminBespoke'
import { AdminSettings } from '@/components/admin/AdminSettings'
import { AdminOverview, type OverviewNavigate } from '@/components/admin/AdminOverview'
import type { BespokeRequest, Order, OrderStatus, Product, StoreSettings } from '@/types/store'

type Tab = 'overview' | 'inventory' | 'orders' | 'bespoke' | 'settings'
const TAB_IDS: Tab[] = ['overview', 'inventory', 'orders', 'bespoke', 'settings']

export default function AdminPortalPage() {
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured)
  const [user, setUser] = useState<User | null>(null)
  const [isAdmin, setIsAdmin] = useState(!isFirebaseConfigured)

  // Login form
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)
  const [googleLoggingIn, setGoogleLoggingIn] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Dashboard data
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  // Set when the overview sends the admin to a pre-filtered order list (e.g. pending receipts).
  const [ordersStatusPreset, setOrdersStatusPreset] = useState<OrderStatus | null>(null)

  /** Tab chosen directly: always open it unfiltered. */
  function selectTab(tab: Tab) {
    setOrdersStatusPreset(null)
    setActiveTab(tab)
  }

  /** From the overview: open a tab (optionally pre-filtered) and move focus into it. */
  const navigateFromOverview: OverviewNavigate = (tab, options) => {
    setOrdersStatusPreset(options?.orderStatus ?? null)
    setActiveTab(tab)
    requestAnimationFrame(() => {
      const panel = document.getElementById('admin-tabpanel')
      panel?.scrollIntoView({ block: 'start' })
      panel?.focus({ preventScroll: true })
    })
  }
  const [loadingData, setLoadingData] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [bespoke, setBespoke] = useState<BespokeRequest[]>([])
  // null = the owner has never saved settings (checkout is paused until they do).
  const [settings, setSettings] = useState<StoreSettings | null>(null)

  const loadAll = useCallback(async () => {
    setLoadingData(true)
    setLoadError(false)
    try {
      const [prods, ords, bsp, cfg] = await Promise.all([
        fetchProducts(true),
        fetchOrders(),
        fetchBespokeRequests(),
        fetchStoreSettings(),
      ])
      setProducts(prods)
      setOrders(ords)
      setBespoke(bsp)
      setSettings(cfg)
    } catch (err) {
      console.error(err)
      setLoadError(true)
    } finally {
      setLoadingData(false)
      setHasLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      loadAll()
      return
    }
    const unsub = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser)
      if (nextUser) {
        const allowed = await checkAdminAccess(nextUser)
        setIsAdmin(allowed)
        if (allowed) {
          await loadAll()
        }
      } else {
        setIsAdmin(false)
      }
      setAuthLoading(false)
    })
    return () => unsub()
  }, [loadAll])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!auth) return
    setLoginError('')
    setShowPassword(false) // re-mask so the password isn't left visible or saved unmasked
    setLoggingIn(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch {
      setLoginError('Invalid admin email or password.')
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleGoogleLogin() {
    if (!auth) return
    setLoginError('')
    setGoogleLoggingIn(true)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch {
      setLoginError('Google sign-in was cancelled or failed. Please try again.')
    } finally {
      setGoogleLoggingIn(false)
    }
  }

  async function handleLogout() {
    if (!auth) return
    await signOut(auth)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#263E0F]" />
      </div>
    )
  }

  // Firebase Auth Login Screen
  if (isFirebaseConfigured && (!user || !isAdmin)) {
    return (
      <main className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#E2DACA] p-7 sm:p-8 space-y-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-xl bg-[#263E0F] text-[#E6C975] grid place-items-center">
              <Lock className="w-5 h-5" />
            </span>
            <div>
              <h1 className="font-serif-display text-2xl font-bold text-[#17210E]">
                Crafty Cottage admin
              </h1>
              <p className="text-xs text-[#4A5240]">Sign in to manage bags, stock &amp; orders</p>
            </div>
          </div>

          {user && !isAdmin && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-[#B42318] space-y-2">
              <p className="font-bold">Access restricted</p>
              <p>
                Signed in as <strong>{user.email}</strong>. This account doesn&apos;t have admin
                access. Ask the shop owner to add it, or sign in with a different account.
              </p>
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] font-bold underline"
              >
                Sign out and switch account
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="admin-email" className="block text-xs font-bold mb-1">
                Email
              </label>
              <input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="owner@craftycottage.ng"
                className="w-full min-h-[44px] px-3.5 rounded-xl border border-[#8C8270] bg-[#FAF8F4] text-sm"
              />
            </div>

            <div>
              <label htmlFor="admin-pass" className="block text-xs font-bold mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="admin-pass"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] pl-3.5 pr-12 rounded-xl border border-[#8C8270] bg-[#FAF8F4] text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  aria-controls="admin-pass"
                  className="absolute right-0 top-0 min-w-[44px] min-h-[44px] rounded-r-xl flex items-center justify-center text-[#4A5240] hover:text-[#17210E] hover:bg-[#F4EFE6] active:bg-[#E8DEC8] transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {loginError && (
              <p role="alert" className="text-xs text-[#B42318]">
                {loginError}
              </p>
            )}

            <button
              type="submit"
              disabled={loggingIn || googleLoggingIn}
              className="w-full min-h-[48px] rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loggingIn ? 'Signing in...' : 'Sign in'}</span>
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-[#E2DACA]" />
            <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[#4A5240]">
              or
            </span>
            <div className="flex-grow border-t border-[#E2DACA]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loggingIn || googleLoggingIn}
            className="w-full min-h-[48px] rounded-xl border border-[#E2DACA] bg-white hover:bg-[#FAF8F4] text-[#17210E] text-sm font-bold flex items-center justify-center gap-2.5 disabled:opacity-60 transition-colors"
          >
            {googleLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#263E0F]" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                />
              </svg>
            )}
            <span>{googleLoggingIn ? 'Connecting to Google...' : 'Continue with Google'}</span>
          </button>

          <div className="pt-2 border-t border-[#E2DACA] text-center">
            <Link href="/" className="text-xs font-semibold text-[#4A5240] hover:text-[#263E0F]">
              Back to the shop
            </Link>
          </div>
        </div>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F4] flex flex-col">
      {/* Admin Top Bar */}
      <header className="bg-[#111B07] text-[#FAF8F4] border-b border-[#3A5222]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-lg bg-[#263E0F] text-[#E6C975] font-serif-display font-bold text-xl grid place-items-center">
              C
            </span>
            <div>
              <h1 className="font-serif-display text-base sm:text-lg font-bold leading-none text-white">
                Crafty Cottage admin
              </h1>
              <span className="text-xs text-[#CFC6B2]">Inventory and orders</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="min-h-[44px] px-3 rounded-lg border border-[#3A5222] hover:border-[#E6C975] text-xs font-semibold text-[#FAF8F4] flex items-center gap-1.5"
            >
              <span>View shop</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            {isFirebaseConfigured && (
              <button
                type="button"
                onClick={handleLogout}
                className="min-h-[44px] px-3 rounded-lg bg-[#263E0F] hover:bg-[#355416] text-xs font-semibold text-[#FAF8F4] flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Local Demo Banner if Firebase .env not set */}
      {!isFirebaseConfigured && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 text-xs text-amber-950">
          <div className="max-w-6xl mx-auto flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
            <span>
              <strong>Local demo mode:</strong> Changes save in browser storage right now. Add your Firebase keys to{' '}
              <code>.env.local</code> to connect live Firestore &amp; Cloud Storage.
            </span>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Navigation Tabs (WAI-ARIA tabs pattern: roving tabindex, arrow keys, linked panel) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[#E2DACA] pb-3">
          <div
            role="tablist"
            aria-label="Admin sections"
            className="flex flex-wrap gap-2"
            onKeyDown={(e) => {
              const ids = TAB_IDS
              const i = ids.indexOf(activeTab)
              const next =
                e.key === 'ArrowRight' ? ids[(i + 1) % ids.length]
                : e.key === 'ArrowLeft' ? ids[(i - 1 + ids.length) % ids.length]
                : e.key === 'Home' ? ids[0]
                : e.key === 'End' ? ids[ids.length - 1]
                : null
              if (!next) return
              e.preventDefault()
              selectTab(next)
              document.getElementById(`tab-${next}`)?.focus()
            }}
          >
            {(
              [
                { id: 'overview', label: 'Overview', icon: LayoutDashboard },
                { id: 'inventory', label: `Inventory (${products.length})`, icon: Package },
                { id: 'orders', label: `Orders and sales (${orders.length})`, icon: Receipt },
                { id: 'bespoke', label: `Bespoke (${bespoke.length})`, icon: Sparkles },
                { id: 'settings', label: 'Bank and delivery', icon: Settings },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls="admin-tabpanel"
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-colors border ${
                    active
                      ? 'bg-[#263E0F] text-white border-[#263E0F]'
                      : 'bg-white text-[#4A5240] border-[#E2DACA] hover:text-[#17210E]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </div>
          {loadingData && hasLoaded && (
            <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-[#4A5240]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Refreshing…
            </span>
          )}
        </div>

        {!loadError && hasLoaded && !hasPaymentDetails(settings) && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-amber-50 border border-amber-300"
          >
            <div className="flex items-start gap-2.5 text-sm text-amber-950">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-700" />
              <p>
                <strong className="block">Checkout is paused</strong>
                Customers can&apos;t pay until you save your bank name, account name and 10-digit account number.
              </p>
            </div>
            {activeTab !== 'settings' && (
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="min-h-[44px] px-4 rounded-xl bg-[#263E0F] hover:bg-[#111B07] text-white text-xs font-bold"
              >
                Add bank details
              </button>
            )}
          </div>
        )}

        {loadError && !loadingData && (
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl bg-red-50 border border-red-200"
          >
            <div className="flex items-start gap-2.5 text-sm text-[#7A1B14]">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
              <p>
                <strong className="block">Could not load your shop data</strong>
                Products, orders and requests below may be out of date. Check your connection and retry.
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadAll()}
              className="min-h-[44px] px-4 rounded-xl bg-[#B42318] hover:bg-[#912018] text-white text-xs font-bold"
            >
              Retry loading
            </button>
          </div>
        )}

        {/* Tab Body: the spinner only replaces it on first load. Later refreshes keep the
            current view mounted so filters, unsaved notes and scroll position survive. */}
        <div
          id="admin-tabpanel"
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          aria-busy={loadingData}
          tabIndex={0}
          className="rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#263E0F]"
        >
        {!hasLoaded ? (
          <div className="py-16 flex justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#263E0F]" />
          </div>
        ) : activeTab === 'overview' ? (
          <AdminOverview
            orders={orders}
            products={products}
            bespoke={bespoke}
            refreshing={loadingData}
            onNavigate={navigateFromOverview}
          />
        ) : activeTab === 'inventory' ? (
          <AdminInventory products={products} onRefresh={loadAll} />
        ) : activeTab === 'orders' ? (
          <AdminOrders
            orders={orders}
            products={products}
            deliveryZones={settings?.deliveryZones ?? []}
            initialStatusFilter={ordersStatusPreset ?? undefined}
            onRefresh={loadAll}
          />
        ) : activeTab === 'bespoke' ? (
          <AdminBespoke requests={bespoke} onRefresh={loadAll} />
        ) : (
          <AdminSettings
            // Remount when the saved settings change (e.g. a retry succeeds) so the form never
            // holds stale values that could be saved over the real ones.
            key={JSON.stringify(settings)}
            initialSettings={settings ?? DEFAULT_STORE_SETTINGS}
            locked={loadError}
            onRefresh={loadAll}
          />
        )}
        </div>
      </main>
    </div>
  )
}
