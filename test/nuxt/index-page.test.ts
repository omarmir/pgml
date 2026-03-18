import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import IndexPage from '../../app/pages/index.vue'

describe('Landing page', () => {
  it('keeps the hero quick start preview focused on the function and trigger snippet', async () => {
    const wrapper = await mountSuspended(IndexPage)
    const heroQuickStart = wrapper.get('[data-testid="hero-quick-start"]')
    const quickStartExample = wrapper.get('[data-testid="quick-start-example"]')

    expect(heroQuickStart.text()).toContain('Function register_entity(entity_kind text) returns trigger [replace]')
    expect(heroQuickStart.text()).toContain('Trigger trg_register_fundingopportunity on public.funding_opportunity_profile')
    expect(heroQuickStart.text()).not.toContain('TableGroup Programs')
    expect(heroQuickStart.text()).not.toContain('Sequence common_entity_id_seq')

    expect(quickStartExample.text()).toContain('TableGroup Programs')
    expect(quickStartExample.text()).toContain('Sequence common_entity_id_seq')
  })
})
