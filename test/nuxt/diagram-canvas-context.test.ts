import { createDiagramSceneStub } from './diagram-scene-stub'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Shell from '../../app/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import { parsePgml } from '../../app/utils/pgml'

const text = (x: number, color = '#38bdf8') => `Table public.users {\n id int\n}\nProperties "public.users" {\n x: ${x}\n y: 560\n color: '${color}'\n}`
const mountCanvas = async () => {
  Object.assign(window, { __PGML_ENABLE_DOM_PLANE__: true })
  const wrapper = await mountSuspended(Shell, { shallow: true, props: { model: parsePgml(text(120)), sourceText: text(120), activeDiagramViewId: 'view-a' }, global: { stubs: {
    PgmlDiagramGpuScene: createDiagramSceneStub()
  } } })
  await nextTick()
  const start = async () => {
    const header = wrapper.get('[data-node-header="public.users"]')
    const target = header.element
    if (!(target instanceof HTMLElement)) throw new Error('Missing real node header')
    target.setPointerCapture = vi.fn()
    target.hasPointerCapture = () => true
    target.releasePointerCapture = vi.fn()
    await header.trigger('pointerdown', { pointerId: 7, button: 0, clientX: 10, clientY: 10 })
    window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 70, clientY: 10 }))
  }
  const finish = () => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
  const position = () => wrapper.vm.getNodeLayoutProperties()['public.users']?.x
  return { wrapper, start, finish, position }
}
describe('canvas accepted layout context', () => {
  afterEach(() => Reflect.deleteProperty(window, '__PGML_ENABLE_DOM_PLANE__'))
  it('retains dirty optimistic layout on failed intent and ordinary model acknowledgment', async () => {
    const canvas = await mountCanvas()
    await canvas.start()
    canvas.finish()
    expect(canvas.position()).toBe(180)
    await canvas.wrapper.setProps({ loadIntentRevision: 1 })
    await canvas.wrapper.setProps({ loadIntentRevision: 2, model: parsePgml(text(120)) })
    expect(canvas.position()).toBe(180)
    await canvas.wrapper.setProps({ model: parsePgml(text(180)) })
    expect(canvas.position()).toBe(180)
    canvas.wrapper.unmount()
  })
  it('waits for the accepted model, blocks old drag commits and gives same-id replacement its own layout', async () => {
    const canvas = await mountCanvas()
    await canvas.start()
    canvas.finish()
    expect(canvas.position()).toBe(180)
    await canvas.start()
    await canvas.wrapper.setProps({ documentContextRevision: 1, modelIsCurrent: false, sourceText: text(900, '#ef4444') })
    canvas.finish()
    expect(canvas.wrapper.emitted('nodePropertiesChange')).toHaveLength(1)
    expect(canvas.position()).toBe(180)
    await canvas.start()
    canvas.finish()
    expect(canvas.wrapper.emitted('nodePropertiesChange')).toHaveLength(1)
    await canvas.wrapper.setProps({ model: parsePgml(text(900, '#ef4444')), modelIsCurrent: true })
    expect(canvas.position()).toBe(900)
    expect(canvas.wrapper.vm.getNodeLayoutProperties()['public.users']?.color).toBe('#ef4444')
    await canvas.wrapper.setProps({ documentContextRevision: 2, model: parsePgml('Table public.users {\n id int\n}') })
    expect(canvas.position()).toBe(120)
    expect(canvas.wrapper.vm.getNodeLayoutProperties()['public.users']?.color).toBe('#38bdf8')
    canvas.wrapper.unmount()
  })
  it('resets an identical-source accepted document and a new view without inheriting old overrides', async () => {
    const canvas = await mountCanvas()
    await canvas.start()
    canvas.finish()
    expect(canvas.position()).toBe(180)
    await canvas.wrapper.setProps({ documentContextRevision: 1 })
    expect(canvas.position()).toBe(120)
    await canvas.start()
    canvas.finish()
    expect(canvas.position()).toBe(180)
    await canvas.wrapper.setProps({ activeDiagramViewId: 'view-b', model: parsePgml('Table public.users {\n id int\n}') })
    expect(canvas.position()).toBe(120)
    canvas.wrapper.unmount()
  })
  it('preserves a held same-document drag across analysis readiness and model updates', async () => {
    const canvas = await mountCanvas()
    await canvas.start()
    await canvas.wrapper.setProps({ modelIsCurrent: false })
    await canvas.wrapper.setProps({ model: parsePgml(text(120)), modelIsCurrent: true })
    canvas.finish()
    expect(canvas.position()).toBe(180)
    expect(canvas.wrapper.emitted('nodePropertiesChange')).toHaveLength(1)
    canvas.wrapper.unmount()
  })
})
