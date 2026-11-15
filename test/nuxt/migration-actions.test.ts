import { mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import JSZip from 'jszip'
import { parsePgml } from '../../app/utils/pgml'
import { buildPgmlMigrationDiffBundle } from '../../app/utils/pgml-migration-diff'
import type { PgmlVersionMigrationStepBundle } from '../../app/utils/pgml-version-migration'
import PgmlDiagramMigrationsPanel from '../../app/components/pgml/PgmlDiagramMigrationsPanel.vue'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
enableAutoUnmount(afterEach)
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  if (originalClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard')
  else Object.defineProperty(navigator, 'clipboard', originalClipboard)
})
const mountMigrations = () => mountSuspended(PgmlDiagramMigrationsPanel, { props: {
  migrationHasChanges: true, migrationSql: 'CREATE TABLE public.sql_copy (id int);',
  migrationKysely: 'export const up = async () => {};'
} })
describe('migration clipboard ownership', () => {
  it('copies captured content once and never labels a newly selected format as copied', async () => {
    let finish!: () => void
    const writeText = vi.fn(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = await mountMigrations()
    await wrapper.get('[data-version-migration-copy="sql"]').trigger('click')
    await wrapper.get('[data-version-migration-copy="sql"]').trigger('click')
    expect(writeText).toHaveBeenCalledExactlyOnceWith('CREATE TABLE public.sql_copy (id int);')
    await wrapper.get('[data-version-migration-format="kysely"]').trigger('click')
    expect(wrapper.get('[data-version-migration-copy="kysely"]').attributes('disabled')).toBeDefined()
    finish()
    await flushPromises()
    expect(wrapper.get('[data-version-migration-copy="kysely"]').text()).toBe('Copy Kysely')
    expect(wrapper.get('[role="status"]').text()).toBe('')
  })
  it('restarts feedback timeout for repeated copies and clears its timer on disposal', async () => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } })
    const wrapper = await mountMigrations()
    vi.useFakeTimers()
    const timers = vi.spyOn(window, 'setTimeout')
    const clear = vi.spyOn(window, 'clearTimeout')
    const copy = wrapper.get('[data-version-migration-copy="sql"]')
    await copy.trigger('click')
    await flushPromises()
    expect(copy.text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(1000)
    await copy.trigger('click')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(700)
    expect(copy.text()).toBe('Copied')
    await vi.advanceTimersByTimeAsync(900)
    expect(copy.text()).toBe('Copy SQL')
    await copy.trigger('click')
    await flushPromises()
    const resetIndex = timers.mock.calls.findLastIndex(call => call[1] === 1600)
    const reset = timers.mock.results[resetIndex]
    expect(reset?.type).toBe('return')
    wrapper.unmount()
    if (reset?.type !== 'return') throw new Error('Feedback timer missing')
    expect(clear).toHaveBeenCalledWith(reset.value)
  })
  it('shows recoverable failure and ignores a write completing after disposal', async () => {
    const writeText = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('Clipboard unavailable'))
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const wrapper = await mountMigrations()
    vi.useFakeTimers()
    const timers = vi.spyOn(window, 'setTimeout')
    await wrapper.get('[data-version-migration-copy="sql"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-version-migration-copy="sql"]').text()).toBe('Copy failed')
    let finish!: () => void
    writeText.mockImplementationOnce(() => new Promise<void>((resolve) => {
      finish = resolve
    }))
    await wrapper.get('[data-version-migration-copy="sql"]').trigger('click')
    wrapper.unmount()
    const resetCount = timers.mock.calls.filter(call => call[1] === 1600).length
    finish()
    await flushPromises()
    expect(timers.mock.calls.filter(call => call[1] === 1600)).toHaveLength(resetCount)
  })
})

const mountArchive = async () => {
  const steps: PgmlVersionMigrationStepBundle[] = [0, 1].map(index => ({
    ...buildPgmlMigrationDiffBundle(parsePgml(''), parsePgml(`Table public.step_${index} {\n  id integer [pk]\n}`), { baseName: `00${index + 1}-step` }),
    index, label: `Step ${index + 1}`, target: { baseId: `v${index}`, baseLabel: 'Base', targetId: 'workspace', targetLabel: 'Workspace' },
    validation: { isValid: true, issues: [] }
  }))
  const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:migration-test')
  const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  const wrapper = await mountSuspended(PgmlDiagramMigrationsPanel, { props: { migrationSteps: steps,
    migrationHasChanges: true, migrationSql: 'combined SQL', migrationKysely: 'combined Kysely', migrationFileName: 'captured.sql' } })
  return { wrapper, steps, createUrl, revokeUrl, click }
}
describe('migration archive ownership', () => {
  it('generates once and keeps the captured files/name while selection and props change', async () => {
    let finish!: (blob: Blob) => void
    const pending = new Promise<Blob>((resolve) => {
      finish = resolve
    })
    const generate = vi.spyOn(JSZip.prototype, 'generateAsync').mockReturnValue(pending)
    const { wrapper, steps, click, createUrl, revokeUrl } = await mountArchive()
    const download = wrapper.get('[data-version-migration-download="sql"]')
    await download.trigger('click')
    await download.trigger('click')
    expect(generate).toHaveBeenCalledTimes(1)
    const archive = generate.mock.contexts[0]
    if (!(archive instanceof JSZip)) throw new Error('Archive generation context missing')
    expect(Object.keys(archive.files).sort()).toEqual(steps.map(step => step.sql.migration.fileName).sort())
    await wrapper.get('[data-version-migration-format="kysely"]').trigger('click')
    await wrapper.setProps({ migrationFileName: 'new.sql', migrationKyselyFileName: 'new.ts' })
    const blob = new Blob(['archive'])
    finish(blob)
    await flushPromises()
    expect(createUrl).toHaveBeenCalledExactlyOnceWith(blob)
    expect(click.mock.contexts[0]).toMatchObject({ download: 'captured.sql.zip' })
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:migration-test')
  })
  it('exposes an archive failure and can retry the same download', async () => {
    const generate = vi.spyOn(JSZip.prototype, 'generateAsync').mockRejectedValueOnce(new Error('Archive failed')).mockResolvedValueOnce(new Blob(['retry']))
    const { wrapper, click } = await mountArchive()
    await wrapper.get('[data-version-migration-download="sql"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toBe('Archive failed')
    await wrapper.get('[data-version-migration-download="sql"]').trigger('click')
    await flushPromises()
    expect(generate).toHaveBeenCalledTimes(2)
    expect(click).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('does not allocate or download a late archive after disposal', async () => {
    let finish!: (blob: Blob) => void
    vi.spyOn(JSZip.prototype, 'generateAsync').mockReturnValue(new Promise<Blob>((resolve) => {
      finish = resolve
    }))
    const { wrapper, createUrl, click } = await mountArchive()
    await wrapper.get('[data-version-migration-download="sql"]').trigger('click')
    wrapper.unmount()
    finish(new Blob(['late']))
    await flushPromises()
    expect(createUrl).not.toHaveBeenCalled()
    expect(click).not.toHaveBeenCalled()
  })
})
