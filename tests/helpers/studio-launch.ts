import type { Page } from '@playwright/test'

const studioLaunchAccessStorageKey = 'pgml-studio-launch-access-v1'

export const authorizeStudioLaunchAccess = async (page: Page) => {
  await page.addInitScript((storageKey: string) => {
    window.sessionStorage.setItem(storageKey, 'granted')
  }, studioLaunchAccessStorageKey)
}
