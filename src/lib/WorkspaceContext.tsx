'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'

export interface WorkspaceOption {
  id: number | 'all'
  name: string
}

interface WorkspaceContextValue {
  selected: WorkspaceOption
  setSelected: (ws: WorkspaceOption) => void
  workspaces: WorkspaceOption[]
  loading: boolean
  refresh: () => void
}

const ALL_WORKSPACES: WorkspaceOption = { id: 'all', name: 'All Workspaces' }

function isWorkspaceOption(value: unknown): value is WorkspaceOption {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return (candidate.id === 'all' || (typeof candidate.id === 'number' && Number.isInteger(candidate.id) && candidate.id > 0))
    && typeof candidate.name === 'string'
    && candidate.name.length > 0
    && candidate.name.length <= 100
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  selected: ALL_WORKSPACES,
  setSelected: () => {},
  workspaces: [],
  loading: true,
  refresh: () => {},
})

export function WorkspaceProvider({ children, allowAllWorkspaces }: { children: React.ReactNode; allowAllWorkspaces: boolean }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [selected, setSelectedState] = useState<WorkspaceOption>(ALL_WORKSPACES)
  const [loading, setLoading] = useState(true)
  const restoredSelection = useRef(false)

  const fetchWorkspaces = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/workspaces', { signal })
      if (res.ok) {
        const data: unknown = await res.json()
        if (!Array.isArray(data)) throw new Error('Invalid workspace response')
        const options = data
          .map((workspace): WorkspaceOption | null => {
            if (!workspace || typeof workspace !== 'object') return null
            const candidate = workspace as Record<string, unknown>
            if (typeof candidate.id !== 'number' || !Number.isInteger(candidate.id) || candidate.id <= 0 || typeof candidate.name !== 'string') return null
            return { id: candidate.id, name: candidate.name }
          })
          .filter((workspace): workspace is WorkspaceOption => workspace !== null)
        setWorkspaces(options)
        setSelectedState((current) => {
          if (!restoredSelection.current) {
            restoredSelection.current = true
            try {
              const stored = localStorage.getItem('nx-workspace')
              if (stored) {
                const parsed: unknown = JSON.parse(stored)
                if (isWorkspaceOption(parsed) && ((allowAllWorkspaces && parsed.id === 'all') || options.some((workspace) => workspace.id === parsed.id))) {
                  return parsed.id === 'all' ? ALL_WORKSPACES : parsed
                }
                localStorage.removeItem('nx-workspace')
              }
            } catch {
              // Storage can be unavailable in hardened/private browser contexts.
            }
          }
          return (allowAllWorkspaces && current.id === 'all') || options.some((workspace) => workspace.id === current.id)
            ? current
            : options[0] ?? ALL_WORKSPACES
        })
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.error('Failed to load workspaces')
      }
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [allowAllWorkspaces])

  useEffect(() => {
    const controller = new AbortController()
    queueMicrotask(() => {
      if (!controller.signal.aborted) void fetchWorkspaces(controller.signal)
    })
    return () => controller.abort()
  }, [fetchWorkspaces])

  function setSelected(ws: WorkspaceOption) {
    setSelectedState(ws)
    localStorage.setItem('nx-workspace', JSON.stringify(ws))
  }

  return (
    <WorkspaceContext.Provider value={{ selected, setSelected, workspaces, loading, refresh: fetchWorkspaces }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}
