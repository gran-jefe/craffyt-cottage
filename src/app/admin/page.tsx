'use client'

import React, { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth'
import { Lock, Loader2, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { auth, isFirebaseConfigured } from '@/lib/firebase'
import { BrandLogo } from '@/components/BrandLogo'
import {
  checkAdminAccess,
  fetchBespokeRequests,
  fetchCatalog,
  fetchExpenses,
  fetchOrders,
  fetchProducts,
  fetchStoreSettings,
} from '@/lib/storeService'
import { DEFAULT_CATALOG, DEFAULT_STORE_SETTINGS, hasPaymentDetails } from '@/lib/defaults'
import { AdminInventory } from '@/components/admin/AdminInventory'
import { AdminOrders } from '@/components/admin/AdminOrders'
import { AdminBespoke } from '@/components/admin/AdminBespoke'
import { AdminSettings } from '@/components/admin/AdminSettings'
import { AdminOverview, type OverviewNavigate } from '@/components/admin/AdminOverview'
import { AdminExpenses } from '@/components/admin/AdminExpenses'
import { AdminCatalog } from '@/components/admin/AdminCatalog'
import { AdminReports } from '@/components/admin/AdminReports'
import {
  AdminNavigation,
  parseSection,
  sectionHref,
  SECTION_LABELS,
  type AdminSection,
  type NavBadge,
} from '@/components/admin/AdminSidebar'
import { computeAttention } from '@/lib/analytics'
import type { BespokeRequest, Catalog, Expense, Order, OrderStatus, Product, StoreSettings } from '@/types/store'

/** Plain-language sign-in errors. Unknown codes fall back to a connection message, never a stack trace. */
function signInErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'That email and password don’t match an admin account. Check both and try again.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes, or reset the password in Firebase, then try again.'
    case 'auth/user-disabled':
      return 'This account has been disabled. Ask the shop owner to re-enable it in Firebase.'
    case 'auth/network-request-failed':
      return 'Can’t reach the sign-in service. Check your internet connection and try again.'
    case 'auth/unauthorized-domain':
      return 'Sign-in isn’t allowed from this web address yet. Add it under Authentication › Settings › Authorized domains in Firebase.'
    default:
      return 'Sign-in didn’t go through. Check your connection and try again.'
  }
}

// Reading the URL's ?section= needs a Suspense boundary for static rendering.
export default function AdminPortalPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF8F4] flex items-center justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-[#0B3D3A]" />
        </div>
      }
    >
      <AdminPortal />
    </Suspense>
  )
}

