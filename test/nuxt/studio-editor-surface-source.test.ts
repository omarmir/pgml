import { describe, expect, it } from 'vitest'

import { readSourceFile } from './source-test-utils'

describe('StudioEditorSurface source', () => {
  it('renders grouped collapsible diagnostics with per-line focus controls', () => {
    const file = readSourceFile('app/components/studio/StudioEditorSurface.vue')

    expect(file).toContain('groupPgmlDiagnostics(sourceDiagnostics)')
    expect(file).toContain(':activate-completion-on-typing="activateCompletionOnTyping"')
    expect(file).toContain(':commit-debounce-ms="commitDebounceMs"')
    expect(file).toContain(':diagnostics-delay-ms="diagnosticsDelayMs"')
    expect(file).toContain(':external-diagnostics="sourceDiagnostics"')
    expect(file).toContain('data-pgml-diagnostic-group="true"')
    expect(file).toContain('data-pgml-diagnostic-group-summary="true"')
    expect(file).toContain('<details')
    expect(file).toContain('v-for="entry in group.lineEntries"')
    expect(file).toContain('@click="focusDiagnostic(entry.diagnostic)"')
  })
})
