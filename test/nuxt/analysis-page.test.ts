import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('analysis page source', () => {
  it('reuses the shared studio workspace component in analysis mode', () => {
    const file = readSourceFile('app/pages/analysis.vue')

    expect(file).toContain('import StudioWorkspacePage from \'~/components/studio/StudioWorkspacePage.vue\'')
    expect(file).toContain('<StudioWorkspacePage workspace-mode="analysis" />')
    expect(file).toContain('middleware: \'require-studio-launch\'')
    expect(file).not.toContain('StudioAnalysisWorkspacePage')
  })
})