function AdminPortal() {
  const router = useRouter()
  const searchParams = useSearchParams()
  // The section lives in the URL so refresh, back/forward and "open in new tab" all work.
  const section = parseSection(searchParams.get('section'))
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
  // Set when the overview sends the admin to a pre-filtered order list (e.g. pending receipts).
  const [ordersStatusPreset, setOrdersStatusPreset] = useState<OrderStatus | null>(null)

  /** Section chosen from the sidebar: always open it unfiltered. */
  function onSidebarNavigate() {
    setOrdersStatusPreset(null)
  }

  /** From the overview: open a section (optionally pre-filtered) and move focus into it. */
  const navigateFromOverview: OverviewNavigate = (target, options) => {
    setOrdersStatusPreset(options?.orderStatus ?? null)
    router.push(sectionHref(target), { scroll: false })
    requestAnimationFrame(() => document.getElementById('admin-main')?.focus({ preventScroll: true }))
  }

  // Each section starts at the top (skip the first render so a refresh keeps its place).
  const lastSection = useRef(section)
  useEffect(() => {
    if (lastSection.current === section) return
    lastSection.current = section
    window.scrollTo({ top: 0 })
  }, [section])
  const [loadingData, setLoadingData] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [bespoke, setBespoke] = useState<BespokeRequest[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  // Tracked apart from loadError: a missing expenses list must never hide orders, and profit
  // must never be shown as if nothing had been spent.
  const [expensesError, setExpensesError] = useState(false)
  const [catalog, setCatalog] = useState<Catalog>(DEFAULT_CATALOG)
  const [catalogError, setCatalogError] = useState(false)
  // null = the owner has never saved settings (checkout is paused until they do).
  const [settings, setSettings] = useState<StoreSettings | null>(null)

  const loadAll = useCallback(async () => {
    setLoadingData(true)
    setLoadError(false)
    try {
      const [prods, ords, bsp, cfg, exp, cat] = await Promise.all([
        fetchProducts(true),
        fetchOrders(),
        fetchBespokeRequests(),
        fetchStoreSettings(),
        fetchExpenses().then(
          (rows) => ({ ok: true as const, rows }),
          (err) => {
            console.error(err)
            return { ok: false as const, rows: [] as Expense[] }
          }
        ),
        fetchCatalog().then(
          (value) => ({ ok: true as const, value }),
          (err) => {
            console.error(err)
            return { ok: false as const, value: DEFAULT_CATALOG }
          }
        ),
      ])
      setCatalogError(!cat.ok)
      if (cat.ok) setCatalog(cat.value)
      setExpensesError(!exp.ok)
      if (exp.ok) setExpenses(exp.rows)
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
    // Catch typos here: every rejected attempt also shows up as a red 400 in the browser console.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password) {
      setLoginError('Enter your admin email address and password.')
      return
    }
    setLoggingIn(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (err) {
      setLoginError(signInErrorMessage(err))
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleGoogleLogin() {
    if (!auth) return
    setLoginError('')
    setGoogleLoggingIn(true)
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithPopup(auth, provider)
    } catch (err) {
      const code = (err as { code?: string })?.code
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        // Popups blocked (common on phones and in-app browsers): sign in on a full page instead.
        await signInWithRedirect(auth, provider).catch((e) => setLoginError(signInErrorMessage(e)))
      } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        // Closing the Google window is a choice, not an error.
        setLoginError(signInErrorMessage(err))
      }
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
        <Loader2 className="w-7 h-7 animate-spin text-[#0B3D3A]" />
      </div>
    )
  }

  // Firebase Auth Login Screen
  if (isFirebaseConfigured && (!user || !isAdmin)) {
    return (
      <main className="min-h-screen bg-[#FAF8F4] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#E2DACA] p-7 sm:p-8 space-y-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <BrandLogo className="text-[26px] text-[#0B3D3A]" />
            <div>
              <h1 className="inline-flex items-center gap-1.5 font-serif-display text-xl font-bold text-[#0F1F1D]">
                <Lock className="w-4 h-4 text-[#12564F]" aria-hidden="true" />
                Admin sign in
              </h1>
              <p className="text-xs text-[#3F4F4C]">Manage bags, stock, orders and expenses</p>
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
                  className="absolute right-0 top-0 min-w-[44px] min-h-[44px] rounded-r-xl flex items-center justify-center text-[#3F4F4C] hover:text-[#0F1F1D] hover:bg-[#F4EFE6] active:bg-[#E8DEC8] transition-colors"
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
              className="w-full min-h-[48px] rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loggingIn ? 'Signing in...' : 'Sign in'}</span>
            </button>
          </form>

          <div className="relative flex items-center">
            <div className="flex-grow border-t border-[#E2DACA]" />
            <span className="px-3 text-xs font-semibold uppercase tracking-wider text-[#3F4F4C]">
              or
            </span>
            <div className="flex-grow border-t border-[#E2DACA]" />
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loggingIn || googleLoggingIn}
            className="w-full min-h-[48px] rounded-xl border border-[#E2DACA] bg-white hover:bg-[#FAF8F4] text-[#0F1F1D] text-sm font-bold flex items-center justify-center gap-2.5 disabled:opacity-60 transition-colors"
          >
            {googleLoggingIn ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#0B3D3A]" />
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
            <Link href="/" className="text-xs font-semibold text-[#3F4F4C] hover:text-[#0B3D3A]">
              Back to the shop
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Sidebar badges: things to act on, mirroring the overview's "Needs attention".
  const attention = computeAttention(orders, products, bespoke, Date.now())
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const badges: Partial<Record<AdminSection, NavBadge>> = hasLoaded
    ? {
        orders: { count: attention.pendingCount, label: plural(attention.pendingCount, 'receipt to verify', 'receipts to verify') },
        inventory: { count: attention.lowStock.length, label: plural(attention.lowStock.length, 'piece low or sold out', 'pieces low or sold out') },
        bespoke: { count: attention.newBespokeCount, label: plural(attention.newBespokeCount, 'new request', 'new requests') },
        ...(expensesError ? { expenses: { warning: true, label: 'expenses could not be loaded' } } : {}),
        ...(!loadError && !hasPaymentDetails(settings)
          ? { settings: { warning: true, label: 'checkout is paused until bank details are saved' } }
          : {}),
      }
    : {}

  return (
    <div className="min-h-screen bg-[#FAF8F4]">
      <AdminNavigation
        active={section}
        badges={badges}
        refreshing={loadingData && hasLoaded}
        account={isFirebaseConfigured ? user?.email ?? null : 'Demo mode'}
        onNavigate={onSidebarNavigate}
        onSignOut={isFirebaseConfigured ? handleLogout : undefined}
      />

      <div className="lg:pl-64">
        {/* Local Demo Banner if Firebase .env not set */}
        {!isFirebaseConfigured && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 lg:px-8 py-2.5 text-xs text-amber-950">
            <div className="max-w-6xl mx-auto flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-700" />
              <span>
                <strong>Local demo mode:</strong> Changes save in browser storage right now. Add your Firebase keys to{' '}
                <code>.env.local</code> to connect live Firestore &amp; Cloud Storage.
              </span>
            </div>
          </div>
        )}

        <main
          id="admin-main"
          tabIndex={-1}
          aria-busy={loadingData}
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#0B3D3A]"
        >
          <h1 className="sr-only">{SECTION_LABELS[section]}, Crafty Cottage admin</h1>

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
              {section !== 'settings' && (
                <Link
                  href={sectionHref('settings')}
                  scroll={false}
                  onClick={onSidebarNavigate}
                  className="min-h-[44px] px-4 rounded-xl bg-[#0B3D3A] hover:bg-[#04201F] text-white text-xs font-bold inline-flex items-center"
                >
                  Add bank details
                </Link>
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

          {/* The spinner only replaces content on first load. Later refreshes keep the current
              view mounted so filters, unsaved notes and scroll position survive. */}
          {!hasLoaded ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-[#0B3D3A]" />
            </div>
          ) : section === 'overview' ? (
            <AdminOverview
              orders={orders}
              products={products}
              bespoke={bespoke}
              expenses={expenses}
              expensesError={expensesError}
              refreshing={loadingData}
              onNavigate={navigateFromOverview}
            />
          ) : section === 'inventory' ? (
            <AdminInventory products={products} catalog={catalog} onRefresh={loadAll} />
          ) : section === 'catalog' ? (
            <AdminCatalog
              // Remount after each save/refresh so the editor starts from what's stored.
              key={catalog.updatedAt ?? 'default'}
              catalog={catalog}
              products={products}
              loadFailed={catalogError}
              onRefresh={loadAll}
            />
          ) : section === 'orders' ? (
            <AdminOrders
              orders={orders}
              products={products}
              deliveryZones={settings?.deliveryZones ?? []}
              initialStatusFilter={ordersStatusPreset ?? undefined}
              onRefresh={loadAll}
            />
          ) : section === 'expenses' ? (
            <AdminExpenses expenses={expenses} loadFailed={expensesError} onRefresh={loadAll} />
          ) : section === 'reports' ? (
            <AdminReports orders={orders} products={products} expenses={expenses} bespoke={bespoke} catalog={catalog} />
          ) : section === 'bespoke' ? (
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
        </main>
      </div>
    </div>
  )
}
