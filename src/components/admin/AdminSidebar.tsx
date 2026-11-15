'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Package,
  Receipt,
  Settings,
  Sparkles,
  X,
} from 'lucide-react'
import { useDialogFocus } from '@/lib/useDialogFocus'

export type AdminSection = 'overview' | 'inventory' | 'orders' | 'bespoke' | 'settings'

interface SectionDef {
  id: AdminSection
  label: string
  icon: typeof Package
}

const NAV_GROUPS: { heading: string | null; items: SectionDef[] }[] = [
  { heading: null, items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }] },
  {
    heading: 'Shop',
    items: [
      { id: 'orders', label: 'Orders and sales', icon: Receipt },
      { id: 'inventory', label: 'Inventory', icon: Package },
      { id: 'bespoke', label: 'Custom requests', icon: Sparkles },
    ],
  },
  { heading: 'Settings', items: [{ id: 'settings', label: 'Bank and delivery', icon: Settings } ] },
]

export const SECTION_LABELS: Record<AdminSection, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((g) => g.items.map((i) => [i.id, i.label]))
) as Record<AdminSection, string>

export function parseSection(value: string | null): AdminSection {
  return value && value in SECTION_LABELS ? (value as AdminSection) : 'overview'
}

export function sectionHref(section: AdminSection): string {
  return section === 'overview' ? '/admin' : `/admin?section=${section}`
}

/** What a nav item flags: a count of things to act on, or a warning marker. */
export interface NavBadge {
  count?: number
  warning?: boolean
  /** Screen-reader text, e.g. "2 receipts to verify" */
  label: string
}

interface NavProps {
  active: AdminSection
  badges: Partial<Record<AdminSection, NavBadge>>
  refreshing: boolean
  account: string | null
  onNavigate: (section: AdminSection) => void
  onSignOut?: () => void
}

