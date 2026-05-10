'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/ThemeProvider'
import { Icon } from '@/components/ui/Icon'

interface TopBarProps {
  onToggleSidebar: () => void
  currentPageLabel: string
}

const NOTIFICATIONS = [
  { type: 'success', title: 'New mint transaction', body: 'ICC-YANGYUEN minted — 500 tokens issued', time: '2 min ago' },
  { type: 'warn', title: 'High gas usage detected', body: 'Average gas used spiked to 185% of baseline', time: '18 min ago' },
  { type: 'accent', title: 'Redemption burst', body: 'NFT redemptions at 42 in the last hour', time: '1h ago' },
  { type: 'muted', title: 'Weekly report ready', body: 'Your blockchain activity summary is available', time: '3h ago' },
]

export function TopBar({ onToggleSidebar, currentPageLabel }: TopBarProps) {
  const { mode, setMode } = useTheme()
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    const onClick = () => {
      setNotifOpen(false)
      setProfileOpen(false)
    }
    if (notifOpen || profileOpen) {
      document.addEventListener('click', onClick)
      return () => document.removeEventListener('click', onClick)
    }
  }, [notifOpen, profileOpen])

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
          {/* Search */}
          <div className="relative hidden md:block">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              className="input pl-9 pr-12"
              placeholder="Search transactions, wallets..."
              style={{ width: 280 }}
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
              }}
            >
              <div className="avatar" style={{ width: 28, height: 28, fontSize: '10px' }}>AD</div>
              <span className="hidden sm:inline text-xs font-medium text-default">Admin</span>
              <Icon name="chevD" size={11} className="text-faint" />
            </button>
            {profileOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-56 glass-strong rounded-xl border border-default shadow-lg overflow-hidden"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-3 py-3 border-b border-default">
                  <div className="text-xs font-semibold text-default">Admin</div>
                  <div className="text-[10.5px] text-faint">admin@yangyuen.io</div>
                </div>
                <div className="p-1">
                  {[
                    { label: 'Profile', icon: 'user' },
                    { label: 'Settings', icon: 'gear' },
                  ].map((item) => (
                    <button
                      key={item.label}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-default hover:bg-surface-2"
                    >
                      <Icon name={item.icon} size={13} />
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="border-t border-default p-1">
                  <button className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-default hover:bg-surface-2">
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
