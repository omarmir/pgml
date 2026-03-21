import { mountSuspended } from '@nuxt/test-utils/runtime'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'

import StudioModalFrame from '../../app/components/studio/StudioModalFrame.vue'

describe('StudioModalFrame', () => {
  it('renders shared title, description, body, and footer content', async () => {
    const wrapper = await mountSuspended(StudioModalFrame, {
      props: {
        description: 'Shared studio modal surface.',
        open: true,
        surfaceId: 'test-modal',
        title: 'Test modal'
      },
      slots: {
        default: () => 'Body content',
        footer: () => 'Footer actions'
      }
    })

    expect(document.body.innerHTML).toContain('data-studio-modal-surface="test-modal"')
    expect(document.body.textContent || '').toContain('Test modal')
    expect(document.body.textContent || '').toContain('Shared studio modal surface.')
    expect(document.body.textContent || '').toContain('Body content')
    expect(document.body.textContent || '').toContain('Footer actions')

    const closeButton = document.body.querySelector('[aria-label="Close"]')

    if (!(closeButton instanceof HTMLButtonElement)) {
      throw new Error('Expected the shared close button to render.')
    }

    closeButton.click()
    await nextTick()

    expect(wrapper.emitted('update:open')?.[0]).toEqual([false])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})
