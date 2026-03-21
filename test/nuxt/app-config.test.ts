import { describe, expect, it } from 'vitest'

import appConfig from '../../app/app.config'

describe('app config', () => {
  it('keeps the shared Nuxt UI color palette explicit', () => {
    expect(appConfig.ui?.colors).toEqual({
      neutral: 'slate',
      primary: 'amber'
    })
  })
})
