import { describe, expect, it } from 'vitest'

import {
  createComputerPgmlFile,
  ensurePgmlFileName,
  getRecentComputerPgmlFilePermissionState,
  listRecentComputerPgmlFiles,
  loadRecentComputerPgmlFile,
  openComputerPgmlFile,
  stripPgmlFileExtension,
  writeRecentComputerPgmlFile,
  type PgmlComputerFileHandle,
  type PgmlComputerFileStore,
  type PgmlFilePermissionState,
  type PgmlFileSystemAccessApi
} from '../../app/utils/computer-files'

type MemoryFile = {
  fileName: string
  text: string
}

const createMemoryStore = () => {
  const records = new Map<string, {
    handle: PgmlComputerFileHandle
    id: string
    name: string
    updatedAt: string
  }>()

  const store: PgmlComputerFileStore = {
    delete: async (id) => {
      records.delete(id)
    },
    getAll: async () => {
      return Array.from(records.values())
    },
    getById: async (id) => {
      return records.get(id) || null
    },
    put: async (record) => {
      records.set(record.id, record)
    }
  }

  return store
}

const createMemoryHandle = (
  id: string,
  files: Map<string, MemoryFile>,
  permissionState: {
    query: PgmlFilePermissionState
    request: PgmlFilePermissionState
  } = {
    query: 'granted',
    request: 'granted'
  }
) => {
  const handle = {
    createWritable: async () => {
      let nextText = ''

      return {
        close: async () => {
          const file = files.get(id)

          if (file) {
            file.text = nextText
          }
        },
        write: async (contents: string) => {
          nextText = contents
        }
      }
    },
    getFile: async () => {
      const file = files.get(id)

      if (!file) {
        throw new Error(`Unknown memory file ${id}`)
      }

      return {
        name: file.fileName,
        text: async () => file.text
      }
    },
    isSameEntry: async (other: PgmlComputerFileHandle) => {
      return other === handle
    },
    queryPermission: async () => permissionState.query,
    requestPermission: async () => {
      permissionState.query = permissionState.request
      return permissionState.request
    }
  } satisfies PgmlComputerFileHandle

  return handle
}

