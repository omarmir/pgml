import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useStudioShellStore } from '../../app/stores/studio-shell'

describe('studio shell store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores and clears header action state', () => {
    const store = useStudioShellStore()
    const publisher = store.acquireWorkspaceChrome()

    publisher.setHeaderActions({
      isLoading: true,
      menus: [{
        icon: 'i-lucide-file-stack',
        id: 'schema',
        items: [[{
          label: 'Save schema'
        }]],
        label: 'Schema'
      }]
    })

    expect(store.isHeaderLoading).toBe(true)
    expect(store.headerMenus[0]?.label).toBe('Schema')
    expect(store.headerMenus[0]?.items[0]?.[0]?.label).toBe('Save schema')

    publisher.clearHeaderActions()

    expect(store.isHeaderLoading).toBe(false)
    expect(store.headerMenus).toEqual([])
  })

  it('stores and clears schema status state', () => {
    const store = useStudioShellStore()
    const publisher = store.acquireWorkspaceChrome()
    const onSelect = vi.fn()

    publisher.setSchemaStatus({
      action: {
        disabled: false,
        icon: 'i-lucide-save',
        label: 'Save',
        loading: false,
        onSelect
      },
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    expect(store.schemaStatusDetail).toBe('Saved to local storage')
    expect(store.schemaStatusName).toBe('Example schema')
    expect(store.schemaStatusSaveState).toBe('saved')
    expect(store.schemaStatusVisible).toBe(true)
    expect(store.schemaStatusAction?.label).toBe('Save')

    store.schemaStatusAction?.onSelect()

    expect(onSelect).toHaveBeenCalledOnce()

    publisher.clearSchemaStatus()

    expect(store.schemaStatusAction).toBe(null)
    expect(store.schemaStatusDetail).toBe('')
    expect(store.schemaStatusName).toBe('')
    expect(store.schemaStatusSaveState).toBe('pending')
    expect(store.schemaStatusVisible).toBe(false)
  })
})

it('only the current workspace lease publishes or clears chrome, including late old release', () => {
  setActivePinia(createPinia())
  const store = useStudioShellStore()
  const old = store.acquireWorkspaceChrome()
  old.setHeaderActions({ isLoading: true, menus: [{ id: 'old', label: 'Old', icon: '', items: [] }] })
  const current = store.acquireWorkspaceChrome()
  current.setHeaderActions({ isLoading: false, menus: [{ id: 'current', label: 'Current', icon: '', items: [] }] })
  current.setSchemaStatus({ action: null, detail: 'Current saved', name: 'Current', saveState: 'saved', visible: true })
  old.setHeaderActions({ isLoading: true, menus: [] })
  old.setSchemaStatus({ action: null, detail: 'Old failed', name: 'Old', saveState: 'error', visible: true })
  old.clearHeaderActions()
  old.clearSchemaStatus()
  old.release()
  expect(store.headerMenus[0]?.id).toBe('current')
  expect(store.schemaStatusName).toBe('Current')
  expect(store.schemaStatusSaveState).toBe('saved')
  current.release()
  expect(store.headerMenus).toEqual([])
  expect(store.schemaStatusVisible).toBe(false)
  current.setHeaderActions({ isLoading: true, menus: [] })
  expect(store.isHeaderLoading).toBe(false)
})
