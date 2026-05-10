'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'

const TABS = ['Profile', 'Workspace', 'Batch Job', 'API Keys', 'Security', 'Appearance', 'Billing']

const CUTOFF_OPTIONS = [
  { value: '7', label: '7 Days', description: 'Fetch transactions from the last 7 days' },
]

function BatchJobSettings() {
  const [cutoffDays, setCutoffDays] = useState<string>('7')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  useEffect(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        if (data.batchCutoffDays) setCutoffDays(data.batchCutoffDays)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave(value: string) {
    setSaving(true)
    setCutoffDays(value)
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'batchCutoffDays', value }),
      })
      if (res.ok) {
        setToast({ msg: 'Saved successfully', type: 'ok' })
      } else {
        const d = await res.json()
        setToast({ msg: d.error || 'Save failed', type: 'err' })
      }
    } catch {
      setToast({ msg: 'Network error', type: 'err' })
    } finally {
      setSaving(false)
      setTimeout(() => setToast(null), 3000)
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <Card title="Batch Job Settings" subtitle="Configure how blockchain data is fetched from KubScan">
        <div className="space-y-5">
          <div>
            <label className="text-xs font-medium text-muted block mb-3">
              Fetch Window
            </label>
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => <div key={i} className="shimmer h-14 rounded-xl" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {CUTOFF_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSave(opt.value)}
                    disabled={saving}
                    className={`w-full flex items-center gap-4 p-4 rounded-xl border transition text-left ${
                      cutoffDays === opt.value
                        ? 'border-accent bg-surface-2'
                        : 'border-default hover:bg-surface-2'
                    }`}
                    style={cutoffDays === opt.value ? { borderColor: 'rgb(var(--accent) / 0.5)' } : {}}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                      style={
                        cutoffDays === opt.value
                          ? { background: 'rgb(var(--accent) / 0.15)', color: 'rgb(var(--accent))' }
                          : { background: 'rgb(var(--surface-2))', color: 'rgb(var(--text-muted))' }
                      }
                    >
                      {opt.value === '0' ? '∞' : opt.value}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${cutoffDays === opt.value ? 'text-default' : 'text-muted'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-faint mt-0.5">{opt.description}</div>
                    </div>
                    {cutoffDays === opt.value && (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                        style={{ color: 'rgb(var(--accent))', flexShrink: 0 }}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {toast && (
            <div className={`glass rounded-xl px-4 py-3 text-sm font-medium ${
              toast.type === 'ok' ? 'text-green-500' : 'text-red-400'
            }`}>
              {toast.msg}
            </div>
          )}

          <div className="p-4 rounded-xl border border-default bg-surface/40">
            <div className="flex items-start gap-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className="text-muted mt-0.5 flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-[11px] text-muted leading-relaxed">
                This setting applies to the next batch job run. The batch fetches transactions
                from the last 7 days only.
                Use the <a href="/dashboard/batch-logs" className="text-accent underline underline-offset-2">Batch Logs</a> page
                to monitor progress.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('Profile')

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle="Manage your account, workspace, and API credentials"
      />

      <div className="flex gap-1 mb-6 overflow-x-auto thin-scroll pb-1">
        {TABS.map((tab) => (
          <button key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
              activeTab === tab
                ? 'bg-surface-2 text-default border border-default'
                : 'text-muted hover:text-default'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'Profile' && (
        <div className="space-y-4 max-w-xl">
          <Card title="Profile Information">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="avatar" style={{ width: 56, height: 56, fontSize: '18px' }}>AD</div>
                <div>
                  <button className="btn btn-ghost">Change avatar</button>
                  <div className="text-xs text-muted mt-1">JPG, PNG or GIF up to 2MB</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted block mb-1.5">First name</label>
                  <input className="input" defaultValue="Admin" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted block mb-1.5">Last name</label>
                  <input className="input" defaultValue="User" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Email</label>
                <input className="input" defaultValue="admin@yangyuen.io" type="email" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Role</label>
                <input className="input" defaultValue="Administrator" disabled />
              </div>
              <button className="btn btn-primary">Save changes</button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Workspace' && (
        <div className="space-y-4 max-w-xl">
          <Card title="Workspace Settings">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Workspace Name</label>
                <input className="input" defaultValue="Yangyuen Dashboard" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Network</label>
                <input className="input" defaultValue="Mainnet" disabled />
              </div>
              <button className="btn btn-primary">Update workspace</button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Batch Job' && <BatchJobSettings />}

      {activeTab === 'API Keys' && (
        <div className="space-y-4 max-w-2xl">
          <Card title="API Keys" subtitle="Manage your API access credentials">
            <div className="space-y-3">
              {[
                { name: 'Production Key', key: 'yx_prod_●●●●●●●●●●●●4f2a', created: 'May 1 2026', status: 'active' },
                { name: 'Development Key', key: 'yx_dev_●●●●●●●●●●●●8c1b', created: 'Apr 15 2026', status: 'active' },
              ].map((k) => (
                <div key={k.name} className="flex items-center justify-between p-4 rounded-xl border border-default">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
                      <Icon name="key" size={14} />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-default">{k.name}</div>
                      <div className="text-[10px] font-mono text-faint mt-0.5">{k.key}</div>
                      <div className="text-[10px] text-faint">Created {k.created}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="pill pill-success">{k.status}</span>
                    <button className="btn-icon btn btn-ghost"><Icon name="copy" size={13} /></button>
                  </div>
                </div>
              ))}
              <button className="btn btn-primary w-full justify-center">
                <Icon name="plus" size={14} />Generate new key
              </button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Security' && (
        <div className="space-y-4 max-w-xl">
          <Card title="Security" subtitle="Manage authentication and session security">
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl border border-default">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ background: 'rgb(16 185 129 / 0.12)', color: 'rgb(16 185 129)' }}>
                    <Icon name="shield" size={14} />
                  </div>
                  <div>
                    <div className="text-xs font-medium text-default">Two-factor authentication</div>
                    <div className="text-[10px] text-muted">Enabled via authenticator app</div>
                  </div>
                </div>
                <span className="pill pill-success">Enabled</span>
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">Current password</label>
                <input className="input" type="password" placeholder="••••••••" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted block mb-1.5">New password</label>
                <input className="input" type="password" placeholder="••••••••" />
              </div>
              <button className="btn btn-primary">Update password</button>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Appearance' && (
        <div className="space-y-4 max-w-xl">
          <Card title="Appearance" subtitle="Customize the look and feel">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-muted mb-3">Theme</div>
                <div className="seg">
                  {['Light', 'System', 'Dark'].map((m) => (
                    <button key={m} className={m === 'System' ? 'active' : ''}>{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-muted mb-3">Density</div>
                <div className="seg">
                  {['Compact', 'Comfortable', 'Spacious'].map((d) => (
                    <button key={d} className={d === 'Comfortable' ? 'active' : ''}>{d}</button>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'Billing' && (
        <div className="max-w-xl">
          <Card title="Billing" subtitle="Current plan and usage">
            <div className="flex items-center gap-4 p-4 rounded-xl border border-default mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'rgb(var(--accent) / 0.12)', color: 'rgb(var(--accent))' }}>
                <Icon name="zap" size={18} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-default">Enterprise Plan</div>
                <div className="text-xs text-muted">Unlimited data · Priority support</div>
              </div>
              <span className="pill pill-success">Active</span>
            </div>
            <button className="btn btn-ghost w-full justify-center">Manage subscription</button>
          </Card>
        </div>
      )}
    </>
  )
}
