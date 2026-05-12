'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

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

const WorkspaceContext = createContext<WorkspaceContextValue>({
  selected: ALL_WORKSPACES,
  setSelected: () => {},
  workspaces: [],
  loading: true,
  refresh: () => {},
})

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([])
  const [selected, setSelectedState] = useState<WorkspaceOption>(ALL_WORKSPACES)
  const [loading, setLoading] = useState(true)

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces')
      if (res.ok) {
        const data = await res.json() as Array<{ id: number; name: string }>
        setWorkspaces(data.map((w) => ({ id: w.id, name: w.name })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorkspaces()
  }, [fetchWorkspaces])

  useEffect(() => {
    // Restore persisted selection
    const stored = localStorage.getItem('nx-workspace')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WorkspaceOption
        setSelectedState(parsed)
      } catch {
        // ignore
      }
    }
  }, [])

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
