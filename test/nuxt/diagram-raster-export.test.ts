import { createDiagramSceneStub } from './diagram-scene-stub'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PgmlDiagramCanvasGpuShell from '../../app/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import { parsePgml } from '../../app/utils/pgml'

class HeldImage {
  static instances: HeldImage[] = []
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  src = ''
  constructor() {
    HeldImage.instances.push(this)
  }
}
const contextDescriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  if (contextDescriptor !== undefined) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', contextDescriptor)
})
const mountExport = async (renderControls = false) => {
  HeldImage.instances = []
  vi.stubGlobal('Image', HeldImage)
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export-test')
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const context: Pick<CanvasRenderingContext2D, 'setTransform' | 'drawImage'> = { setTransform: vi.fn(), drawImage: vi.fn() }
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => context })
  const encoders: BlobCallback[] = []
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(callback => encoders.push(callback))
  const source = 'Table public.old_image {\n  id integer [pk]\n}'
  const wrapper = await mountSuspended(PgmlDiagramCanvasGpuShell, { shallow: !renderControls, global: { stubs: { PgmlDiagramGpuScene: createDiagramSceneStub(), PgmlSourceCodeEditor: true } }, props: { model: parsePgml(source), sourceText: source, exportBaseName: 'old', documentContextRevision: 0 } })
  return { wrapper, createUrl, revokeUrl, click, context, encoders }
}
const currentImage = () => {
  const image = HeldImage.instances.at(-1)
  if (image === undefined) throw new Error('Image missing')
  return image
}
const finishEncoding = (encoders: BlobCallback[]) => {
  const encode = encoders.at(-1)
  if (encode === undefined) throw new Error('PNG encoder missing')
  encode(new Blob(['png'], { type: 'image/png' }))
}
describe('owned diagram raster export', () => {
  it('captures filename, rejects duplicates and clears source URL after successful encoding', async () => {
    const { wrapper, encoders, click, createUrl, revokeUrl } = await mountExport()
    const pending = wrapper.vm.exportDiagram('png', 1)
    await wrapper.vm.exportDiagram('png', 2)
    expect(HeldImage.instances).toHaveLength(1)
    currentImage().onload?.()
    await flushPromises()
    await wrapper.setProps({ exportBaseName: 'new' })
    finishEncoding(encoders)
    await pending
    expect(click.mock.contexts[0]).toMatchObject({ download: 'old-diagram.png' })
    expect(click).toHaveBeenCalledTimes(1)
    expect(createUrl).toHaveBeenCalledTimes(2)
    expect(revokeUrl).toHaveBeenCalledTimes(2)
  })
  it('settles a pending decode on disposal and ignores its saved late callback', async () => {
    const { wrapper, click, revokeUrl, context } = await mountExport()
    const pending = wrapper.vm.exportDiagram('png', 1)
    const image = currentImage()
    const late = image.onload
    wrapper.unmount()
    await pending
    late?.()
    await flushPromises()
    expect(image.src).toBe('')
    expect(context.drawImage).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:export-test')
  })
  it.each(['dispose', 'replace'])('settles an encoder and suppresses its late output after %s', async (action) => {
    const { wrapper, encoders, click, createUrl, revokeUrl } = await mountExport()
    const pending = wrapper.vm.exportDiagram('png', 1)
    currentImage().onload?.()
    await flushPromises()
    expect(encoders).toHaveLength(1)
    if (action === 'dispose') wrapper.unmount()
    else await wrapper.setProps({ documentContextRevision: 1, exportBaseName: 'new' })
    await pending
    finishEncoding(encoders)
    await flushPromises()
    expect(click).not.toHaveBeenCalled()
    expect(createUrl).toHaveBeenCalledTimes(1)
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:export-test')
  })
  it('cleans a failed decode and permits retry', async () => {
    const { wrapper, encoders, click, revokeUrl } = await mountExport()
    const failed = wrapper.vm.exportDiagram('png', 1)
    const rejected = expect(failed).rejects.toThrow('Unable to render diagram export.')
    currentImage().onerror?.()
    await rejected
    expect(revokeUrl).toHaveBeenCalledTimes(1)
    const retry = wrapper.vm.exportDiagram('png', 1)
    currentImage().onload?.()
    await flushPromises()
    finishEncoding(encoders)
    await retry
    expect(click).toHaveBeenCalledTimes(1)
  })
})

it('image panel emits a typed export request and reflects Page admission without starting its own pipeline', async () => {
  const { wrapper, createUrl } = await mountExport(true)
  await wrapper.get('[data-diagram-panel-tab="export"]').trigger('click')
  await wrapper.get('[data-diagram-export-button="png-2x"]').trigger('click')
  expect(wrapper.emitted('exportDiagram')).toEqual([[{ format: 'png', scaleFactor: 2 }]])
  expect(createUrl).not.toHaveBeenCalled()
  await wrapper.setProps({ exportInProgress: true })
  expect(wrapper.get('[data-diagram-export-button="png-2x"]').attributes('disabled')).toBeDefined()
})
