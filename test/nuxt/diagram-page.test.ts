import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DiagramPage from '../../app/pages/diagram.vue'

vi.mock('~/components/pgml/PgmlDiagramCanvas.vue', () => {
  return {
    default: {
      emits: ['createGroup', 'createTable'],
      template: `
        <div data-testid="diagram-canvas-stub">
          <button data-testid="open-table-editor" type="button" @click="$emit('createTable', null)">Open table editor</button>
          <button data-testid="open-group-editor" type="button" @click="$emit('createGroup')">Open group editor</button>
        </div>
      `
    }
  }
})

vi.mock('~/components/pgml/PgmlSourceCodeEditor.vue', () => {
  return {
    default: {
      props: ['modelValue'],
      template: '<div data-testid="source-editor-stub">{{ modelValue }}</div>'
    }
  }
})

const installLocalStorage = () => {
  const values = new Map<string, string>()
  const localStorage = {
    clear: () => {
      values.clear()
    },
    getItem: (key: string) => {
      return values.has(key) ? values.get(key)! : null
    },
    key: (index: number) => {
      return Array.from(values.keys())[index] || null
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
    setItem: (key: string, value: string) => {
      values.set(key, value)
    }
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorage
  })

  return localStorage
}

const installDesktopViewport = () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
    writable: true
  })
}

describe('diagram page runtime', () => {
  beforeEach(() => {
    installLocalStorage().clear()
    installDesktopViewport()
  })

  it('renders the studio workspace and lets the source panel be toggled', async () => {
    const wrapper = await mountSuspended(DiagramPage)

    expect(wrapper.find('[data-testid="diagram-canvas-stub"]').exists()).toBe(true)
    expect(wrapper.get('[data-testid="source-editor-stub"]').text()).toContain('TableGroup Commerce')

    const resizeHitAreaClass = wrapper.get('[data-editor-resize-hit-area="true"]').attributes('class')
    const resizeGripClass = wrapper.get('[data-editor-resize-grip="true"]').attributes('class')

    // Keep the editor scrollbar reachable by expanding the resize target only
    // toward the canvas, not back over the editor edge.
    expect(resizeHitAreaClass).toContain('left-0')
    expect(resizeHitAreaClass).not.toContain('-translate-x-1/2')
    expect(resizeGripClass).toContain('left-0')
    expect(resizeGripClass).not.toContain('-translate-x-1/2')

    const toggle = wrapper.get('[data-editor-visibility-toggle="true"]')

    expect(toggle.text()).toContain('Hide PGML')

    await toggle.trigger('click')
    await nextTick()

    expect(wrapper.find('[data-testid="source-editor-stub"]').exists()).toBe(false)
    expect(wrapper.get('[data-editor-visibility-toggle="true"]').text()).toContain('Show PGML')

    await wrapper.get('[data-testid="open-table-editor"]').trigger('click')
    await nextTick()

    expect(document.body.textContent || '').toContain('Add table')
    expect(document.body.textContent || '').toContain('Columns')
    expect(document.body.textContent || '').toContain('Add column')
    expect(document.body.textContent || '').toContain('Reference')

    await wrapper.get('[data-testid="open-group-editor"]').trigger('click')
    await nextTick()

    expect(document.body.textContent || '').toContain('Add table group')
    expect(document.body.textContent || '').toContain('Tables in this group')
  })
})
