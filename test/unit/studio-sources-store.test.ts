import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteRecentComputerPgmlFile,
  listRecentComputerPgmlFiles
} from '../../app/utils/computer-files'
import { useStudioSourcesStore } from '../../app/stores/studio-sources'
import { useStudioSessionStore } from '../../app/stores/studio-session'
import {
  persistSavedPgmlSchemasToBrowserStorage,
  readSavedPgmlSchemasFromBrowserStorage
} from '../../app/utils/studio-browser-schemas'
import {
  loadPgmlGistFiles,
  persistPgmlGistConnectionMetadata,
  savePgmlGistFile
} from '../../app/utils/github-gists'

vi.mock('../../app/utils/computer-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/computer-files')>()

  return {
    ...actual,
    deleteRecentComputerPgmlFile: vi.fn(async () => true),
    listRecentComputerPgmlFiles: vi.fn(async () => [])
  }
})

vi.mock('../../app/utils/studio-browser-schemas', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/studio-browser-schemas')>()

  return {
    ...actual,
    persistSavedPgmlSchemasToBrowserStorage: vi.fn(() => true),
    readSavedPgmlSchemasFromBrowserStorage: vi.fn(() => [])
  }
})

vi.mock('../../app/utils/github-gists', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../app/utils/github-gists')>()

  return {
    ...actual,
    loadPgmlGistFiles: vi.fn(async () => []),
    persistPgmlGistConnectionMetadata: vi.fn(() => true),
    readPgmlGistConnectionMetadata: vi.fn(() => null),
    savePgmlGistFile: vi.fn(async () => ({
      filename: 'gist-backed.pgml',
      gistId: 'gist-1',
      size: 38,
      text: 'Table public.gist_backed {\n  id uuid [pk]\n}',
      updatedAt: '2026-03-21T13:00:00.000Z'
    }))
  }
})

