export const DEFAULT_TOKEN_CHART_COLOR = '#8B5CF6'

export const TOKEN_CHART_COLORS = [
  { value: DEFAULT_TOKEN_CHART_COLOR, label: 'Default Violet' },
  { value: '#6366F1', label: 'Indigo' },
  { value: '#06B6D4', label: 'Cyan' },
  { value: '#0EA5E9', label: 'Sky' },
  { value: '#10B981', label: 'Emerald' },
  { value: '#84CC16', label: 'Lime' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#F97316', label: 'Orange' },
  { value: '#F43F5E', label: 'Rose' },
  { value: '#EC4899', label: 'Pink' },
] as const

export type TokenChartColor = typeof TOKEN_CHART_COLORS[number]['value']

const allowedTokenChartColors = new Set<string>(TOKEN_CHART_COLORS.map((color) => color.value))

export function isTokenChartColor(value: unknown): value is TokenChartColor {
  return typeof value === 'string' && allowedTokenChartColors.has(value)
}
