import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { useStudioShellStore } from '../../app/stores/studio-shell'

describe('studio shell store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stores and clears header action state', () => {
    const store = useStudioShellStore()

    store.setHeaderActions({
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

    store.clearHeaderActions()

    expect(store.isHeaderLoading).toBe(false)
    expect(store.headerMenus).toEqual([])
  })

  it('stores and clears schema status state', () => {
    const store = useStudioShellStore()

    store.setSchemaStatus({
      detail: 'Saved to local storage',
      name: 'Example schema',
      saveState: 'saved',
      visible: true
    })

    expect(store.schemaStatusDetail).toBe('Saved to local storage')
    expect(store.schemaStatusName).toBe('Example schema')
    expect(store.schemaStatusSaveState).toBe('saved')
    expect(store.schemaStatusVisible).toBe(true)

    store.clearSchemaStatus()

    expect(store.schemaStatusDetail).toBe('')
    expect(store.schemaStatusName).toBe('')
    expect(store.schemaStatusSaveState).toBe('pending')
    expect(store.schemaStatusVisible).toBe(false)
  })
})
