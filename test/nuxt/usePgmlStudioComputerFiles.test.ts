import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePgmlStudioComputerFiles } from '../../app/composables/usePgmlStudioComputerFiles'
import * as computerFiles from '../../app/utils/computer-files'

describe('usePgmlStudioComputerFiles', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
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