describe('computer file utilities', () => {
  it('normalizes pgml file names and extensions', () => {
    expect(stripPgmlFileExtension('schema.pgml')).toBe('schema')
    expect(stripPgmlFileExtension('schema')).toBe('schema')
    expect(ensurePgmlFileName('schema')).toBe('schema.pgml')
    expect(ensurePgmlFileName('schema.pgml')).toBe('schema.pgml')
    expect(ensurePgmlFileName('')).toBe('schema.pgml')
  })

  it('creates, lists, loads, and writes recent computer files', async () => {
    const files = new Map<string, MemoryFile>([
      ['save-target', {
        fileName: 'created-schema.pgml',
        text: ''
      }],
      ['open-target', {
        fileName: 'existing-schema.pgml',
        text: 'Table public.existing {\n  id uuid [pk]\n}'
      }]
    ])
    const store = createMemoryStore()
    const access: PgmlFileSystemAccessApi = {
      showOpenFilePicker: async () => {
        return [createMemoryHandle('open-target', files)]
      },
      showSaveFilePicker: async () => {
        return createMemoryHandle('save-target', files)
      }
    }

    const createdFile = await createComputerPgmlFile({
      name: 'Created schema',
      text: 'Table public.created {\n  id uuid [pk]\n}'
    }, {
      access,
      store
    })

    expect(createdFile?.entry.name).toBe('created-schema')
    expect(files.get('save-target')?.text).toContain('Table public.created')

    const openedFile = await openComputerPgmlFile({
      access,
      store
    })

    expect(openedFile?.entry.name).toBe('existing-schema')
    expect(openedFile?.text).toContain('Table public.existing')

    const recentFiles = await listRecentComputerPgmlFiles({
      store
    })

    expect(recentFiles).toHaveLength(2)
    expect(recentFiles.map(file => file.name).sort()).toEqual([
      'created-schema',
      'existing-schema'
    ])

    const loadedFile = await loadRecentComputerPgmlFile(openedFile?.entry.id || '', {
      store
    })

    expect(loadedFile?.text).toContain('Table public.existing')

    const writtenFile = await writeRecentComputerPgmlFile({
      recentFileId: createdFile?.entry.id || '',
      text: 'Table public.created {\n  id uuid [pk]\n  status text\n}'
    }, {
      store
    })

    expect(writtenFile.ok).toBe(true)
    expect(writtenFile.ok ? writtenFile.entry.name : null).toBe('created-schema')
    expect(files.get('save-target')?.text).toContain('status text')
  })

  it('reuses the same recent entry when the same handle is opened again', async () => {
    const files = new Map<string, MemoryFile>([
      ['shared-file', {
        fileName: 'shared-schema.pgml',
        text: 'Table public.shared {\n  id uuid [pk]\n}'
      }]
    ])
    const store = createMemoryStore()
    const sharedHandle = createMemoryHandle('shared-file', files)
    const access: PgmlFileSystemAccessApi = {
      showOpenFilePicker: async () => {
        return [sharedHandle]
      },
      showSaveFilePicker: async () => {
        return sharedHandle
      }
    }

    const firstOpen = await openComputerPgmlFile({
      access,
      store
    })
    const secondOpen = await openComputerPgmlFile({
      access,
      store
    })
    const recentFiles = await listRecentComputerPgmlFiles({
      store
    })

    expect(firstOpen?.entry.id).toBe(secondOpen?.entry.id)
    expect(recentFiles).toHaveLength(1)
  })

  it('re-prompts for permission on interactive saves after access is reset', async () => {
    const files = new Map<string, MemoryFile>([
      ['permission-target', {
        fileName: 'permission-schema.pgml',
        text: 'Table public.permissioned {\n  id uuid [pk]\n}'
      }]
    ])
    const store = createMemoryStore()
    const permissionState = {
      query: 'prompt' as const,
      request: 'granted' as const
    }

    await store.put({
      handle: createMemoryHandle('permission-target', files, permissionState),
      id: 'permission-entry',
      name: 'permission-schema',
      updatedAt: '2026-03-21T13:00:00.000Z'
    })

    const passiveWrite = await writeRecentComputerPgmlFile({
      recentFileId: 'permission-entry',
      text: 'Table public.permissioned {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'passive',
      store
    })

    expect(passiveWrite).toEqual({
      ok: false,
      reason: 'permission-denied'
    })
    expect(files.get('permission-target')?.text).not.toContain('status text')

    const interactiveWrite = await writeRecentComputerPgmlFile({
      recentFileId: 'permission-entry',
      text: 'Table public.permissioned {\n  id uuid [pk]\n  status text\n}'
    }, {
      permissionMode: 'interactive',
      store
    })

    expect(interactiveWrite.ok).toBe(true)
    expect(files.get('permission-target')?.text).toContain('status text')
  })

  it('reports the stored recent-file permission state without prompting first', async () => {
    const files = new Map<string, MemoryFile>([
      ['permission-target', {
        fileName: 'permission-schema.pgml',
        text: 'Table public.permissioned {\n  id uuid [pk]\n}'
      }]
    ])
    const store = createMemoryStore()

    await store.put({
      handle: createMemoryHandle('permission-target', files, {
        query: 'prompt',
        request: 'granted'
      }),
      id: 'permission-entry',
      name: 'permission-schema',
      updatedAt: '2026-03-21T13:00:00.000Z'
    })

    await expect(getRecentComputerPgmlFilePermissionState('permission-entry', {
      store
    })).resolves.toBe('prompt')

    await expect(getRecentComputerPgmlFilePermissionState('missing-entry', {
      store
    })).resolves.toBe(null)
  })
})
