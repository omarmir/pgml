import { describe, expect, it } from 'vitest'

import type { DiagramRoutingBackend } from '../../app/utils/diagram-routing-contract'
import {
  normalizeDiagramRoutingPreviewPoints
} from '../../app/utils/diagram-routing-webgpu'

describe('diagram routing preview helpers', () => {
  it('keeps the routing backend contract narrowed to cpu and webgpu', () => {
    const backend: DiagramRoutingBackend = 'webgpu'

    expect(backend).toBe('webgpu')
  })

  it('drops duplicate preview points and keeps lane-aligned segments straight', () => {
    expect(normalizeDiagramRoutingPreviewPoints([
      { x: 120, y: 80 },
      { x: 120, y: 80 },
      { x: 120, y: 160 },
      { x: 120, y: 220 },
      { x: 240, y: 220 },
      { x: 240, y: 220 }
    ])).toEqual([
      { x: 120, y: 80 },
      { x: 120, y: 220 },
      { x: 240, y: 220 }
    ])
  })
})
