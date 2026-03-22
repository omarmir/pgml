import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { usePgmlStudioComputerFiles } from '../../app/composables/usePgmlStudioComputerFiles'

describe('usePgmlStudioComputerFiles', () => {
  afterEach(() => {
    vi.useRealTimers()
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

    await expect(api.saveSchemaToComputerFile(false)).resolves.toBe(true)
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
})