describe('studio sources store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(deleteRecentComputerPgmlFile).mockReset()
    vi.mocked(listRecentComputerPgmlFiles).mockReset()
    vi.mocked(persistSavedPgmlSchemasToBrowserStorage).mockReset()
    vi.mocked(readSavedPgmlSchemasFromBrowserStorage).mockReset()
    vi.mocked(loadPgmlGistFiles).mockReset()
    vi.mocked(persistPgmlGistConnectionMetadata).mockReset()
    vi.mocked(savePgmlGistFile).mockReset()
    vi.mocked(deleteRecentComputerPgmlFile).mockResolvedValue(true)
    vi.mocked(loadPgmlGistFiles).mockResolvedValue([])
    vi.mocked(persistSavedPgmlSchemasToBrowserStorage).mockReturnValue(true)
    vi.mocked(persistPgmlGistConnectionMetadata).mockReturnValue(true)
    vi.mocked(savePgmlGistFile).mockResolvedValue({
      filename: 'gist-backed.pgml',
      gistId: 'gist-1',
      size: 38,
      text: 'Table public.gist_backed {\n  id uuid [pk]\n}',
      updatedAt: '2026-03-21T13:00:00.000Z'
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('refreshes, persists, and deletes browser-backed schemas', () => {
    vi.mocked(readSavedPgmlSchemasFromBrowserStorage).mockReturnValueOnce([
      {
        id: 'latest-schema',
        name: 'Latest schema',
        text: 'Table public.latest {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-19T09:30:00.000Z'
      },
      {
        id: 'older-schema',
        name: 'Older schema',
        text: 'Table public.older {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-18T15:00:00.000Z'
      }
    ])

    const store = useStudioSourcesStore()

    expect(store.refreshBrowserSchemas().map(schema => schema.id)).toEqual([
      'latest-schema',
      'older-schema'
    ])

    expect(store.persistBrowserSchemas([
      {
        id: 'newer-schema',
        name: 'Newer schema',
        text: 'Table public.newer {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-20T09:30:00.000Z'
      },
      ...store.browserSchemas
    ])).toBe(true)

    expect(store.browserSchemas.map(schema => schema.id)).toEqual([
      'newer-schema',
      'latest-schema',
      'older-schema'
    ])

    expect(store.deleteBrowserSchema('latest-schema')).toBe(true)
    expect(store.browserSchemas.map(schema => schema.id)).toEqual([
      'newer-schema',
      'older-schema'
    ])
    expect(persistSavedPgmlSchemasToBrowserStorage).toHaveBeenNthCalledWith(1, [
      {
        id: 'newer-schema',
        name: 'Newer schema',
        text: 'Table public.newer {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-20T09:30:00.000Z'
      },
      {
        id: 'latest-schema',
        name: 'Latest schema',
        text: 'Table public.latest {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-19T09:30:00.000Z'
      },
      {
        id: 'older-schema',
        name: 'Older schema',
        text: 'Table public.older {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-18T15:00:00.000Z'
      }
    ])
    expect(persistSavedPgmlSchemasToBrowserStorage).toHaveBeenNthCalledWith(2, [
      {
        id: 'newer-schema',
        name: 'Newer schema',
        text: 'Table public.newer {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-20T09:30:00.000Z'
      },
      {
        id: 'older-schema',
        name: 'Older schema',
        text: 'Table public.older {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-18T15:00:00.000Z'
      }
    ])
  })

  it('creates a browser-backed schema entry with a normalized name', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-21T13:00:00.000Z'))

    const store = useStudioSourcesStore()
    const createdSchema = store.createBrowserSchema({
      name: '  Imported schema  ',
      text: 'Table public.imported {\n  id uuid [pk]\n}'
    })

    expect(createdSchema).not.toBeNull()
    expect(createdSchema?.name).toBe('Imported schema')
    expect(createdSchema?.text).toContain('Table public.imported')
    expect(createdSchema?.updatedAt).toBe('2026-03-21T13:00:00.000Z')
    expect(store.browserSchemas).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: createdSchema?.id,
        name: 'Imported schema'
      })
    ]))
    expect(persistSavedPgmlSchemasToBrowserStorage).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: createdSchema?.id,
        name: 'Imported schema',
        text: 'Table public.imported {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-21T13:00:00.000Z'
      })
    ]))

    vi.useRealTimers()
  })

  it('blocks browser schema writes when the active source is not browser-backed', () => {
    const sessionStore = useStudioSessionStore()
    const store = useStudioSourcesStore()

    sessionStore.currentSourceKind = 'gist'

    expect(store.persistBrowserSchemas([
      {
        id: 'leaked-schema',
        name: 'Leaked schema',
        text: 'Table public.leaked {\n  id uuid [pk]\n}',
        updatedAt: '2026-03-21T13:00:00.000Z'
      }
    ])).toBe(false)
    expect(store.createBrowserSchema({
      name: 'Leaked schema',
      text: 'Table public.leaked {\n  id uuid [pk]\n}'
    })).toBeNull()
    expect(store.browserSchemas).toEqual([])
    expect(persistSavedPgmlSchemasToBrowserStorage).not.toHaveBeenCalled()
  })

  it('saves Gist files without touching browser schema storage or local metadata', async () => {
    const sessionStore = useStudioSessionStore()
    const store = useStudioSourcesStore()

    expect(await store.connectGithubGist({
      accountLabel: 'Omar',
      gistId: 'gist-1',
      token: 'gist-token'
    })).toBe(true)
    expect(persistPgmlGistConnectionMetadata).toHaveBeenCalledWith({
      accountLabel: 'Omar',
      gistId: 'gist-1',
      lastConnectedAt: expect.any(String),
      selectedFilename: null
    })
    expect(JSON.stringify(vi.mocked(persistPgmlGistConnectionMetadata).mock.calls)).not.toContain('gist-token')

    vi.mocked(persistPgmlGistConnectionMetadata).mockClear()
    vi.mocked(persistSavedPgmlSchemasToBrowserStorage).mockClear()
    sessionStore.currentSourceKind = 'gist'

    await expect(store.saveGithubGistPgmlFile({
      filename: 'gist-backed.pgml',
      text: 'Table public.gist_backed {\n  id uuid [pk]\n}'
    })).resolves.toEqual(expect.objectContaining({
      filename: 'gist-backed.pgml',
      gistId: 'gist-1'
    }))

    expect(savePgmlGistFile).toHaveBeenCalledWith({
      filename: 'gist-backed.pgml',
      gistId: 'gist-1',
      text: 'Table public.gist_backed {\n  id uuid [pk]\n}',
      token: 'gist-token'
    })
    expect(persistSavedPgmlSchemasToBrowserStorage).not.toHaveBeenCalled()
    expect(persistPgmlGistConnectionMetadata).not.toHaveBeenCalled()
    expect(store.browserSchemas).toEqual([])
  })

  it('refreshes the recent computer file inventory', async () => {
    vi.mocked(listRecentComputerPgmlFiles).mockResolvedValueOnce([{
      id: 'recent-file-1',
      name: 'team-schema',
      updatedAt: '2026-03-21T13:00:00.000Z'
    }])

    const store = useStudioSourcesStore()
    const recentFiles = await store.refreshRecentComputerFiles()

    expect(listRecentComputerPgmlFiles).toHaveBeenCalledTimes(1)
    expect(recentFiles).toEqual([{
      id: 'recent-file-1',
      name: 'team-schema',
      updatedAt: '2026-03-21T13:00:00.000Z'
    }])
    expect(store.recentComputerFiles).toEqual(recentFiles)
    expect(store.recentComputerFilesError).toBeNull()
  })

  it('deletes a recent computer file from the shared inventory', async () => {
    vi.mocked(listRecentComputerPgmlFiles).mockResolvedValueOnce([{
      id: 'recent-file-1',
      name: 'team-schema',
      updatedAt: '2026-03-21T13:00:00.000Z'
    }])

    const store = useStudioSourcesStore()

    await store.refreshRecentComputerFiles()

    await expect(store.deleteRecentComputerFile('recent-file-1')).resolves.toBe(true)
    expect(deleteRecentComputerPgmlFile).toHaveBeenCalledWith('recent-file-1')
    expect(store.recentComputerFiles).toEqual([])
    expect(store.recentComputerFilesError).toBeNull()
  })
})
