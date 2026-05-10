'use client'

export function cssVar(name: string): string {
  if (typeof window === 'undefined') return '#000'
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v.startsWith('var(') ? cssVar(v.slice(4, -1)) : `rgb(${v})`
}

export function resolveColor(c: string): string {
  if (!c) return '#000'
  if (c.startsWith('var(')) return cssVar(c.slice(4, -1))
  const m = c.match(/^rgb\(\s*var\((--[\w-]+)\)\s*\)$/)
  if (m) return cssVar(m[1])
  return c
}

export function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return ''
  const path = [`M ${points[0][0]},${points[0][1]}`]
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] || p2
    const t = 0.18
    const c1x = p1[0] + (p2[0] - p0[0]) * t
    const c1y = p1[1] + (p2[1] - p0[1]) * t
    const c2x = p2[0] - (p3[0] - p1[0]) * t
    const c2y = p2[1] - (p3[1] - p1[1]) * t
    path.push(`C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`)
  }
  return path.join(' ')
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K'
  return Math.round(n).toString()
}