/** The sidebar body, shared by the fixed desktop sidebar and the mobile drawer. */
function SidebarContent({ active, badges, refreshing, account, onNavigate, onSignOut }: NavProps) {
  return (
    <div className="flex h-full flex-col bg-[#111B07] text-[#FAF8F4]">
      <div className="flex items-center gap-3 px-5 h-16 shrink-0 border-b border-[#2A3E14]">
        <span
          aria-hidden="true"
          className="w-9 h-9 rounded-[10px] bg-[#263E0F] text-[#E6C975] font-serif-display font-bold text-xl grid place-items-center"
        >
          C
        </span>
        <div className="min-w-0">
          <p className="font-serif-display text-base font-bold leading-tight text-white">Crafty Cottage</p>
          <p className="text-xs text-[#CFC6B2]">Admin</p>
        </div>
      </div>

      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-5 space-y-6">
        {NAV_GROUPS.map((group) => (
          <div key={group.heading ?? 'main'} className="space-y-1">
            {group.heading && (
              <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-[#A9B39A]">{group.heading}</p>
            )}
            <ul className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon
                const isActive = active === item.id
                const badge = badges[item.id]
                return (
                  <li key={item.id}>
                    <Link
                      href={sectionHref(item.id)}
                      scroll={false}
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => onNavigate(item.id)}
                      className={`flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold transition-colors duration-150 ${
                        isActive
                          ? 'bg-[#263E0F] text-white'
                          : 'text-[#CFC6B2] hover:bg-[#1A2A0C] hover:text-white active:bg-[#263E0F]'
                      }`}
                    >
                      <Icon
                        aria-hidden="true"
                        className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#E6C975]' : 'text-[#A9B39A]'}`}
                      />
                      <span className="flex-1 min-w-0 truncate">{item.label}</span>
                      {badge?.warning && (
                        <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 text-[#E6C975]" />
                      )}
                      {badge?.count !== undefined && badge.count > 0 && (
                        <span
                          aria-hidden="true"
                          className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-[#E6C975] text-[#111B07] text-xs font-bold grid place-items-center tabular-nums"
                        >
                          {badge.count > 99 ? '99+' : badge.count}
                        </span>
                      )}
                      {badge && <span className="sr-only">, {badge.label}</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-[#2A3E14] px-3 py-4 space-y-1">
        <p role="status" className="px-3 min-h-[20px] text-xs text-[#A9B39A] flex items-center gap-1.5">
          {refreshing && (
            <>
              <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
              Refreshing data…
            </>
          )}
        </p>
        {account && (
          <p className="px-3 pb-1 text-xs text-[#CFC6B2] truncate" title={account}>
            {account}
          </p>
        )}
        <Link
          href="/"
          className="flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-[#CFC6B2] hover:bg-[#1A2A0C] hover:text-white transition-colors duration-150"
        >
          <ExternalLink aria-hidden="true" className="w-[18px] h-[18px] text-[#A9B39A]" />
          View shop
        </Link>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="w-full flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-[#CFC6B2] hover:bg-[#1A2A0C] hover:text-white transition-colors duration-150"
          >
            <LogOut aria-hidden="true" className="w-[18px] h-[18px] text-[#A9B39A]" />
            Sign out
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Desktop: a fixed sidebar. Below `lg`: a compact top bar whose menu button opens the same
 * navigation as a modal drawer (focus trapped, Escape and backdrop close it, closes on navigation).
 */
export function AdminNavigation(props: NavProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const drawerRef = useDialogFocus<HTMLDivElement>(drawerOpen)

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    // Growing past the breakpoint swaps in the desktop sidebar: drop the drawer and its scroll lock.
    const wide = window.matchMedia('(min-width: 1024px)')
    const onWide = (e: MediaQueryListEvent) => {
      if (e.matches) setDrawerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    wide.addEventListener('change', onWide)
    return () => {
      window.removeEventListener('keydown', onKey)
      wide.removeEventListener('change', onWide)
    }
  }, [drawerOpen])

  const attentionTotal = Object.values(props.badges).reduce((n, b) => n + (b?.count ?? 0) + (b?.warning ? 1 : 0), 0)

  return (
    <>
      <aside className="hidden lg:block fixed inset-y-0 left-0 z-30 w-64 border-r border-[#2A3E14]">
        <SidebarContent {...props} />
      </aside>

      <div className="lg:hidden sticky top-0 z-30 h-14 bg-[#111B07] border-b border-[#2A3E14] flex items-center gap-2 px-2">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={`Open menu${attentionTotal > 0 ? `, ${attentionTotal} ${attentionTotal === 1 ? 'item needs' : 'items need'} attention` : ''}`}
          aria-expanded={drawerOpen}
          aria-controls="admin-drawer"
          className="relative min-w-[44px] min-h-[44px] rounded-[10px] text-[#FAF8F4] hover:bg-[#1A2A0C] grid place-items-center transition-colors"
        >
          <Menu aria-hidden="true" className="w-5 h-5" />
          {attentionTotal > 0 && (
            <span aria-hidden="true" className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-[#E6C975] ring-2 ring-[#111B07]" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white truncate">{SECTION_LABELS[props.active]}</p>
          <p className="text-xs text-[#CFC6B2] truncate">Crafty Cottage admin</p>
        </div>
        {props.refreshing && (
          <Loader2 aria-label="Refreshing data" className="w-4 h-4 mr-2 animate-spin text-[#A9B39A]" />
        )}
      </div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Admin menu">
          <div className="absolute inset-0 bg-[#111B07]/60" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div id="admin-drawer" ref={drawerRef} className="relative w-72 max-w-[85vw] h-full shadow-2xl">
            <SidebarContent
              {...props}
              onNavigate={(s) => {
                setDrawerOpen(false)
                props.onNavigate(s)
              }}
            />
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
              className="absolute top-2.5 right-2 min-w-[44px] min-h-[44px] rounded-[10px] text-[#CFC6B2] hover:text-white hover:bg-[#1A2A0C] grid place-items-center transition-colors"
            >
              <X aria-hidden="true" className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}
