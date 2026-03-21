import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useStudioSessionStore } from '../../app/stores/studio-session'

const installSessionStorage = () => {
  const values = new Map<string, string>()
  const sessionStorage = {
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
    value: sessionStorage
  })
}

describe('studio session store', () => {
  const originalSessionStorage = globalThis.sessionStorage

  beforeEach(() => {
    installSessionStorage()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: originalSessionStorage
    })
  })

  it('tracks whether the current tab is authorized to enter the studio', () => {
    const store = useStudioSessionStore()

    expect(store.hasLaunchAccess()).toBe(false)
    expect(store.launchAuthorized).toBe(false)

    expect(store.authorizeLaunchAccess()).toBe(true)
    expect(store.hasLaunchAccess()).toBe(true)
    expect(store.launchAuthorized).toBe(true)

    expect(store.clearLaunchAccess()).toBe(true)
    expect(store.hasLaunchAccess()).toBe(false)
    expect(store.launchAuthorized).toBe(false)
  })

  it('stores and consumes a preloaded file launch payload once', () => {
    const store = useStudioSessionStore()
    const request = {
      launch: 'recent',
      recentFileId: 'recent-file-1',
      source: 'file'
    } as const

    store.primePreloadedFileLaunch(request, {
      entry: {
        id: 'recent-file-1',
        name: 'team-schema',
        updatedAt: '2026-03-21T13:00:00.000Z'
      },
      text: 'Table public.team {\n  id uuid [pk]\n}'
    })

    expect(store.consumePreloadedFileLaunch({
      launch: 'recent',
      recentFileId: 'different-file',
      source: 'file'
    })).toBeNull()

    expect(store.consumePreloadedFileLaunch(request)).toEqual({
      entry: {
        id: 'recent-file-1',
        name: 'team-schema',
        updatedAt: '2026-03-21T13:00:00.000Z'
      },
      text: 'Table public.team {\n  id uuid [pk]\n}'
    })
    expect(store.consumePreloadedFileLaunch(request)).toBeNull()
  })

  it('resets shared studio session ui state', () => {
    const store = useStudioSessionStore()

    store.appliedLaunchKey = 'browser:saved:example'
    store.currentSourceKind = 'file'
    store.includeLayoutInSchema = false
    store.openLoadDialog()
    store.openSchemaDialog('download')

    store.resetStudioUiState()

    expect(store.appliedLaunchKey).toBeNull()
    expect(store.currentSourceKind).toBe('browser')
    expect(store.includeLayoutInSchema).toBe(true)
    expect(store.loadDialogOpen).toBe(false)
    expect(store.schemaDialogMode).toBe('save')
    expect(store.schemaDialogOpen).toBe(false)
  })
})
