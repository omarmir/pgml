import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent, h } from 'vue'
import { describe, expect, it } from 'vitest'

import AppRoot from '../../app/app.vue'
import { useStudioTheme } from '../../app/composables/useStudioTheme'

describe('studio theme persistence', () => {
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
