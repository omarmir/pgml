import { createDiagramSceneStub } from './diagram-scene-stub'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Shell from '../../app/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import { parsePgml } from '../../app/utils/pgml'

const mountShell = async () => {
  Object.assign(window, { __PGML_ENABLE_DOM_PLANE__: true })
  const wrapper = await mountSuspended(Shell, { shallow: true, global: { stubs: {
    PgmlDiagramGpuScene: createDiagramSceneStub()
  } }, props: { model: parsePgml('Table public.users {\n id int\n}'), sourceText: '' } })
  await nextTick()
  const target = wrapper.get('[data-node-header="public.users"]').element
  if (!(target instanceof HTMLElement)) throw new Error('Expected an actual node header')
  target.setPointerCapture = vi.fn()
  target.hasPointerCapture = () => true
  target.releasePointerCapture = vi.fn()
  await wrapper.get('[data-node-header="public.users"]').trigger('pointerdown', { pointerId: 7, clientX: 10, clientY: 10, button: 0 })
  return { wrapper, target }
}
describe('automation surface pointer lifecycle', () => {
  afterEach(() => Reflect.deleteProperty(window, '__PGML_ENABLE_DOM_PLANE__'))
  it('cancels a dragged preview without persisting position and ignores later release', async () => {
    const { wrapper } = await mountShell()
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 90, clientY: 50 }))
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 7 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
    await nextTick()
    expect(wrapper.emitted('nodePropertiesChange')).toBeUndefined()
    expect(wrapper.vm.getNodeLayoutProperties()['public.users']?.x).toBe(120)
    wrapper.unmount()
  })
  it('keeps pointer ownership and commits the matching completed drag', async () => {
    const { wrapper } = await mountShell()
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 8, clientX: 90 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 8 }))
    expect(wrapper.emitted('nodePropertiesChange')).toBeUndefined()
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 90, clientY: 50 }))
    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
    expect(wrapper.emitted('nodePropertiesChange')).toHaveLength(1)
    expect(wrapper.vm.getNodeLayoutProperties()['public.users']?.x).not.toBe(120)
    wrapper.unmount()
  })
})
