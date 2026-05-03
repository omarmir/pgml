import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { $fetch } from 'ofetch'
import {
  buildUniquePgmlGistFilename,
  createPgmlGistConnectionMetadata,
  githubFineGrainedTokenUrl,
  listPgmlGistFilesFromResponse,
  loadPgmlGistFile
} from '../../app/utils/github-gists'

vi.mock('ofetch', () => {
  return {
    $fetch: vi.fn()
  }
})

describe('GitHub Gist utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('builds Gist connection metadata without storing token material', () => {
    expect(createPgmlGistConnectionMetadata({
      accountLabel: '  team-user  ',
      gistId: '  abc123  ',
      selectedFilename: 'schema.pgml'
    })).toEqual({
      accountLabel: 'team-user',
      gistId: 'abc123',
      lastConnectedAt: '2026-04-02T12:00:00.000Z',
      selectedFilename: 'schema.pgml'
    })
  })

  it('filters Gist API files down to PGML files', () => {
    expect(listPgmlGistFilesFromResponse({
      files: {
        'notes.txt': {
          content: 'ignore',
          filename: 'notes.txt'
        },
        'gistfile1.txt': {
          content: 'VersionSet "egcs" {\n  Workspace {\n  }\n}',
          filename: 'gistfile1.txt'
        },
        'team.pgml': {
          content: 'Table public.team {\n  id uuid [pk]\n}',
          filename: 'team.pgml'
        },
        'z.pgml': {
          content: '',
          filename: 'z.pgml'
        }
      },
      id: 'gist-1',
      updated_at: '2026-04-02T12:30:00.000Z'
    }, 'fallback-gist')).toEqual([
      {
        filename: 'gistfile1.txt',
        gistId: 'fallback-gist',
        size: 39,
        updatedAt: '2026-04-02T12:30:00.000Z'
      },
      {
        filename: 'team.pgml',
        gistId: 'fallback-gist',
        size: 36,
        updatedAt: '2026-04-02T12:30:00.000Z'
      },
      {
        filename: 'z.pgml',
        gistId: 'fallback-gist',
        size: 0,
        updatedAt: '2026-04-02T12:30:00.000Z'
      }
    ])
  })

  it('creates collision-free PGML filenames and links to Gist token creation', () => {
    expect(buildUniquePgmlGistFilename({
      existingFilenames: [],
      name: 'Team Schema'
    })).toBe('team-schema.pgml')
    expect(buildUniquePgmlGistFilename({
      existingFilenames: ['team-schema.pgml', 'team-schema-2.pgml'],
      name: 'Team Schema'
    })).toBe('team-schema-3.pgml')
    expect(githubFineGrainedTokenUrl).toContain('gists=write')
  })

  it('loads full Gist file content from raw_url when the API content is truncated', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        text: async () => 'Table public.large {\n  id uuid [pk]\n}'
      }
    })

    vi.stubGlobal('fetch', fetchMock)
    vi.mocked($fetch)
      .mockResolvedValueOnce({
        files: {
          'large.pgml': {
            content: 'Table public.large {',
            filename: 'large.pgml',
            raw_url: 'https://gist.githubusercontent.com/raw/large.pgml',
            truncated: true
          }
        },
        id: 'gist-1',
        updated_at: '2026-04-02T12:30:00.000Z'
      })
      .mockResolvedValueOnce('Table public.large {\n  id uuid [pk]\n}')

    await expect(loadPgmlGistFile({
      filename: 'large.pgml',
      gistId: 'gist-1',
      token: 'gist-token'
    })).resolves.toEqual({
      filename: 'large.pgml',
      gistId: 'gist-1',
      size: 37,
      text: 'Table public.large {\n  id uuid [pk]\n}',
      updatedAt: '2026-04-02T12:30:00.000Z'
    })
    expect(fetchMock).toHaveBeenCalledWith('https://gist.githubusercontent.com/raw/large.pgml', expect.objectContaining({
      headers: expect.objectContaining({
        authorization: 'Bearer gist-token'
      })
    }))
  })
})
