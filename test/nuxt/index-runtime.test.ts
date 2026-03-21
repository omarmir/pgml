import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import IndexPage from '../../app/pages/index.vue'

describe('Index page runtime', () => {
  it('renders the hero, outline, and documentation examples', async () => {
    const wrapper = await mountSuspended(IndexPage)

    expect(wrapper.text()).toContain('Write Postgres as a readable schema document instead of raw SQL.')
    expect(wrapper.get('[data-testid="hero-quick-start"]').text()).toContain('TableGroup Commerce')
    expect(wrapper.text()).toContain('On This Page')
    expect(wrapper.text()).toContain('Why PGML')
    expect(wrapper.text()).toContain('DBML Compatibility')
    expect(wrapper.text()).toContain('Documentation')
    expect(wrapper.text()).toContain('Layout properties')
  })
})
