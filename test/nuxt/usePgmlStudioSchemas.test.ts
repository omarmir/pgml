import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePgmlStudioSchemas } from '../../app/composables/usePgmlStudioSchemas'
import { usePgmlStudioVersionHistory } from '../../app/composables/usePgmlStudioVersionHistory'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'
import { useStudioSessionStore } from '../../app/stores/studio-session'

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
    resetStudioWorkspaceState()
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

    const source = ref('')
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
    expect(api.currentSchemaName.value).toBe('Untitled schema')
    expect(api.isSavedToLocalStorage.value).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)

    expect(window.localStorage.getItem('pgml-studio-schemas-v1')).toBeNull()
  })

  it('does not write browser schemas when browser persistence is disabled', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.gist_backed {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          autosaveEnabled: computed(() => false),
          browserPersistenceEnabled: computed(() => false),
          buildSchemaText: () => source.value,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    await expect(api.saveSchemaToBrowser()).resolves.toBe(false)

    source.value = 'Table public.gist_backed {\n  id uuid [pk]\n  name text\n}'
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

  it('autosaves serialized document changes even when the raw editor source stays the same', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    const serializedDocumentSuffix = ref('')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => `${source.value}${serializedDocumentSuffix.value}`,
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    expect(api.hasPendingLocalChanges.value).toBe(false)

    serializedDocumentSuffix.value = '\n\nVersion v_autosave_test {\n  name: "Checkpoint from workspace"\n}'

    expect(api.hasPendingLocalChanges.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(false)

    await vi.advanceTimersByTimeAsync(5000)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.text).toContain('Checkpoint from workspace')
    expect(api.hasSavedSchemaInSession.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(true)
    expect(api.hasPendingLocalChanges.value).toBe(false)
  })

  it('autosaves embedded layout changes even when download exports exclude layout', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    const embeddedLayoutSuffix = ref('')
    let api!: ReturnType<typeof usePgmlStudioSchemas>

    await mountSuspended(defineComponent({
      setup() {
        const studioSessionStore = useStudioSessionStore()

        studioSessionStore.includeLayoutInSchema = false
        api = usePgmlStudioSchemas({
          buildSchemaText: (includeLayout) => {
            return includeLayout
              ? `${source.value}${embeddedLayoutSuffix.value}`
              : source.value
          },
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    embeddedLayoutSuffix.value = '\n\nProperties "group:Core" {\n  masonry: true\n}'

    expect(api.hasPendingLocalChanges.value).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.text).toContain('Properties "group:Core" {')
    expect(persisted[0]?.text).toContain('masonry: true')
    expect(api.hasSavedSchemaInSession.value).toBe(true)
    expect(api.isSavedToLocalStorage.value).toBe(true)
    expect(api.hasPendingLocalChanges.value).toBe(false)
  })

  it('autosaves the debounced browser snapshot instead of recomputing stale schema text', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.users {\n  id uuid [pk]\n}')
    const serializedDocumentText = ref(source.value)
    let api!: ReturnType<typeof usePgmlStudioSchemas>
    let useStaleSerializedText = false
    let staleSerializedText = source.value

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioSchemas({
          buildSchemaText: () => {
            return useStaleSerializedText ? staleSerializedText : serializedDocumentText.value
          },
          canEmbedLayout: computed(() => true),
          initialSource: 'Table public.example {\n  id uuid [pk]\n}',
          source
        })

        return () => null
      }
    }))

    serializedDocumentText.value = `${source.value}\n\nProperties "group:Core" {\n  masonry: true\n}`
    await nextTick()
    expect(api.hasPendingLocalChanges.value).toBe(true)
    staleSerializedText = source.value
    useStaleSerializedText = true

    await vi.advanceTimersByTimeAsync(5000)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.text).toContain('masonry: true')
    expect(api.hasPendingLocalChanges.value).toBe(false)
  })

  it('autosaves real version-history layout changes when the workspace PGML changes', async () => {
    vi.useFakeTimers()

    const source = ref(`TableGroup Core {
  public.users
}

Table public.users in Core {
  id uuid [pk]
}`)
    let schemaApi!: ReturnType<typeof usePgmlStudioSchemas>
    let versionHistoryApi!: ReturnType<typeof usePgmlStudioVersionHistory>

    await mountSuspended(defineComponent({
      setup() {
        versionHistoryApi = usePgmlStudioVersionHistory({
          documentName: computed(() => 'Example schema'),
          source
        })
        schemaApi = usePgmlStudioSchemas({
          buildSchemaText: (includeLayout) => {
            return versionHistoryApi.serializeCurrentDocument(includeLayout, source.value)
          },
          canEmbedLayout: computed(() => true),
          initialSource: source.value,
          source
        })

        return () => null
      }
    }))

    expect(versionHistoryApi.updateCurrentDiagramViewNodeProperties({
      'group:Core': {
        color: '#8b5cf6',
        masonry: true,
        tableColumns: 1,
        x: 120,
        y: 90
      }
    })).toBe(true)

    expect(source.value).toContain('Properties "group:Core" {')
    expect(source.value).toContain('masonry: true')
    expect(versionHistoryApi.document.value.workspace.views[0]?.nodeProperties['group:Core']).toEqual({
      color: '#8b5cf6',
      masonry: true,
      tableColumns: 1,
      x: 120,
      y: 90
    })
    expect(versionHistoryApi.serializeCurrentDocument(true)).toContain('masonry: true')
    expect(versionHistoryApi.serializeCurrentDocument(true, source.value)).toContain('masonry: true')
    expect(schemaApi.hasPendingLocalChanges.value).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)

    const persisted = JSON.parse(window.localStorage.getItem('pgml-studio-schemas-v1') || '[]')

    expect(persisted).toHaveLength(1)
    expect(persisted[0]?.text).toContain('Properties "group:Core" {')
    expect(persisted[0]?.text).toContain('masonry: true')
    expect(schemaApi.hasPendingLocalChanges.value).toBe(false)
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
