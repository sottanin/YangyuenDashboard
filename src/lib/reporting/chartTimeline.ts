/** Pure helpers shared by server reporting and client charts. Missing health data stays null. */
export function datePositions(labels: readonly string[]): number[] {
  const timestamps = labels.map((label) => /^\d{4}-\d{2}(?:-\d{2})?$/.test(label) ? Date.parse(`${label.length === 7 ? `${label}-01` : label}T00:00:00Z`) : Number.NaN)
  if (timestamps.some((value) => !Number.isFinite(value)) || timestamps.some((value, index) => index > 0 && value <= timestamps[index - 1])) return labels.map((_, index) => index / Math.max(1, labels.length - 1))
  const span = (timestamps.at(-1) ?? 0) - (timestamps[0] ?? 0)
  return timestamps.map((value) => span > 0 ? (value - timestamps[0]) / span : 0.5)
}

export function calendarDays(from: string, to: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return []
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || new Date(start).toISOString().slice(0, 10) !== from || new Date(end).toISOString().slice(0, 10) !== to) return []
  const count = Math.floor((end - start) / 86_400_000) + 1
  if (!Number.isFinite(count) || count <= 0 || count > 36_600) return []
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10))
}
