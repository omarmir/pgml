import { describe, expect, it } from 'vitest'

import {
  clampStudioEditorWidth,
  getStudioLayoutColumns,
  studioCompactBreakpoint,
  studioEditorPanelMinWidth,
  studioResizeHandleWidth
} from '../../app/utils/studio-layout'

describe('studio layout utilities', () => {
  it('keeps the editor width at or above the minimum and below the canvas reserve', () => {
    expect(clampStudioEditorWidth(240, 1400)).toBe(studioEditorPanelMinWidth)
    expect(clampStudioEditorWidth(560, 1400)).toBe(560)
    expect(clampStudioEditorWidth(1200, 1400)).toBe(979)
  })

  it('builds responsive grid columns for the studio layout', () => {
    expect(getStudioLayoutColumns(480, studioCompactBreakpoint - 1)).toBe('1fr')
    expect(getStudioLayoutColumns(480, studioCompactBreakpoint)).toBe(
      `480px ${studioResizeHandleWidth}px minmax(0, 1fr)`
    )
  })
})
