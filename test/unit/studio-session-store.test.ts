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

  it('authorizes the live session when session storage is denied and revokes it explicitly', () => {
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get: () => { throw new Error('Storage denied') }
    })
    const store = useStudioSessionStore()

    expect(store.hasLaunchAccess()).toBe(false)
    expect(store.authorizeLaunchAccess()).toBe(false)
    expect(store.hasLaunchAccess()).toBe(true)
    store.resetStudioUiState()
    expect(store.hasLaunchAccess()).toBe(true)
    expect(store.clearLaunchAccess()).toBe(false)
    expect(store.hasLaunchAccess()).toBe(false)
    expect(store.hasLaunchAccess()).toBe(false)
    setActivePinia(createPinia())
    expect(useStudioSessionStore().hasLaunchAccess()).toBe(false)
  })

  it('does not restore a stale persisted grant after revocation fails to remove storage', () => {
    const store = useStudioSessionStore()
    store.authorizeLaunchAccess()
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      value: {
        getItem: () => 'granted',
        removeItem: () => { throw new Error('Storage denied') }
      }
    })

    expect(store.clearLaunchAccess()).toBe(false)
    expect(store.hasLaunchAccess()).toBe(false)
    expect(store.syncLaunchAuthorized()).toBe(false)
  })

  it('restores persisted access only when a new live session is created', () => {
    useStudioSessionStore().authorizeLaunchAccess()
    setActivePinia(createPinia())
    expect(useStudioSessionStore().hasLaunchAccess()).toBe(true)
    useStudioSessionStore().clearLaunchAccess()
    setActivePinia(createPinia())
    expect(useStudioSessionStore().hasLaunchAccess()).toBe(false)
  })

  it('keeps dialogs exclusive and ignores completion for an earlier dialog revision', () => {
    const store = useStudioSessionStore()
    store.openLoadDialog()
    store.openSchemaDialog('save', { name: 'First', targetId: null })
    const revision = store.schemaDialogRevision
    expect(store.loadDialogOpen).toBe(false)
    store.openSchemaDialog('download', { name: 'Second', targetId: null })
    store.closeSchemaDialog(revision)
    expect(store.schemaDialogOpen).toBe(true)
    expect(store.schemaDialogName).toBe('Second')
    store.updateSchemaDialogOpen(false)
    expect(store.schemaDialogName).toBeNull()
    store.openLoadDialog()
    expect(store.schemaDialogOpen).toBe(false)
    store.updateLoadDialogOpen(false)
    expect(store.loadDialogOpen).toBe(false)
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

  it('advances document context only for accepted replacement and keeps source ownership with commit', () => {
    const store = useStudioSessionStore()
    const initial = store.workspaceDocumentRevision
    const failed = store.beginWorkspaceLoad('file')
    expect(store.currentSourceKind).toBe('browser')
    expect(store.workspaceDocumentRevision).toBe(initial)
    store.cancelWorkspaceLoad(failed)
    expect(store.workspaceDocumentRevision).toBe(initial)
    const accepted = store.beginWorkspaceLoad('gist')
    store.commitWorkspaceLoad(accepted, () => store.supersedeWorkspaceDocument())
    expect(store.currentSourceKind).toBe('gist')
    expect(store.workspaceDocumentRevision).toBe(initial + 1)
    store.supersedeWorkspaceDocument()
    expect(store.workspaceDocumentRevision).toBe(initial + 2)
  })

  it('resets shared studio session ui state', () => {
    const store = useStudioSessionStore()

    store.appliedLaunchKey = 'browser:saved:example'
    store.commitWorkspaceLoad(store.beginWorkspaceLoad('file'), () => {})
    store.includeLayoutInSchema = false
    store.openLoadDialog()
    store.openSchemaDialog('download', { name: 'Schema', targetId: null })

    store.resetStudioUiState()

    expect(store.appliedLaunchKey).toBeNull()
    expect(store.currentSourceKind).toBe('browser')
    expect(store.includeLayoutInSchema).toBe(true)
    expect(store.loadDialogOpen).toBe(false)
    expect(store.schemaDialogMode).toBe('save')
    expect(store.schemaDialogOpen).toBe(false)
  })
})
