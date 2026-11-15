import { createDiagramSceneStub } from './diagram-scene-stub'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import Shell from '../../app/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import { parsePgml } from '../../app/utils/pgml'

const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
const fail = () => {
  throw new DOMException('Disabled', 'SecurityError')
}
const mountShell = () => mountSuspended(Shell, { shallow: true, props: { model: parsePgml('') }, global: { stubs: {
  PgmlDiagramGpuScene: createDiagramSceneStub()
} } })
describe('renderer preference storage boundary', () => {
  afterEach(() => {
    if (descriptor) Object.defineProperty(window, 'localStorage', descriptor)
    else Reflect.deleteProperty(window, 'localStorage')
  })
  it('mounts with auto rendering when storage acquisition is denied', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: fail })
    const wrapper = await mountShell()
    expect(wrapper.get('[data-renderer-test]').attributes('data-backend')).toBe('auto')
    wrapper.unmount()
  })
  it('mounts when reading preferences throws and keeps a live choice when persistence throws', async () => {
    Object.defineProperty(window, 'localStorage', { configurable: true, value: { getItem: fail, setItem: fail, removeItem: fail } })
    const wrapper = await mountShell()
    const select = wrapper.findAllComponents({ name: 'USelect' }).find(control => control.attributes('data-diagram-renderer-select') === 'desktop')
    if (!select) throw new Error('Renderer control unavailable')
    select.vm.$emit('update:modelValue', 'webgpu')
    await nextTick()
    expect(wrapper.get('[data-renderer-test]').attributes('data-backend')).toBe('webgpu')
    wrapper.unmount()
  })
})
