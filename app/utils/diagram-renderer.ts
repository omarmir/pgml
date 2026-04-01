export type DiagramRendererBackend = 'auto' | 'webgl' | 'webgpu'
export type DiagramResolvedRendererBackend = 'webgl' | 'webgpu'
export type DiagramRendererFallbackReason = 'gpu-api-unavailable' | 'insecure-context' | 'renderer-init-failed'

export type DiagramRendererCapability = {
  fallbackReason: DiagramRendererFallbackReason | null
  isSecureContext: boolean
  requested: DiagramRendererBackend
  resolved: DiagramResolvedRendererBackend
  supportsWebGPU: boolean
}

type DiagramRendererCapabilityInput = {
  hasWebGPU: boolean
  isSecureContext: boolean
  requested: DiagramRendererBackend
}

export const isDiagramRendererBackend = (value: string): value is DiagramRendererBackend => {
  return value === 'auto' || value === 'webgl' || value === 'webgpu'
}

export const getDiagramRendererCapability = ({
  hasWebGPU,
  isSecureContext,
  requested
}: DiagramRendererCapabilityInput): DiagramRendererCapability => {
  if (requested === 'webgl') {
    return {
      fallbackReason: null,
      isSecureContext,
      requested,
      resolved: 'webgl',
      supportsWebGPU: hasWebGPU
    }
  }

  if (hasWebGPU) {
    return {
      fallbackReason: null,
      isSecureContext,
      requested,
      resolved: 'webgpu',
      supportsWebGPU: true
    }
  }

  return {
    fallbackReason: isSecureContext ? 'gpu-api-unavailable' : 'insecure-context',
    isSecureContext,
    requested,
    resolved: 'webgl',
    supportsWebGPU: false
  }
}

export const applyDiagramRendererInitFailure = (
  capability: DiagramRendererCapability
): DiagramRendererCapability => {
  if (capability.resolved !== 'webgpu') {
    return capability
  }

  return {
    ...capability,
    fallbackReason: 'renderer-init-failed',
    resolved: 'webgl'
  }
}

export const getDiagramRendererStatusLabel = (
  capability: DiagramRendererCapability
): string => {
  if (capability.resolved === 'webgpu') {
    return capability.requested === 'webgpu' ? 'Forced WebGPU active' : 'WebGPU active'
  }

  if (capability.requested === 'webgl') {
    return 'WebGL active'
  }

  if (capability.fallbackReason === 'renderer-init-failed') {
    return 'WebGL active after WebGPU init failure'
  }

  if (capability.fallbackReason === 'insecure-context') {
    return 'WebGL active because this origin is not secure'
  }

  if (capability.fallbackReason === 'gpu-api-unavailable') {
    return 'WebGL active because WebGPU is unavailable'
  }

  return 'WebGL active'
}

export const getDiagramRendererHelpText = (
  capability: DiagramRendererCapability
): string => {
  if (capability.fallbackReason === 'insecure-context') {
    return 'WebGPU needs a secure context. Use HTTPS, localhost, or 127.0.0.1. For LAN HTTP in Chrome, you can treat this origin as secure with chrome://flags/#unsafely-treat-insecure-origin-as-secure.'
  }

  if (capability.fallbackReason === 'gpu-api-unavailable') {
    return 'This browser did not expose navigator.gpu on the current device.'
  }

  if (capability.fallbackReason === 'renderer-init-failed') {
    return 'Pixi could not initialize a WebGPU renderer for this device, so the scene fell back to WebGL.'
  }

  if (capability.resolved === 'webgpu' && !capability.isSecureContext) {
    return 'WebGPU is active because the browser exposed navigator.gpu for this origin.'
  }

  return ''
}
