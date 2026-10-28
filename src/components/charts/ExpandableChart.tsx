'use client'

import { createContext, useContext, useEffect, useId, useRef, useState, type ComponentType, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import { useWorkspace } from '@/lib/WorkspaceContext'

interface ExpansionContext { active: string | null; setActive: (id: string | null) => void }
const Expansion = createContext<ExpansionContext>({ active: null, setActive: () => {} })
const PlotHeight = createContext<number | null>(null)
export function useExpandedPlotHeight(): number | null { return useContext(PlotHeight) }

function lockChartBackground(chart: HTMLElement): () => void {
  const scrollPosition = { x: window.scrollX, y: window.scrollY }
  const inertElements: { element: HTMLElement; inert: boolean }[] = []
  let branch: HTMLElement = chart
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

  const styles: { element: HTMLElement; property: string; value: string; priority: string }[] = []
  const setStyle = (element: HTMLElement, property: string, value: string): void => {
    styles.push({ element, property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) })
    element.style.setProperty(property, value)
  }
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  if (scrollbarWidth > 0) {
    setStyle(document.body, 'padding-right', `${parseFloat(getComputedStyle(document.body).paddingRight) + scrollbarWidth}px`)
  }
  for (const element of [document.documentElement, document.body]) {
    setStyle(element, 'overflow-x', 'hidden')
    setStyle(element, 'overflow-y', 'hidden')
    setStyle(element, 'overscroll-behavior-x', 'none')
    setStyle(element, 'overscroll-behavior-y', 'none')
  }

  const isInside = (target: EventTarget | null): boolean => target instanceof Node && chart.contains(target)
  const blockBackground = (event: Event): void => {
    if (isInside(event.target)) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const focusableElements = (): HTMLElement[] => Array.from(chart.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
    .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && !element.closest('[inert]') && element.getClientRects().length > 0)
  const focusChart = (): void => { focusableElements()[0]?.focus({ preventScroll: true }) }
  const trapFocus = (event: FocusEvent): void => { if (!isInside(event.target)) focusChart() }
  const handleKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (event.key !== 'Tab') {
      blockBackground(event)
      return
    }
    const elements = focusableElements()
    const first = elements[0]
    const last = elements.at(-1)
    const outside = !isInside(document.activeElement)
    if (outside || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      const target = event.shiftKey ? last : first
      target?.focus({ preventScroll: true })
    }
  }
  const blockedEvents = ['pointerdown', 'pointerup', 'click', 'dblclick', 'contextmenu', 'wheel', 'touchstart', 'touchmove']
  for (const type of blockedEvents) document.addEventListener(type, blockBackground, { capture: true, passive: false })
  document.addEventListener('keydown', handleKey, true)
  document.addEventListener('focusin', trapFocus, true)

  return () => {
    for (const type of blockedEvents) document.removeEventListener(type, blockBackground, true)
    document.removeEventListener('keydown', handleKey, true)
    document.removeEventListener('focusin', trapFocus, true)
    for (const { element, inert } of inertElements) element.inert = inert
    for (const { element, property, value, priority } of styles) {
      if (value) element.style.setProperty(property, value, priority)
      else element.style.removeProperty(property)
    }
    window.scrollTo({ left: scrollPosition.x, top: scrollPosition.y, behavior: 'instant' })
  }
}

export function ChartExpansionProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [active, setActive] = useState<string | null>(null)
  const pathname = usePathname()
  const { selected } = useWorkspace()
  useEffect(() => { queueMicrotask(() => setActive(null)) }, [pathname, selected.id])
  return <Expansion.Provider value={{ active, setActive }}>{children}</Expansion.Provider>
}

