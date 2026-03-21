import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppShell from '../../app/app.vue'

describe('App shell runtime', () => {
  it('renders the shared shell chrome for the default spec route', async () => {
    const wrapper = await mountSuspended(AppShell)

    expect(wrapper.text()).toContain('PGML')
    expect(wrapper.text()).toContain('Postgres in markup')
    expect(wrapper.text()).toContain('Spec')
    expect(wrapper.text()).toContain('Diagram Studio')
    expect(wrapper.text()).toContain('Open Studio')
    expect(wrapper.text()).toContain('PGML extends DBML toward Postgres-native schema design and visual documentation.')
  })
})
