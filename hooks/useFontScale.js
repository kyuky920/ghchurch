import { useEffect, useMemo, useState } from 'react'

export const FONT_SCALE_OPTIONS = [
  { key: 'sm', label: '작게', value: 1 },
  { key: 'md', label: '보통', value: 1.12 },
  { key: 'lg', label: '크게', value: 1.24 },
  { key: 'xl', label: '아주 크게', value: 1.42 },
]

export function fontSizePx(size, minimum = 13) {
  const resolved = Math.max(size, minimum)
  return `calc(${resolved}px * var(--wl-font-scale, 1))`
}

export function useFontScale(defaultKey = 'md') {
  const [fontScaleKey, setFontScaleKey] = useState(defaultKey)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = localStorage.getItem('wl_font_scale')
    if (saved && FONT_SCALE_OPTIONS.some((option) => option.key === saved)) {
      setFontScaleKey(saved)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    localStorage.setItem('wl_font_scale', fontScaleKey)
  }, [fontScaleKey])

  const fontScale = useMemo(() => {
    return FONT_SCALE_OPTIONS.find((option) => option.key === fontScaleKey)?.value || 1
  }, [fontScaleKey])

  const fontScaleStyle = useMemo(() => ({
    '--wl-font-scale': String(fontScale),
  }), [fontScale])

  return {
    fontScale,
    fontScaleKey,
    fontScaleStyle,
    setFontScaleKey,
  }
}
