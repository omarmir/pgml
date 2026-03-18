import { expect, test } from '@nuxt/test-utils/playwright'

test('landing page keeps the hero preview compact and leaves the full quick start below', async ({ goto, page }) => {
  await goto('/')

  const heroQuickStart = page.locator('[data-testid="hero-quick-start"]')
  const quickStartExample = page.locator('[data-testid="quick-start-example"]')

  await expect(heroQuickStart).toBeVisible()
  await expect(heroQuickStart).toContainText('Function register_entity(entity_kind text) returns trigger [replace]')
  await expect(heroQuickStart).toContainText('Trigger trg_register_fundingopportunity on public.funding_opportunity_profile')
  await expect(heroQuickStart).not.toContainText('TableGroup Programs')
  await expect(heroQuickStart).not.toContainText('Sequence common_entity_id_seq')

  await expect(quickStartExample).toContainText('TableGroup Programs')
  await expect(quickStartExample).toContainText('Sequence common_entity_id_seq')
})
