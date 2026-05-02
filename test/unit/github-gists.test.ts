import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildUniquePgmlGistFilename,
  createPgmlGistConnectionMetadata,
  githubFineGrainedTokenUrl,
  listPgmlGistFilesFromResponse
} from '../../app/utils/github-gists'

describe('GitHub Gist utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-02T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
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
})
