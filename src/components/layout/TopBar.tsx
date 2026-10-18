'use client'

import { useState, useEffect } from 'react'
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
    allWorkspaces: boolean
  }
}

export function TopBar({ onToggleSidebar, currentPageLabel, admin }: TopBarProps) {
  const { mode, setMode } = useTheme()
  const router = useRouter()
  const { selected, setSelected, workspaces } = useWorkspace()
  const [profileOpen, setProfileOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  const [syncStatus, setSyncStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/system/latest-sync', { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() as Promise<{ finishedAt: string | null }> : Promise.reject(new Error('Unable to load sync status')))
      .then((body) => { setLastSyncedAt(body.finishedAt); setSyncStatus('ready') })
      .catch(() => setSyncStatus('unavailable'))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const onClick = () => {
      setProfileOpen(false)
      setWsOpen(false)
    }
    if (profileOpen || wsOpen) {
      document.addEventListener('click', onClick)
      return () => document.removeEventListener('click', onClick)
    }
  }, [profileOpen, wsOpen])

  async function signOut() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/admin/login')
    router.refresh()
  }

  const wsOptions = workspaces

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

        <div className="flex min-w-0 shrink items-center gap-1 sm:gap-2">
          <div className="max-w-[76px] whitespace-nowrap text-right text-[9px] leading-tight text-muted sm:max-w-none sm:text-[10px]" role="status" aria-live="polite" title={lastSyncedAt ? new Date(lastSyncedAt).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok' }) : 'No completed sync'}>
            <div className="hidden text-faint lg:block">Last synced</div>
            <div className="font-medium text-default">{syncStatus === 'loading' ? 'Syncing…' : syncStatus === 'unavailable' ? 'Sync unavailable' : lastSyncedAt ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(lastSyncedAt)) : 'Not synced yet'}</div>
          </div>
          {/* Workspace selector */}
          <div className="relative">
            <button
              className="flex items-center gap-1.5 rounded-lg border border-default px-2 py-1.5 text-xs font-medium transition hover:bg-surface-2 sm:px-3"
              style={{ borderColor: 'rgb(var(--accent) / 0.4)', background: 'rgb(var(--accent) / 0.06)' }}
              onClick={(e) => {
                e.stopPropagation()
                setWsOpen(!wsOpen)
                setProfileOpen(false)
              }}
            >
              <Icon name="box" size={12} />
              <span className="hidden max-w-[140px] truncate sm:inline" style={{ color: 'rgb(var(--accent))' }}>
                {selected.name}
              </span>
              <Icon name="chevD" size={10} className="hidden text-faint sm:block" />
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

          {/* Profile */}
          <div className="relative">
            <button
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-lg hover:bg-surface-2 transition border border-transparent hover:border-[rgb(var(--border))]"
              onClick={(e) => {
                e.stopPropagation()
                setProfileOpen(!profileOpen)
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
                <div className="p-1">
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
