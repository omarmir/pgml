import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePgmlStudioSchemas } from '../../app/composables/usePgmlStudioSchemas'

const installLocalStorage = () => {
  const values = new Map<string, string>()
  const localStorage = {
    clear: () => {
      values.clear()
    },
    getItem: (key: string) => {
      return values.has(key) ? values.get(key)! : null
    },
    key: (index: number) => {
      return Array.from(values.keys())[index] || null
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorage
  })

  return localStorage
}

describe('usePgmlStudioSchemas', () => {
  beforeEach(() => {
    installLocalStorage().clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads saved schemas, lets the save dialog target an existing item, and overwrites it', async () => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'existing-schema',
        name: 'Existing schema',
        text: 'Table public.users {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-18T15:00:00.000Z'
      }
    ]))

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    expect(api.orderedSavedSchemas.value).toHaveLength(1)

    api.openSchemaDialog('save')
    api.selectSaveSchemaTarget(api.orderedSavedSchemas.value[0]!)

    source.value = 'Table public.users {\n  id uuid [pk]\n  email text\n}'
    await expect(api.saveSchemaToBrowser()).resolves.toBe(true)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(api.saveSchemaActionLabel.value).toBe('Overwrite saved schema')
    expect(api.saveSchemaTarget.value?.id).toBe('existing-schema')
    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.id).toBe('existing-schema')
    expect(persisted[0]?.text).toContain('email text')
  })

  it('downloads, loads, and deletes schemas while keeping the current selection in sync', async () => {
    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:pgml')
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const clickSpy = vi.fn()
    const originalCreateElement = document.createElement.bind(document)

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = originalCreateElement(tagName)

      if (tagName === 'a') {
        Object.defineProperty(element, 'click', {
          configurable: true,
          value: clickSpy
        })
      }

      return element
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    api.openSchemaDialog('save')
    api.currentSchemaName.value = 'Primary schema'
    await expect(api.saveSchemaToBrowser()).resolves.toBe(true)

    const savedSchema = api.orderedSavedSchemas.value[0]

    if (!savedSchema) {
      throw new Error('Expected a saved schema.')
    }

    api.downloadSchema()
    await new Promise((resolve) => {
      window.setTimeout(resolve, 0)
    })
    api.loadSavedSchema(savedSchema)
    api.deleteSavedSchema(savedSchema.id)

    expect(clickSpy).toHaveBeenCalled()
    expect(createObjectUrl).toHaveBeenCalled()
    expect(revokeObjectUrl).toHaveBeenCalled()
    expect(api.currentSchemaId.value).toBeNull()
    expect(api.orderedSavedSchemas.value).toHaveLength(0)

    createObjectUrl.mockRestore()
    revokeObjectUrl.mockRestore()
  })

  it('loads the most recently saved schema during setup', async () => {
    window.localStorage.setItem('pgml-studio-schemas-v1', JSON.stringify([
      {
        id: 'older-schema',
        name: 'Older schema',
        text: 'Table public.older {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-18T15:00:00.000Z'
      },
      {
        id: 'latest-schema',
        name: 'Latest schema',
        text: 'Table public.latest {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-19T09:30:00.000Z'
      }
    ]))

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    expect(source.value).toContain('Table public.latest')
    expect(api.currentSchemaId.value).toBe('latest-schema')
    expect(api.currentSchemaName.value).toBe('Latest schema')
    expect(api.currentSchemaUpdatedAt.value).toBe('2026-03-19T09:30:00.000Z')
    expect(api.hasSavedSchemaInSession.value).toBe(false)
    expect(api.isSavedToLocalStorage.value).toBe(true)
  })

  it('keeps the initial unsaved schema blank until the user edits it', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    expect(api.hasPendingLocalChanges.value).toBe(false)
    expect(api.isSavedToLocalStorage.value).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)

    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).toBeNull()
  })

  it('preserves the loaded schema id when autosaving a schema opened from an external source', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    api.loadSavedSchema({
      id: 'externally-loaded-schema',
      name: 'Imported schema',
      text: 'Table public.imported {\n  id uuid [pk]\n}',
      updatedAt: '2026-03-20T10:00:00.000Z'
    })

    source.value = 'Table public.imported {\n  id uuid [pk]\n  status text\n}'

    await vi.advanceTimersByTimeAsync(4900)

    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).toBeNull()

    await vi.advanceTimersByTimeAsync(5000)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.id).toBe('externally-loaded-schema')
    expect(persisted[0]?.text).toContain('status text')
    expect(api.currentSchemaId.value).toBe('externally-loaded-schema')
    expect(api.hasSavedSchemaInSession.value).toBe(true)
  })

  it('autosaves changes to local storage after five seconds', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    expect(api.hasPendingLocalChanges.value).toBe(false)

    source.value = 'Table public.users {\n  id uuid [pk]\n  email text\n}'

    expect(api.hasPendingLocalChanges.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(false)

    await vi.advanceTimersByTimeAsync(4900)

    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).toBeNull()

    await vi.advanceTimersByTimeAsync(100)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.text).toContain('email text')
    expect(typeof persisted[0]?.updatedAt).toBe('string')
    expect(api.currentSchemaUpdatedAt.value).toBe(persisted[0]?.updatedAt)
    expect(api.hasSavedSchemaInSession.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(true)
    expect(api.hasPendingLocalChanges.value).toBe(false)
  })

  it('keeps pending changes and exposes an error when local storage saving fails', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>
    const setItemSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage quota exceeded.')
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    source.value = 'Table public.users {\n  id uuid [pk]\n  email text\n}'

    await vi.advanceTimersByTimeAsync(5000)

    expect(api.localStorageSaveError.value).toBe('Unable to save to local storage.')
    expect(api.hasPendingLocalChanges.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(false)

    setItemSpy.mockRestore()
  })
})
