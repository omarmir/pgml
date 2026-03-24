import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram performance source', () => {
  it('limits GPU plane promotion to active viewport interactions', () => {
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')

    expect(canvasFile).toContain('const isViewportGpuAccelerated: Ref<boolean> = ref(false)')
    expect(canvasFile).toContain('translate3d(var(--pgml-plane-pan-x')
    expect(canvasFile).toContain('translate(var(--pgml-plane-pan-x')
    expect(canvasFile).toContain('scheduleViewportGpuAccelerationReset()')
    expect(canvasFile).toContain('onEnd: endViewportGpuAcceleration')
  })
})
