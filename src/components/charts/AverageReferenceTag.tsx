'use client'

import { useEffect, useRef, useState } from 'react'

interface AverageReferenceTagProps {
  text: string
  right: number
  left: number
  y: number
  color: string
}

/** Render last in the SVG so the opaque reference label stays above plot marks. */
export function AverageReferenceTag({ text, right, left, y, color }: AverageReferenceTagProps): React.JSX.Element {
  const textRef = useRef<SVGTextElement>(null)
  const [textWidth, setTextWidth] = useState(text.length * 7)
  useEffect(() => {
    const element = textRef.current
    if (element) setTextWidth(element.getComputedTextLength())
  }, [text])
  const available = Math.max(16, right - left)
  const tagWidth = Math.min(available, textWidth + 16)
  const tagY = Math.max(3, y - 29)
  return <g pointerEvents="none">
    <text ref={textRef} visibility="hidden" aria-hidden="true" fontSize="10.5" fontWeight="600">{text}</text>
    <rect x={right - tagWidth} y={tagY} width={tagWidth} height={23} rx={6} fill="rgb(var(--surface))" stroke={color} />
    <text x={right - 8} y={tagY + 15} textAnchor="end" fontSize="10.5" fontWeight="600" fill={color} textLength={textWidth > available - 16 ? Math.max(1, available - 16) : undefined} lengthAdjust="spacingAndGlyphs">{text}</text>
  </g>
}
