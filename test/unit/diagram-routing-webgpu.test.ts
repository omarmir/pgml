import { describe, expect, it } from 'vitest'

import { previewRouteDescriptorStride } from '../../app/utils/diagram-routing-webgpu'

describe('diagram WebGPU routing utilities', () => {
  it('allocates enough descriptor bytes for bounds, transform, and flags', () => {
    const vectorByteLength = 16
    const boundsVectorCount = 7
    const planeOriginScaleVectorCount = 1
    const flagsVectorCount = 2

    expect(previewRouteDescriptorStride).toBe(
      (boundsVectorCount + planeOriginScaleVectorCount + flagsVectorCount) * vectorByteLength
    )
  })
})