export function withExpandableChart<P extends object>(Chart: ComponentType<P>, fallbackTitle: string): ComponentType<P> {
  function Expandable(props: P): React.JSX.Element {
    const id = useId()
    const { active, setActive } = useContext(Expansion)
    const expanded = active === id
    const placeholder = useRef<HTMLDivElement>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const button = useRef<HTMLButtonElement>(null)
    const [container, setContainer] = useState<HTMLDivElement | null>(null)
    const [title, setTitle] = useState(fallbackTitle)
    const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null)
    const [plotHeight, setPlotHeight] = useState<number | null>(null)
    const wasExpanded = useRef(false)

    useEffect(() => {
      const node = document.createElement('div')
      containerRef.current = node
      placeholder.current?.appendChild(node)
      queueMicrotask(() => setContainer(node))
      const card = placeholder.current?.closest('.glass')
      const heading = card?.querySelector('[data-chart-title], h2, h3, .text-sm.font-semibold')
      const actions = card?.querySelector<HTMLElement>('[data-chart-header-actions]') ?? null
      let mounted = true
      const updateTitle = (): void => {
        if (mounted) setTitle(heading?.textContent?.trim() || fallbackTitle)
      }
      queueMicrotask(() => {
        if (!mounted) return
        setHeaderActions(actions)
        updateTitle()
      })
      const observer = new MutationObserver(updateTitle)
      if (heading) observer.observe(heading, { childList: true, characterData: true, subtree: true })
      return () => {
        mounted = false
        observer.disconnect()
        node.remove()
      }
    }, [])

    useEffect(() => {
      const node = containerRef.current
      if (!node) return
      const slot = placeholder.current
      const host = document.querySelector<HTMLElement>('[data-chart-expansion-host]')
      if (!expanded || !host) {
        slot?.appendChild(node)
        node.removeAttribute('style')
        node.className = ''
        if (slot) slot.style.minHeight = ''
        queueMicrotask(() => setPlotHeight(null))
        if (wasExpanded.current) button.current?.focus({ preventScroll: true })
        wasExpanded.current = false
        return
      }
      if (slot) slot.style.minHeight = `${node.getBoundingClientRect().height}px`
      const backdrop = document.createElement('div')
      backdrop.className = 'fixed right-0 bottom-0 z-[9] bg-[rgb(var(--bg))]'
      backdrop.setAttribute('aria-hidden', 'true')
      backdrop.setAttribute('data-chart-expansion-backdrop', '')
      host.appendChild(backdrop)
      host.appendChild(node)
      node.className = 'fixed z-10 overflow-auto overscroll-contain rounded-2xl border border-default bg-[rgb(var(--surface))] p-3 shadow-2xl thin-scroll md:p-5'
      const unlockBackground = lockChartBackground(node)
      const main = document.querySelector<HTMLElement>('[data-dashboard-main]')
      const topbar = document.querySelector<HTMLElement>('[data-dashboard-topbar]')
      const measure = (): void => {
        const inset = window.innerWidth < 768 ? 12 : 24
        const contentLeft = Math.max(0, main?.getBoundingClientRect().left ?? 0)
        const contentTop = Math.max(0, topbar?.getBoundingClientRect().bottom ?? 0)
        Object.assign(backdrop.style, { left: `${contentLeft}px`, top: `${contentTop}px` })
        const left = contentLeft + inset
        const top = contentTop + inset
        const availableHeight = Math.max(120, window.innerHeight - top - inset)
        Object.assign(node.style, { left: `${left}px`, top: `${top}px`, width: `${Math.max(100, window.innerWidth - left - inset)}px`, height: `${availableHeight}px` })
        setPlotHeight(Math.max(100, availableHeight - (inset === 12 ? 100 : 120)))
      }
      measure()
      const observer = new ResizeObserver(measure)
      if (main) observer.observe(main)
      if (topbar) observer.observe(topbar)
      window.addEventListener('resize', measure)
      window.addEventListener('scroll', measure, true)
      button.current?.focus({ preventScroll: true })
      wasExpanded.current = true
      return () => {
        unlockBackground()
        backdrop.remove()
        observer.disconnect()
        window.removeEventListener('resize', measure)
        window.removeEventListener('scroll', measure, true)
      }
    }, [container, expanded, setActive])

    const enhancedProps = plotHeight === null ? props : { ...props, height: plotHeight }
    const control = <button ref={button} data-chart-expand-control type="button" className="btn btn-ghost min-h-11 min-w-11 shrink-0 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`} title={expanded ? 'Collapse chart' : 'Expand chart'} aria-expanded={expanded} aria-controls={id} onClick={() => setActive(expanded ? null : id)}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">{expanded ? <path d="M9 3v6H3m18 0h-6V3M3 15h6v6m6 0v-6h6" /> : <path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6" />}</svg></button>
    return <div ref={placeholder} className="min-w-0 max-w-full">
      {!expanded && headerActions ? createPortal(control, headerActions) : null}
      {container ? createPortal(<div role={expanded ? 'dialog' : 'region'} aria-modal={expanded ? true : undefined} aria-label={title} className="min-w-0 max-w-full">
        {expanded || !headerActions ? <div className="mb-2 flex min-h-11 items-start justify-between gap-3"><h2 className="min-w-0 flex-1 text-sm font-semibold text-default">{title}</h2>{control}</div> : null}
        <div key="plot" id={id} className="min-w-0 max-w-full"><PlotHeight.Provider value={plotHeight}><Chart {...enhancedProps} /></PlotHeight.Provider></div>
      </div>, container) : null}
    </div>
  }
  Expandable.displayName = `Expandable${fallbackTitle.replaceAll(' ', '')}`
  return Expandable
}
