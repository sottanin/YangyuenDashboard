'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { ChartExpansionProvider } from '@/components/charts/ExpandableChart'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { WorkspaceProvider } from '@/lib/WorkspaceContext'
import { ChartPermissionProvider } from '@/lib/ChartPermissionContext'

type SidebarState = 'open' | 'narrow' | 'closed'
interface AdminProfile {
  id: string
  username: string
  name: string
  email: string | null
  role: string
  menuKeys: string[]
  chartKeys: string[]
  allWorkspaces: boolean
}

const PAGE_LABELS: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/tokens': 'Tokens (KAP-20)',
  '/dashboard/point-tokens': 'Point Tokens (KAP-22)',
  '/dashboard/nft-redemptions': 'NFT Redemptions (KAP-721)',
  '/dashboard/nft-vouchers': 'NFT Vouchers',
  '/dashboard/roles': 'Roles',
  '/dashboard/wallet-activity': 'Wallet Activity',
  '/dashboard/settings': 'Settings',
  '/dashboard/admin-users': 'Admin Users',
  '/dashboard/workspaces': 'Workspaces',
  '/dashboard/batch-logs': 'Batch Logs',
  '/dashboard/contracts': 'Contracts',
  '/dashboard/nft-instances': 'NFT Instances',
  '/dashboard/fitivity-data': 'Fitivity Data',
  '/dashboard/wallet-mapping': 'Wallet Mapping',
  '/dashboard/fitivity-overview': 'Fitivity Overview',
}

export function DashboardShell({ children, admin }: { children: React.ReactNode; admin: AdminProfile }) {
  const pathname = usePathname()
  const [sidebarState, setSidebarState] = useState<SidebarState>('open')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const mobileLayer = useRef<HTMLDivElement>(null)
  const closeMobileMenu = useCallback((): void => setMobileOpen(false), [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    let mounted = true
    const update = (): void => {
      setIsMobile(media.matches)
      if (!media.matches) setMobileOpen(false)
    }
    queueMicrotask(() => { if (mounted) update() })
    media.addEventListener('change', update)
    return () => { mounted = false; media.removeEventListener('change', update) }
  }, [])

  useEffect(() => { queueMicrotask(closeMobileMenu) }, [pathname, closeMobileMenu])

  useEffect(() => {
    const layer = mobileLayer.current
    if (!mobileOpen || !layer) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const inertElements: { element: HTMLElement; inert: boolean }[] = []
    let branch: HTMLElement = layer
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          inertElements.push({ element: sibling, inert: sibling.inert })
          sibling.inert = true
        }
      }
      if (branch.parentElement === document.body) break
      branch = branch.parentElement
    }
    const styles = [document.documentElement, document.body].flatMap((element) =>
      ['overflow-x', 'overflow-y', 'overscroll-behavior-x', 'overscroll-behavior-y'].map((property) => ({
        element, property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
      })))
    for (const { element, property } of styles) element.style.setProperty(property, property.startsWith('overflow') ? 'hidden' : 'none')
    const focusable = (): HTMLElement[] => Array.from(layer.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
      .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0)
    const focusMenu = (): void => { focusable()[0]?.focus({ preventScroll: true }) }
    const trapFocus = (event: FocusEvent): void => { if (event.target instanceof Node && !layer.contains(event.target)) focusMenu() }
    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); closeMobileMenu(); return }
      if (event.key !== 'Tab') return
      const elements = focusable()
      const first = elements[0]
      const last = elements.at(-1)
      if (!layer.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target?.focus({ preventScroll: true })
      }
    }
    const blockOutsideScroll = (event: Event): void => {
      if (!(event.target instanceof Node) || !layer.querySelector('[role="dialog"]')?.contains(event.target)) event.preventDefault()
    }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('focusin', trapFocus, true)
    document.addEventListener('wheel', blockOutsideScroll, { capture: true, passive: false })
    document.addEventListener('touchmove', blockOutsideScroll, { capture: true, passive: false })
    focusMenu()
    return () => {
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('focusin', trapFocus, true)
      document.removeEventListener('wheel', blockOutsideScroll, true)
      document.removeEventListener('touchmove', blockOutsideScroll, true)
      for (const { element, inert } of inertElements) element.inert = inert
      for (const { element, property, value, priority } of styles) {
        if (value) element.style.setProperty(property, value, priority)
        else element.style.removeProperty(property)
      }
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [mobileOpen, closeMobileMenu])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const candidate = localStorage.getItem('nx-sidebar')
      const stored: SidebarState = candidate === 'open' || candidate === 'narrow' || candidate === 'closed'
        ? candidate
        : 'open'
      setSidebarState(stored)
    })
    return () => { active = false }
  }, [])

  const toggleSidebar = (): void => {
    if (window.matchMedia('(max-width: 767px)').matches) {
      setMobileOpen((open) => !open)
      return
    }
    setSidebarState((s) => {
      const next = s === 'open' ? 'narrow' : s === 'narrow' ? 'closed' : 'open'
      localStorage.setItem('nx-sidebar', next)
      return next
    })
  }

  const desktopSidebarClass = sidebarState === 'closed'
    ? 'md:ml-0'
    : sidebarState === 'narrow'
      ? 'md:ml-[68px]'
      : 'md:ml-[240px]'
  const currentPageLabel = PAGE_LABELS[pathname] || 'Dashboard'

  return (
    <WorkspaceProvider allowAllWorkspaces={admin.allWorkspaces}>
      <ChartPermissionProvider chartKeys={admin.chartKeys}>
      <ChartExpansionProvider>
      <div className="grid-bg" />
      <div className="ambient-bg" />

      <Sidebar state={sidebarState} admin={admin} />
      {mobileOpen && <div ref={mobileLayer} data-mobile-menu-layer>
        <button type="button" tabIndex={-1} aria-label="Close menu backdrop" className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeMobileMenu} />
        <Sidebar state="open" admin={admin} mobile onClose={closeMobileMenu} />
      </div>}

      <main
        className={`relative z-10 ml-0 min-h-screen min-w-0 max-w-full p-6 thin-scroll transition-all duration-200 ease-out ${desktopSidebarClass}`}
        data-density="comfortable"
        data-dashboard-main
      >
        <TopBar sidebarExpanded={isMobile ? mobileOpen : sidebarState !== 'closed'} sidebarControls={isMobile ? 'dashboard-mobile-sidebar' : 'dashboard-sidebar'} onToggleSidebar={toggleSidebar} currentPageLabel={currentPageLabel} admin={admin} />
        <div data-chart-expansion-host />
        <div className="min-w-0 max-w-full animate-in">{children}</div>
      </main>
      </ChartExpansionProvider>
      </ChartPermissionProvider>
    </WorkspaceProvider>
  )
}
