import { describe, expect, it } from 'vitest'

import {
  authorizeStudioLaunchAccess,
  buildBrowserStudioExampleQuery,
  buildBrowserStudioNewQuery,
  buildBrowserStudioSavedQuery,
  clearStudioLaunchAccess,
  buildFileStudioRecentQuery,
  buildGistStudioFileQuery,
  consumePreloadedFileStudioLaunch,
  getBrowserStudioLaunchRequestKey,
  getStudioLaunchRequestKey,
  hasStudioLaunchAccess,
  primePreloadedFileStudioLaunch,
  parseStudioLaunchQuery,
  parseBrowserStudioLaunchQuery
} from '../../app/utils/studio-launch'

describe('studio launch utilities', () => {
  it('builds explicit query payloads for the browser-backed launch paths', () => {
    expect(buildBrowserStudioNewQuery()).toEqual({
      launch: 'new',
      source: 'browser'
    })
    expect(buildBrowserStudioExampleQuery()).toEqual({
      launch: 'example',
      source: 'browser'
    })
    expect(buildBrowserStudioSavedQuery('schema-1')).toEqual({
      launch: 'saved',
      schema: 'schema-1',
      source: 'browser'
    })
    expect(buildFileStudioRecentQuery('recent-file-1')).toEqual({
      file: 'recent-file-1',
      launch: 'recent',
      source: 'file'
    })
    expect(buildGistStudioFileQuery({
      filename: 'team.pgml',
      gistId: 'gist-1'
    })).toEqual({
      file: 'team.pgml',
      gist: 'gist-1',
      launch: 'file',
      source: 'gist'
    })
  })

  it('parses only the supported browser-backed launch queries', () => {
    expect(parseBrowserStudioLaunchQuery({
      launch: 'new',
      source: 'browser'
    })).toEqual({
      launch: 'new',
      source: 'browser'
    })
    expect(parseBrowserStudioLaunchQuery({
      launch: 'example',
      source: ['file', 'browser']
    })).toBeNull()
    expect(parseBrowserStudioLaunchQuery({
      launch: 'saved',
      schema: 'existing-schema',
      source: 'browser'
    })).toEqual({
      launch: 'saved',
      schemaId: 'existing-schema',
      source: 'browser'
    })
    expect(parseBrowserStudioLaunchQuery({
      launch: 'saved',
      schema: '',
      source: 'browser'
    })).toBeNull()
    expect(parseBrowserStudioLaunchQuery({
      launch: 'example',
      source: 'file'
    })).toBeNull()
    expect(parseStudioLaunchQuery({
      file: 'recent-file-1',
      launch: 'recent',
      source: 'file'
    })).toEqual({
      launch: 'recent',
      recentFileId: 'recent-file-1',
      source: 'file'
    })
    expect(parseStudioLaunchQuery({
      file: '',
      launch: 'recent',
      source: 'file'
    })).toBeNull()
    expect(parseStudioLaunchQuery({
      file: 'team.pgml',
      gist: 'gist-1',
      launch: 'file',
      source: 'gist'
    })).toEqual({
      filename: 'team.pgml',
      gistId: 'gist-1',
      launch: 'file',
      source: 'gist'
    })
    expect(parseStudioLaunchQuery({
      file: '',
      gist: 'gist-1',
      launch: 'file',
      source: 'gist'
    })).toBeNull()
  })

  it('serializes launch requests into stable keys', () => {
    expect(getBrowserStudioLaunchRequestKey({
      launch: 'new',
      source: 'browser'
    })).toBe('browser:new')
    expect(getBrowserStudioLaunchRequestKey({
      launch: 'example',
      source: 'browser'
    })).toBe('browser:example')
    expect(getBrowserStudioLaunchRequestKey({
      launch: 'saved',
      schemaId: 'existing-schema',
      source: 'browser'
    })).toBe('browser:saved:existing-schema')
    expect(getStudioLaunchRequestKey({
      launch: 'recent',
      recentFileId: 'recent-file-1',
      source: 'file'
    })).toBe('file:recent:recent-file-1')
    expect(getStudioLaunchRequestKey({
      filename: 'team.pgml',
      gistId: 'gist-1',
      launch: 'file',
      source: 'gist'
    })).toBe('gist:file:gist-1:team.pgml')
  })

  it('stores and consumes a preloaded file launch payload for the matching request', () => {
    const originalSessionStorage = globalThis.sessionStorage
    const values = new Map<string, string>()
    const mockSessionStorage = {
      getItem: (key: string) => {
        return values.has(key) ? values.get(key)! : null
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
      setItem: (key: string, value: string) => {
        values.set(key, value)
      }
    }

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: mockSessionStorage
    })

    const request = {
      launch: 'recent',
      recentFileId: 'recent-file-1',
      source: 'file'
    } as const

    primePreloadedFileStudioLaunch(request, {
      entry: {
        id: 'recent-file-1',
        name: 'team-schema',
        updatedAt: '2026-03-21T13:00:00.000Z'
      },
      text: 'Table public.team {\n  id uuid [pk]\n}'
    })

    expect(consumePreloadedFileStudioLaunch({
      launch: 'recent',
      recentFileId: 'different-file',
      source: 'file'
    })).toBeNull()
    expect(consumePreloadedFileStudioLaunch(request)).toEqual({
      entry: {
        id: 'recent-file-1',
        name: 'team-schema',
        updatedAt: '2026-03-21T13:00:00.000Z'
      },
      text: 'Table public.team {\n  id uuid [pk]\n}'
    })
    expect(consumePreloadedFileStudioLaunch(request)).toBeNull()

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage
    })
  })

  it('tracks whether the current tab is authorized to enter the studio route', () => {
    const originalSessionStorage = globalThis.sessionStorage
    const values = new Map<string, string>()
    const mockSessionStorage = {
      getItem: (key: string) => {
        return values.has(key) ? values.get(key)! : null
      },
      removeItem: (key: string) => {
        values.delete(key)
      },
      setItem: (key: string, value: string) => {
        values.set(key, value)
      }
    }

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: mockSessionStorage
    })

    expect(hasStudioLaunchAccess()).toBe(false)
    expect(authorizeStudioLaunchAccess()).toBe(true)
    expect(hasStudioLaunchAccess()).toBe(true)
    expect(clearStudioLaunchAccess()).toBe(true)
    expect(hasStudioLaunchAccess()).toBe(false)

    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage
    })
  })
})
