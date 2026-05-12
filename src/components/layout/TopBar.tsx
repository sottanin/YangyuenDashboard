'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/ThemeProvider'
import { Icon } from '@/components/ui/Icon'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface TopBarProps {
  onToggleSidebar: () => void
  currentPageLabel: string
  admin: {
    name: string
    email: string | null
    username: string
    role: string
  }
}

const NOTIFICATIONS = [
  { type: 'success', title: 'New mint transaction', body: 'ICC-YANGYUEN minted — 500 tokens issued', time: '2 min ago' },
  { type: 'warn', title: 'High gas usage detected', body: 'Average gas used spiked to 185% of baseline', time: '18 min ago' },
  { type: 'accent', title: 'Redemption burst', body: 'NFT redemptions at 42 in the last hour', time: '1h ago' },
  { type: 'muted', title: 'Weekly report ready', body: 'Your blockchain activity summary is available', time: '3h ago' },
]

export function TopBar({ onToggleSidebar, currentPageLabel, admin }: TopBarProps) {
  const { mode, setMode } = useTheme()
  const router = useRouter()
  const { selected, setSelected, workspaces } = useWorkspace()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)

  useEffect(() => {
    const onClick = () => {
      setNotifOpen(false)
      setProfileOpen(false)
      setWsOpen(false)
    }
    if (notifOpen || profileOpen || wsOpen) {
      document.addEventListener('click', onClick)
      return () => document.removeEventListener('click', onClick)
    }
  }, [notifOpen, profileOpen, wsOpen])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  const allOption = { id: 'all' as const, name: 'All Workspaces' }
  const wsOptions = [allOption, ...workspaces]

  return (
    <div className="sticky top-0 z-20 -mx-6 -mt-6 mb-6 px-6 pt-4 pb-3 glass-strong border-b border-default">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button className="btn-icon btn btn-ghost" onClick={onToggleSidebar} title="Toggle sidebar">
            <Icon name="panel" size={16} />
          </button>
          <div className="hidden xl:flex items-center gap-2 text-xs text-muted">
            <span>Workspace</span>
            <Icon name="chevR" size={11} />
            <span className="text-default font-medium">{currentPageLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Workspace selector */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-default hover:bg-surface-2 transition"
              style={{ borderColor: 'rgb(var(--accent) / 0.4)', background: 'rgb(var(--accent) / 0.06)' }}
              onClick={(e) => {
                e.stopPropagation()
                setWsOpen(!wsOpen)
                setNotifOpen(false)
                setProfileOpen(false)
              }}
            >
              <Icon name="box" size={12} />
              <span className="max-w-[140px] truncate" style={{ color: 'rgb(var(--accent))' }}>
                {selected.name}
              </span>
              <Icon name="chevD" size={10} className="text-faint" />
            </button>
            {wsOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-52 glass-strong rounded-xl border border-default shadow-lg overflow-hidden z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-2 border-b border-default">
                  <div className="text-[10px] font-medium text-muted uppercase tracking-wider">Select Workspace</div>
                </div>
                <div className="p-1 max-h-60 overflow-y-auto thin-scroll">
                  {wsOptions.map((ws) => (
                    <button
                      key={ws.id}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition ${
                        selected.id === ws.id ? 'bg-surface-2 font-medium text-default' : 'text-default hover:bg-surface-2'
                      }`}
                      onClick={() => {
                        setSelected(ws)
                        setWsOpen(false)
                      }}
                    >
                      <div
                        className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
                        style={{ background: ws.id === 'all' ? 'rgb(var(--text-muted))' : 'linear-gradient(135deg, rgb(var(--accent-2)), rgb(var(--accent-3)))' }}
                      >
                        {ws.id === 'all' ? '∞' : ws.name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="flex-1 truncate">{ws.name}</span>
                      {selected.id === ws.id && <Icon name="check" size={11} className="text-accent flex-shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative hidden md:block">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input pl-9 pr-12"
              placeholder="Search transactions, wallets..."
              style={{ width: 260 }}
            />
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-faint border border-default">
              ⌘K
            </kbd>
          </div>

          {/* Theme toggle */}
          <div className="seg">
            {(['light', 'system', 'dark'] as const).map((m) => (
              <button
                key={m}
                className={mode === m ? 'active' : ''}
                onClick={() => setMode(m)}
                title={m}
              >
                <Icon name={m === 'light' ? 'sun' : m === 'dark' ? 'moon' : 'laptop'} size={13} />
              </button>
            ))}
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              className="btn-icon btn btn-ghost relative"
              onClick={(e) => {
                e.stopPropagation()
                setNotifOpen(!notifOpen)
                setProfileOpen(false)
                setWsOpen(false)
              }}
            >
              <Icon name="bell" size={15} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full" style={{ background: 'rgb(var(--danger))' }} />
            </button>
            {notifOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-80 glass-strong rounded-xl border border-default shadow-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-4 py-3 border-b border-default flex items-center justify-between">
                  <div className="text-sm font-semibold">Notifications</div>
                  <button className="text-[11px] text-muted hover:text-default">Mark all read</button>
                </div>
                <div className="max-h-80 overflow-y-auto thin-scroll">
                  {NOTIFICATIONS.map((n, i) => (
                    <div key={i} className="px-4 py-3 border-b border-default last:border-0 hover:bg-surface-2 cursor-pointer">
                      <div className="flex gap-3">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                          style={{
                            background: `rgb(var(--${
                              n.type === 'success' ? 'success' : n.type === 'warn' ? 'warn' : n.type === 'accent' ? 'accent' : 'text-muted'
                            }) / 0.12)`,
                          }}
                        >
                          <Icon
                            name={n.type === 'success' ? 'check' : n.type === 'warn' ? 'info' : n.type === 'accent' ? 'pulse' : 'doc'}
                            size={12}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-default">{n.title}</div>
                          <div className="text-[11px] text-muted mt-0.5">{n.body}</div>
                          <div className="text-[10px] text-faint mt-1">{n.time}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Profile */}
          <div className="relative">
            <button
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-surface-2 transition border border-transparent hover:border-[rgb(var(--border))]"
              onClick={(e) => {
                e.stopPropagation()
                setProfileOpen(!profileOpen)
                setNotifOpen(false)
                setWsOpen(false)
              }}
            >
              <div className="avatar" style={{ width: 28, height: 28, fontSize: '10px' }}>
                {admin.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="hidden sm:inline text-xs font-medium text-default">{admin.name}</span>
              <Icon name="chevD" size={11} className="text-faint" />
            </button>
            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 glass-strong rounded-xl border border-default shadow-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-3 border-b border-default">
                  <div className="text-xs font-semibold text-default">{admin.name}</div>
                  <div className="text-[10.5px] text-faint">{admin.email || admin.username}</div>
                </div>
                <div className="p-1">
                  {[
                    { label: 'Profile', icon: 'user', href: '/dashboard/settings' },
                    { label: 'Admin Users', icon: 'users', href: '/dashboard/admin-users' },
                    { label: 'Settings', icon: 'gear', href: '/dashboard/settings' },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-default hover:bg-surface-2"
                    >
                      <Icon name={item.icon} size={13} />
                      {item.label}
                    </Link>
                  ))}
                </div>
                <div className="border-t border-default p-1">
                  <button
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-default hover:bg-surface-2"
                    onClick={signOut}
                  >
                    <Icon name="lock" size={13} />
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
