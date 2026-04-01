import { describe, expect, it } from 'vitest'

import {
  applyDiagramRendererInitFailure,
  getDiagramRendererCapability,
  getDiagramRendererHelpText,
  getDiagramRendererStatusLabel,
  isDiagramRendererBackend
} from '../../app/utils/diagram-renderer'

describe('diagram renderer capability helpers', () => {
  it('accepts the supported renderer backend values', () => {
    expect(isDiagramRendererBackend('auto')).toBe(true)
    expect(isDiagramRendererBackend('webgl')).toBe(true)
    expect(isDiagramRendererBackend('webgpu')).toBe(true)
    expect(isDiagramRendererBackend('canvas')).toBe(false)
  })

  it('prefers WebGPU when the browser exposes navigator.gpu', () => {
    expect(getDiagramRendererCapability({
      hasWebGPU: true,
      isSecureContext: true,
      requested: 'auto'
    })).toEqual({
      fallbackReason: null,
      isSecureContext: true,
      requested: 'auto',
      resolved: 'webgpu',
      supportsWebGPU: true
    })
  })

  it('still attempts forced WebGPU when the browser exposes navigator.gpu on an insecure origin override', () => {
    expect(getDiagramRendererCapability({
      hasWebGPU: true,
      isSecureContext: false,
      requested: 'webgpu'
    })).toEqual({
      fallbackReason: null,
      isSecureContext: false,
      requested: 'webgpu',
      resolved: 'webgpu',
      supportsWebGPU: true
    })
  })

  it('reports an insecure-context fallback when WebGPU is requested without navigator.gpu', () => {
    const capability = getDiagramRendererCapability({
      hasWebGPU: false,
      isSecureContext: false,
      requested: 'webgpu'
    })

    expect(capability.fallbackReason).toBe('insecure-context')
    expect(capability.resolved).toBe('webgl')
    expect(getDiagramRendererStatusLabel(capability)).toBe('WebGL active because this origin is not secure')
    expect(getDiagramRendererHelpText(capability)).toContain('chrome://flags/#unsafely-treat-insecure-origin-as-secure')
  })

  it('reports renderer init failures as a WebGL fallback', () => {
    const capability = getDiagramRendererCapability({
      hasWebGPU: true,
      isSecureContext: true,
      requested: 'webgpu'
    })

    expect(applyDiagramRendererInitFailure(capability)).toEqual({
      fallbackReason: 'renderer-init-failed',
      isSecureContext: true,
      requested: 'webgpu',
      resolved: 'webgl',
      supportsWebGPU: true
    })
  })
})
