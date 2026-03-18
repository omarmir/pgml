import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'

import AppRoot from '../../app/app.vue'
import { useStudioTheme } from '../../app/composables/useStudioTheme'

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

describe('studio theme persistence', () => {
  beforeEach(() => {
    installLocalStorage()
    document.documentElement.removeAttribute('data-studio-theme')

    for (const token of Array.from(document.documentElement.style)) {
      document.documentElement.style.removeProperty(token)
    }

    useStudioTheme().studioTheme.value = 'dark'
  })

  it('loads the stored theme choice and writes updates back to storage', async () => {
    window.localStorage.clear()
    window.localStorage.setItem('pgml-studio-theme', 'light')

    const wrapper = await mountSuspended(defineComponent({
      setup() {
        const { studioTheme, toggleStudioTheme } = useStudioTheme()

        return () => {
          return h('button', {
            'data-testid': 'theme-toggle',
            'type': 'button',
            'onClick': toggleStudioTheme
          }, studioTheme.value)
        }
      }
    }))

    expect(wrapper.get('[data-testid="theme-toggle"]').text()).toBe('light')
    expect(document.documentElement.dataset.studioTheme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--studio-shell-bg')).toBe('#f4f1ea')

    await wrapper.get('[data-testid="theme-toggle"]').trigger('click')

    expect(wrapper.get('[data-testid="theme-toggle"]').text()).toBe('dark')
    expect(window.localStorage.getItem('pgml-studio-theme')).toBe('dark')
    expect(document.documentElement.dataset.studioTheme).toBe('dark')
    expect(document.documentElement.style.getPropertyValue('--studio-shell-bg')).toBe('#0a151d')
  })

  it('keeps theme tokens on the document instead of duplicating them on the app shell', async () => {
    window.localStorage.clear()
    window.localStorage.setItem('pgml-studio-theme', 'light')
    useStudioTheme().studioTheme.value = 'light'

    const wrapper = await mountSuspended(AppRoot)

    expect(document.documentElement.dataset.studioTheme).toBe('light')
    expect(document.documentElement.style.getPropertyValue('--studio-shell-bg')).toBe('#f4f1ea')
    expect(wrapper.attributes('style') || '').not.toContain('--studio-shell-bg')
  })
})
