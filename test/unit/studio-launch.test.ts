import { describe, expect, it } from 'vitest'

import {
  buildBrowserStudioExampleQuery,
  buildBrowserStudioNewQuery,
  buildBrowserStudioSavedQuery,
  getBrowserStudioLaunchRequestKey,
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
  })
})
