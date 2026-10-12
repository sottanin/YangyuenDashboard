'use client'

import { createContext, useContext, useEffect, useState } from 'react'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'system',
  setMode: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (!active) return
      const candidate = localStorage.getItem('nx-theme')
      const stored: ThemeMode = candidate === 'light' || candidate === 'dark' || candidate === 'system'
        ? candidate
        : 'system'
      setModeState(stored)
      setMounted(true)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!mounted) return
    const apply = () => {
      const sys = window.matchMedia('(prefers-color-scheme: dark)').matches
      const isDark = mode === 'dark' || (mode === 'system' && sys)
      document.documentElement.classList.toggle('dark', isDark)
    }
    apply()
    localStorage.setItem('nx-theme', mode)
    if (mode === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      mql.addEventListener('change', apply)
      return () => mql.removeEventListener('change', apply)
    }
  }, [mode, mounted])

  const setMode = (m: ThemeMode) => setModeState(m)

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}
