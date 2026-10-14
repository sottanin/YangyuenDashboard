'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { MENU_CATALOG } from '@/lib/auth/menuCatalog'

type SidebarState = 'open' | 'narrow' | 'closed'

interface SidebarProps {
  state: SidebarState
  admin: {
    name: string
    email: string | null
    username: string
    role: string
    menuKeys: string[]
  }
}

export function Sidebar({ state, admin }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
  const isNarrow = state === 'narrow'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const visibleMenus = MENU_CATALOG.filter((menu) => admin.menuKeys.includes('*') || admin.menuKeys.includes(menu.key))
  const sections = ['Workspace', 'Blockchain', 'System'].map((section) => ({ section, items: visibleMenus.filter((menu) => menu.section === section) })).filter((section) => section.items.length > 0)

  useEffect(() => {
    if (!profileOpen) return
    const close = (): void => setProfileOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [profileOpen])

  async function signOut(): Promise<void> {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  if (state === 'closed') return null

  return (
    <aside
      className={`fixed left-0 top-0 bottom-0 z-30 hidden transition-all duration-200 ease-out md:block ${
        isNarrow ? 'w-[68px] sidebar-narrow' : 'w-[240px]'
      }`}
    >
      <div className="h-full glass-strong border-r border-default flex flex-col p-3">
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-2 py-3 mb-2 ${isNarrow ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 flex-shrink-0">
            <Image src="/logo-fullcolor.svg" alt="Yangyuen" width={32} height={32} className="w-full h-full object-contain" />
          </div>
          {!isNarrow && (
            <div>
              <div className="text-[13px] font-semibold tracking-tight text-default leading-none">Yangyuen</div>
              <div className="text-[10px] text-muted mt-0.5">Data Analysis</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto thin-scroll">
          {sections.map((section) => (
            <div key={section.section} className="mb-3">
              <div className="nav-section-label text-[10px] uppercase tracking-wider text-faint px-2 mb-1.5 font-medium">
                {section.section}
              </div>
              {section.items.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? 'active' : ''}`}
                  title={isNarrow ? item.label : undefined}
                >
                  <Icon name={item.icon} size={16} />
                  <span className="nav-label flex-1 text-left">{item.label}</span>
                  {'badge' in item && item.badge && !isNarrow && (
                    <span className="nav-label pill pill-accent text-[10px]" style={{ padding: '1px 6px' }}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-default pt-3 mt-2">
          <div className="relative">
          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-default glass-strong p-1 shadow-lg" onClick={(event) => event.stopPropagation()}>
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-default hover:bg-surface-2" onClick={() => void signOut()}>
                <Icon name="lock" size={13} /> Sign out
              </button>
            </div>
          )}
          <button type="button" aria-expanded={profileOpen} aria-label="Open user menu" onClick={(event) => { event.stopPropagation(); setProfileOpen((open) => !open) }} className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-surface-2 cursor-pointer ${isNarrow ? 'justify-center' : ''}`}>
            <div className="avatar" style={{ width: 30, height: 30, fontSize: '10px' }}>
              {admin.name.slice(0, 2).toUpperCase()}
            </div>
            {!isNarrow && (
              <div className="flex-1 min-w-0 sidebar-footer-label">
                <div className="text-xs font-medium text-default truncate">{admin.name}</div>
                <div className="text-[10px] text-faint truncate">{admin.email || admin.username}</div>
              </div>
            )}
            {!isNarrow && <Icon name="chevR" size={12} className={`text-faint sidebar-footer-label transition-transform ${profileOpen ? '-rotate-90' : ''}`} />}
          </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
