import { describe, expect, it } from 'vitest'

import { normalizeSvgColor, normalizeSvgPaint, parseCssLinearGradient } from '../../app/utils/svg-paint'

describe('SVG paint helpers', () => {
  it('normalizes CSS color(srgb ...) values into rgba()', () => {
    expect(normalizeSvgColor('color(srgb 0.545098 0.360784 0.964706 / 0.12)')).toBe('rgba(139, 92, 246, 0.12)')
  })

  it('parses computed linear gradients into SVG-safe stops', () => {
    expect(parseCssLinearGradient('linear-gradient(color(srgb 0.545098 0.360784 0.964706 / 0.12), rgba(255, 255, 255, 0.03) 22%), none')).toEqual([
      {
        color: 'rgba(139, 92, 246, 0.12)',
        offset: null
      },
      {
        color: 'rgba(255, 255, 255, 0.03)',
        offset: '22%'
      }
    ])
  })

  it('returns null when no gradient layer is present', () => {
    expect(parseCssLinearGradient('none')).toBeNull()
  })

  it('splits rgba paint into hex color plus opacity', () => {
    expect(normalizeSvgPaint('rgba(8, 20, 29, 0.98)')).toEqual({
      color: '#08141d',
      opacity: 0.98
    })
  })

  it('converts color(srgb ...) paint into viewer-safe SVG paint', () => {
    expect(normalizeSvgPaint('color(srgb 0.752941 0.517647 0.988235 / 0.09)')).toEqual({
      color: '#c084fc',
      opacity: 0.09
    })
  })
})
