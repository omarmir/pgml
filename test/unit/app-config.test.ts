import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('app config', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    vi.stubGlobal('defineAppConfig', (value: unknown) => value)
  })

  it('keeps the shared Nuxt UI color palette explicit', async () => {
    const appConfigModule = await import('../../app/app.config')

    expect(appConfigModule.default).toEqual({
      ui: {
        colors: {
          neutral: 'slate',
          primary: 'amber'
        }
      }
    })
  })
})
