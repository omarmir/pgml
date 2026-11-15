import { enableAutoUnmount } from '@vue/test-utils'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { usePgmlStudioSchemas } from '../../app/composables/usePgmlStudioSchemas'
import { usePgmlStudioComputerFiles } from '../../app/composables/usePgmlStudioComputerFiles'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'
import { useStudioSessionStore } from '../../app/stores/studio-session'
import * as computerFiles from '../../app/utils/computer-files'

enableAutoUnmount(afterEach)

describe('usePgmlStudioComputerFiles', () => {
  beforeEach(() => {
    resetStudioWorkspaceState()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('runs a joined live adapter writer when the original queued passive owner unmounts', async () => {
    const source = ref('original')
    let first!: ReturnType<typeof usePgmlStudioComputerFiles>
    let second!: ReturnType<typeof usePgmlStudioComputerFiles>
    let finish!: (value: computerFiles.PgmlRecentComputerFileWriteResult) => void
    const pending = new Promise<computerFiles.PgmlRecentComputerFileWriteResult>((resolve) => {
      finish = resolve
    })
    const staleWriter = vi.fn(() => pending)
    const liveWriter = vi.fn(async () => ({ ok: true, entry: { id: 'A', name: 'A', updatedAt: 'latest' } } satisfies computerFiles.PgmlRecentComputerFileWriteResult))
    const oldHost = await mountSuspended(defineComponent({ setup() {
      first = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile: staleWriter } })
      return () => null
    } }))
    first.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'original' })
    source.value = 'one'
    const held = first.saveSchemaToComputerFile()
    vi.useFakeTimers()
    source.value = 'two'
    await nextTick()
    const newHost = await mountSuspended(defineComponent({ setup() {
      second = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile: liveWriter } })
      return () => null
    } }))
    await vi.advanceTimersByTimeAsync(5100)
    oldHost.unmount()
    finish({ ok: true, entry: { id: 'A', name: 'A', updatedAt: 'first' } })
    await held
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(staleWriter).toHaveBeenCalledTimes(1)
    expect(liveWriter).toHaveBeenCalledOnce()
    expect(liveWriter).toHaveBeenCalledWith({ recentFileId: 'A', text: 'two' }, { permissionMode: 'passive' })
    expect(second.hasPendingComputerFileChanges.value).toBe(false)
    newHost.unmount()
  })

  it('resumes dirty passive file autosave after a different document load cancels', async () => {
    const source = ref('original')
    const write = vi.fn(async () => ({ ok: true, entry: { id: 'A', name: 'A', updatedAt: 'saved' } } satisfies computerFiles.PgmlRecentComputerFileWriteResult))
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const wrapper = await mountSuspended(defineComponent({ setup() {
      api = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile: write } })
      return () => null
    } }))
    api.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'original' })
    vi.useFakeTimers()
    source.value = 'dirty file'
    await nextTick()
    const store = useStudioSessionStore()
    const intent = store.beginWorkspaceLoad('gist')
    await vi.advanceTimersByTimeAsync(6000)
    expect(write).not.toHaveBeenCalled()
    store.cancelWorkspaceLoad(intent)
    await nextTick()
    await vi.advanceTimersByTimeAsync(6000)
    expect(write).toHaveBeenCalledOnce()
    expect(write).toHaveBeenCalledWith({ recentFileId: 'A', text: 'dirty file' }, { permissionMode: 'passive' })
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
    wrapper.unmount()
  })

  it('never drains a newly accepted browser document into an older file after its active write settles', async () => {
    const store = useStudioSessionStore()
    const source = ref('file original')
    let files!: ReturnType<typeof usePgmlStudioComputerFiles>
    let browser!: ReturnType<typeof usePgmlStudioSchemas>
    let finish!: (value: { ok: true, entry: { id: string, name: string, updatedAt: string } }) => void
    const pending = new Promise<{ ok: true, entry: { id: string, name: string, updatedAt: string } }>((resolve) => {
      finish = resolve
    })
    const writes: string[] = []
    const wrapper = await mountSuspended(defineComponent({ setup() {
      files = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value, enabled: computed(() => store.currentSourceKind === 'file'),
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile: async ({ text }) => {
          writes.push(text)
          return writes.length === 1 ? pending : { ok: true, entry: { id: 'A', name: 'A', updatedAt: 'new' } }
        } } })
      browser = usePgmlStudioSchemas({ source, buildSchemaText: () => source.value, canEmbedLayout: computed(() => true), initialSource: '', restoreLatestOnSetup: false,
        autosaveEnabled: computed(() => store.currentSourceKind === 'browser'), browserPersistenceEnabled: computed(() => store.currentSourceKind === 'browser') })
      return () => null
    } }))
    files.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'file original' })
    vi.useFakeTimers()
    source.value = 'file edited'
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(writes).toEqual(['file edited'])
    browser.loadSavedSchema({ id: 'B', name: 'B', updatedAt: 'now', text: 'browser B source' })
    finish({ ok: true, entry: { id: 'A', name: 'A', updatedAt: 'saved' } })
    await vi.advanceTimersByTimeAsync(0)
    await nextTick()
    expect(writes).toEqual(['file edited'])
    expect(source.value).toBe('browser B source')
    expect(store.currentSourceKind).toBe('browser')
    wrapper.unmount()
  })

  it('keeps a newly selected file intact when an older save completes', async () => {
    const source = ref('A original')
    let finish!: (value: { ok: true, entry: { id: string, name: string, updatedAt: string } }) => void
    const write = new Promise<{ ok: true, entry: { id: string, name: string, updatedAt: string } }>((resolve) => {
      finish = resolve
    })
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          source, buildSchemaText: () => source.value,
          fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile: () => write }
        })
        return () => null
      }
    }))
    api.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'A original' })
    source.value = 'A edited'
    const saving = api.saveSchemaToComputerFile()
    api.syncLoadedComputerFile({ entry: { id: 'B', name: 'B', updatedAt: 'B time' }, text: 'B original' })
    finish({ ok: true, entry: { id: 'A', name: 'A saved', updatedAt: 'new' } })
    expect(await saving).toBe(false)
    expect(api.currentComputerFileId.value).toBe('B')
    expect(api.currentComputerFileName.value).toBe('B')
    expect(api.currentComputerFileUpdatedAt.value).toBe('B time')
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
    expect(api.hasSavedComputerFileInSession.value).toBe(false)
  })

  it('ignores an older file load that finishes after a newer load', async () => {
    const source = ref('')
    type Loaded = { entry: { id: string, name: string, updatedAt: string }, text: string }
    let finishA!: (value: Loaded) => void
    const loadingA = new Promise<Loaded>((resolve) => {
      finishA = resolve
    })
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [],
            loadRecentComputerFile: async id => id === 'A' ? loadingA : { entry: { id: 'B', name: 'B', updatedAt: 'B time' }, text: 'B original' }
          }
        })
        return () => null
      }
    }))
    const old = api.loadRecentComputerFileById('A')
    expect(await api.loadRecentComputerFileById('B')).toBe(true)
    finishA({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'A original' })
    expect(await old).toBe(false)
    expect(source.value).toBe('B original')
    expect(api.currentComputerFileId.value).toBe('B')
  })

  it('discards pending loads after unmount and preserves the next shared session', async () => {
    const source = ref('')
    type Loaded = { entry: { id: string, name: string, updatedAt: string }, text: string }
    let finish!: (value: Loaded) => void
    const loading = new Promise<Loaded>((resolve) => {
      finish = resolve
    })
    let first!: ReturnType<typeof usePgmlStudioComputerFiles>
    const wrapper = await mountSuspended(defineComponent({
      setup() {
        first = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
          fileOperations: { listRecentComputerFiles: async () => [], loadRecentComputerFile: () => loading }
        })
        return () => null
      }
    }))
    const pending = first.loadRecentComputerFileById('A')
    wrapper.unmount()
    let second!: ReturnType<typeof usePgmlStudioComputerFiles>
    await mountSuspended(defineComponent({
      setup() {
        second = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
          fileOperations: { listRecentComputerFiles: async () => [] }
        })
        return () => null
      }
    }))
    second.syncLoadedComputerFile({ entry: { id: 'B', name: 'B', updatedAt: 'B time' }, text: 'B original' })
    finish({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'A original' })
    expect(await pending).toBe(false)
    expect(source.value).toBe('B original')
    expect(second.currentComputerFileId.value).toBe('B')
  })

  it('shares the physical write queue across adapter remounts', async () => {
    const source = ref('')
    type Entry = { id: string, name: string, updatedAt: string }
    let finish!: (value: { ok: true, entry: Entry }) => void
    const held = new Promise<{ ok: true, entry: Entry }>((resolve) => {
      finish = resolve
    })
    const writes: string[] = []
    const writeRecentComputerFile = vi.fn(async ({ text }: { recentFileId: string, text: string }) => {
      writes.push(text)
      return text === 'first' ? held : { ok: true as const, entry: { id: 'A', name: 'A', updatedAt: text } }
    })
    let first!: ReturnType<typeof usePgmlStudioComputerFiles>
    const wrapper = await mountSuspended(defineComponent({ setup() {
      first = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile } })
      return () => null
    } }))
    first.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'original' })
    source.value = 'first'
    const savingFirst = first.saveSchemaToComputerFile()
    wrapper.unmount()
    let second!: ReturnType<typeof usePgmlStudioComputerFiles>
    await mountSuspended(defineComponent({ setup() {
      second = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
        fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile } })
      return () => null
    } }))
    source.value = 'second'
    const savingSecond = second.saveSchemaToComputerFile()
    expect(writes).toEqual(['first'])
    expect(JSON.stringify(useStudioSessionStore().$state)).not.toContain('Promise')
    finish({ ok: true, entry: { id: 'A', name: 'A', updatedAt: 'first' } })
    await Promise.all([savingFirst, savingSecond])
    expect(writes).toEqual(['first', 'second'])
    expect(second.currentComputerFileUpdatedAt.value).toBe('second')
    expect(second.hasPendingComputerFileChanges.value).toBe(false)
  })

  it.each(['older-first', 'newer-first'])('keeps the latest intent across two live adapters (%s)', async (order) => {
    const source = ref('')
    type Loaded = { entry: { id: string, name: string, updatedAt: string }, text: string }
    let finishA!: (value: Loaded) => void
    let finishB!: (value: Loaded) => void
    const loadingA = new Promise<Loaded>((resolve) => {
      finishA = resolve
    })
    const loadingB = new Promise<Loaded>((resolve) => {
      finishB = resolve
    })
    const mountAdapter = async () => {
      let api!: ReturnType<typeof usePgmlStudioComputerFiles>
      await mountSuspended(defineComponent({ setup() {
        api = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
          fileOperations: { listRecentComputerFiles: async () => [], loadRecentComputerFile: id => id === 'A' ? loadingA : loadingB } })
        return () => null
      } }))
      return api
    }
    const first = await mountAdapter()
    const second = await mountAdapter()
    const old = first.loadRecentComputerFileById('A')
    const latest = second.loadRecentComputerFileById('B')
    const A = { entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'A original' }
    const B = { entry: { id: 'B', name: 'B', updatedAt: 'new' }, text: 'B original' }
    if (order === 'older-first') {
      finishA(A)
      expect(await old).toBe(false)
      finishB(B)
    } else {
      finishB(B)
      expect(await latest).toBe(true)
      finishA(A)
    }
    expect(await old).toBe(false)
    expect(await latest).toBe(true)
    expect(source.value).toBe('B original')
    expect(first.currentComputerFileId.value).toBe('B')
    expect(second.currentComputerFileId.value).toBe('B')
  })

  it('does not start an unmounted autosave and resumes dirty work in the next adapter', async () => {
    vi.useFakeTimers()
    const source = ref('')
    const writeRecentComputerFile = vi.fn(async ({ recentFileId }: { recentFileId: string, text: string }) => ({ ok: true as const, entry: { id: recentFileId, name: 'A', updatedAt: 'saved' } }))
    const mountAdapter = async () => {
      let api!: ReturnType<typeof usePgmlStudioComputerFiles>
      const wrapper = await mountSuspended(defineComponent({ setup() {
        api = usePgmlStudioComputerFiles({ source, buildSchemaText: () => source.value,
          fileOperations: { listRecentComputerFiles: async () => [], writeRecentComputerFile } })
        return () => null
      } }))
      return { api, wrapper }
    }
    const first = await mountAdapter()
    first.api.syncLoadedComputerFile({ entry: { id: 'A', name: 'A', updatedAt: 'old' }, text: 'original' })
    source.value = 'dirty before remount'
    await nextTick()
    first.wrapper.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    expect(writeRecentComputerFile).not.toHaveBeenCalled()
    const second = await mountAdapter()
    expect(second.api.hasPendingComputerFileChanges.value).toBe(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(writeRecentComputerFile).toHaveBeenCalledTimes(1)
    expect(writeRecentComputerFile).toHaveBeenCalledWith({ recentFileId: 'A', text: 'dirty before remount' }, { permissionMode: 'passive' })
    expect(second.api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('loads a recent computer file and autosaves edits back to it', async () => {
    vi.useFakeTimers()

    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const recentFiles = [{
      id: 'linked-file',
      name: 'linked-schema',
      updatedAt: '2026-03-20T10:00:00.000Z'
    }]
    const writeRecentComputerFile = vi.fn(async ({ recentFileId }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:05:00.000Z'
        },
        ok: true as const
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => recentFiles,
            loadRecentComputerFile: async () => {
              return {
                entry: recentFiles[0]!,
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    expect(source.value).toContain('Table public.linked')
    expect(api.currentComputerFileName.value).toBe('linked-schema')
    expect(api.hasSavedComputerFileInSession.value).toBe(false)
    expect(api.isSavedToComputerFile.value).toBe(true)

    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    await vi.advanceTimersByTimeAsync(4900)

    expect(writeRecentComputerFile).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5000)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'passive'
    })
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:05:00.000Z')
    expect(api.hasSavedComputerFileInSession.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('autosaves serialized file-backed changes even when the raw editor source stays the same', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.linked {\n  id uuid [pk]\n}')
    const serializedDocumentSuffix = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async ({ recentFileId, text }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:07:00.000Z'
        },
        ok: true as const,
        text
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => `${source.value}${serializedDocumentSuffix.value}`,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: source.value
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    serializedDocumentSuffix.value = '\n\nVersion v_file_autosave_test {\n  name: "Checkpoint from file"\n}'

    expect(api.hasPendingComputerFileChanges.value).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n}\n\nVersion v_file_autosave_test {\n  name: "Checkpoint from file"\n}'
    }, {
      permissionMode: 'passive'
    })
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:07:00.000Z')
    expect(api.hasSavedComputerFileInSession.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('defaults file-backed autosaves to embedded layout snapshots when no layout preference ref is provided', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.linked {\n  id uuid [pk]\n}')
    const embeddedLayoutSuffix = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async ({ recentFileId, text }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:08:00.000Z'
        },
        ok: true as const,
        text
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: (includeLayout) => {
            return includeLayout
              ? `${source.value}${embeddedLayoutSuffix.value}`
              : source.value
          },
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: source.value
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    embeddedLayoutSuffix.value = '\n\nProperties "group:Core" {\n  x: 420\n  y: 160\n}'

    expect(api.hasPendingComputerFileChanges.value).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n}\n\nProperties "group:Core" {\n  x: 420\n  y: 160\n}'
    }, {
      permissionMode: 'passive'
    })
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:08:00.000Z')
    expect(api.hasSavedComputerFileInSession.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('autosaves the debounced file snapshot instead of recomputing stale schema text', async () => {
    vi.useFakeTimers()

    const source = ref('Table public.linked {\n  id uuid [pk]\n}')
    const serializedDocumentText = ref(source.value)
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    let useStaleSerializedText = false
    let staleSerializedText = source.value
    const writeRecentComputerFile = vi.fn(async ({ recentFileId, text }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:09:00.000Z'
        },
        ok: true as const,
        text
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => {
            return useStaleSerializedText ? staleSerializedText : serializedDocumentText.value
          },
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: source.value
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    serializedDocumentText.value = `${source.value}\n\nProperties "group:Core" {\n  masonry: true\n}`
    await nextTick()
    expect(api.hasPendingComputerFileChanges.value).toBe(true)
    staleSerializedText = source.value
    useStaleSerializedText = true

    await vi.advanceTimersByTimeAsync(5000)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n}\n\nProperties "group:Core" {\n  masonry: true\n}'
    }, {
      permissionMode: 'passive'
    })
    expect(api.hasSavedComputerFileInSession.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('opens a file from the picker and keeps the recent list in sync', async () => {
    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'picked-file',
              name: 'picked-schema',
              updatedAt: '2026-03-20T11:00:00.000Z'
            }],
            loadRecentComputerFile: async () => null,
            openComputerFile: async () => {
              return {
                entry: {
                  id: 'picked-file',
                  name: 'picked-schema',
                  updatedAt: '2026-03-20T11:00:00.000Z'
                },
                text: 'Table public.picked {\n  id uuid [pk]\n}'
              }
            },
            writeRecentComputerFile: async () => {
              return {
                ok: false as const,
                reason: 'unsupported' as const
              }
            }
          },
          source
        })

        return () => null
      }
    }))

    await api.openComputerFileFromPicker()

    expect(source.value).toContain('Table public.picked')
    expect(api.currentComputerFileName.value).toBe('picked-schema')
    expect(api.recentComputerFiles.value).toHaveLength(1)
    expect(api.recentComputerFiles.value[0]?.id).toBe('picked-file')
  })

  it('asks for permission again on manual save after autosave loses access', async () => {
    vi.useFakeTimers()

    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async (_input: {
      recentFileId: string
      text: string
    }, options?: {
      permissionMode?: 'interactive' | 'passive'
    }) => {
      if (options?.permissionMode === 'passive') {
        return {
          ok: false as const,
          reason: 'permission-denied' as const
        }
      }

      return {
        entry: {
          id: 'linked-file',
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:10:00.000Z'
        },
        ok: true as const
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    await vi.advanceTimersByTimeAsync(5000)

    expect(api.computerFileSaveError.value).toBe(
      'File access needs to be restored before PGML can save again. Use Save to grant permission again.'
    )
    expect(writeRecentComputerFile).toHaveBeenNthCalledWith(1, {
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'passive'
    })

    await expect(api.saveSchemaToComputerFile()).resolves.toBe(true)
    expect(writeRecentComputerFile).toHaveBeenNthCalledWith(2, {
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'interactive'
    })
    expect(api.computerFileSaveError.value).toBe(null)
    expect(api.hasSavedComputerFileInSession.value).toBe(true)
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:10:00.000Z')
  })

  it('keeps file-backed changes pending when passive saves are unsupported', async () => {
    vi.useFakeTimers()
    vi.spyOn(computerFiles, 'supportsPassiveRecentComputerFileWrites').mockReturnValue(false)

    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async ({ recentFileId }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:15:00.000Z'
        },
        ok: true as const
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    await vi.advanceTimersByTimeAsync(5000)

    expect(writeRecentComputerFile).not.toHaveBeenCalled()
    expect(api.hasPendingComputerFileChanges.value).toBe(true)
    expect(api.isSavedToComputerFile.value).toBe(false)
    expect(api.computerFileSaveError.value).toBe(null)
    expect(api.passiveComputerFileWritesSupported.value).toBe(false)

    await expect(api.saveSchemaToComputerFile()).resolves.toBe(true)
    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'interactive'
    })
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:15:00.000Z')
  })

  it('manual file saves always persist embedded layout and clear pending changes', async () => {
    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async ({ recentFileId, text }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:20:00.000Z'
        },
        ok: true as const,
        text
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: (includeLayout) => {
            return includeLayout
              ? `${source.value}\n\n// embedded layout`
              : source.value
          },
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    expect(api.hasPendingComputerFileChanges.value).toBe(true)

    await expect(api.saveSchemaToComputerFile()).resolves.toBe(true)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n  status text\n}\n\n// embedded layout'
    }, {
      permissionMode: 'interactive'
    })
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:20:00.000Z')
    expect(api.isSavedToComputerFile.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('manual file saves include embedded layout even when only layout data changed', async () => {
    const source = ref('Table public.linked {\n  id uuid [pk]\n}')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>
    const writeRecentComputerFile = vi.fn(async ({ recentFileId, text }: {
      recentFileId: string
      text: string
    }) => {
      return {
        entry: {
          id: recentFileId,
          name: 'linked-schema',
          updatedAt: '2026-03-20T10:22:00.000Z'
        },
        ok: true as const,
        text
      }
    })

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: (includeLayout) => {
            return includeLayout
              ? `${source.value}\n\nProperties "group:Core" {\n  masonry: true\n}`
              : source.value
          },
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: source.value
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')

    expect(api.hasPendingComputerFileChanges.value).toBe(true)

    await expect(api.saveSchemaToComputerFile()).resolves.toBe(true)

    expect(writeRecentComputerFile).toHaveBeenCalledWith({
      recentFileId: 'linked-file',
      text: 'Table public.linked {\n  id uuid [pk]\n}\n\nProperties "group:Core" {\n  masonry: true\n}'
    }, {
      permissionMode: 'interactive'
    })
    expect(api.currentComputerFileUpdatedAt.value).toBe('2026-03-20T10:22:00.000Z')
    expect(api.isSavedToComputerFile.value).toBe(true)
    expect(api.hasPendingComputerFileChanges.value).toBe(false)
  })

  it('clears the saving state when manual file saves throw unexpectedly', async () => {
    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile: async () => {
              throw new Error('Disk write stalled')
            }
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')
    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    await expect(api.saveSchemaToComputerFile()).resolves.toBe(false)

    expect(api.isSavingToComputerFile.value).toBe(false)
    expect(api.computerFileSaveError.value).toBe('Disk write stalled')
    expect(api.hasPendingComputerFileChanges.value).toBe(true)
  })

  it('clears the saving state when autosave file writes throw unexpectedly', async () => {
    vi.useFakeTimers()

    const source = ref('')
    let api!: ReturnType<typeof usePgmlStudioComputerFiles>

    await mountSuspended(defineComponent({
      setup() {
        api = usePgmlStudioComputerFiles({
          buildSchemaText: () => source.value,
          fileOperations: {
            listRecentComputerFiles: async () => [{
              id: 'linked-file',
              name: 'linked-schema',
              updatedAt: '2026-03-20T10:00:00.000Z'
            }],
            loadRecentComputerFile: async () => {
              return {
                entry: {
                  id: 'linked-file',
                  name: 'linked-schema',
                  updatedAt: '2026-03-20T10:00:00.000Z'
                },
                text: 'Table public.linked {\n  id uuid [pk]\n}'
              }
            },
            openComputerFile: async () => null,
            writeRecentComputerFile: async () => {
              throw new Error('Passive write stalled')
            }
          },
          source
        })

        return () => null
      }
    }))

    await api.loadRecentComputerFileById('linked-file')
    source.value = 'Table public.linked {\n  id uuid [pk]\n  status text\n}'

    await vi.advanceTimersByTimeAsync(5000)

    expect(api.isSavingToComputerFile.value).toBe(false)
    expect(api.computerFileSaveError.value).toBe('Passive write stalled')
    expect(api.hasPendingComputerFileChanges.value).toBe(true)
  })
})
