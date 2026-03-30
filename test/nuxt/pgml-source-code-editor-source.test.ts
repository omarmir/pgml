import { describe, expect, it } from 'vitest'

import { readSourceFile } from './source-test-utils'

describe('PgmlSourceCodeEditor source', () => {
  it('supports buffered commits, blur flushes, and external diagnostics', () => {
    const file = readSourceFile('app/components/pgml/PgmlSourceCodeEditor.vue')
    const codeMirrorFile = readSourceFile('app/utils/pgml-codemirror.ts')

    expect(file).toContain('commitDebounceMs = 0')
    expect(file).toContain('const flushPendingChanges = async () => {')
    expect(file).toContain('const hasPendingChanges = () => {')
    expect(file).toContain('EditorView.domEventHandlers({')
    expect(file).toContain('blur: () => {')
    expect(file).toContain('queueValueCommit(update.state.doc.toString())')
    expect(file).toContain('defineExpose({')
    expect(codeMirrorFile).toContain('activateCompletionOnTyping?: boolean')
    expect(codeMirrorFile).toContain('externalDiagnostics?: PgmlLanguageDiagnostic[] | null')
    expect(codeMirrorFile).toContain('linterDelayMs?: number')
    expect(codeMirrorFile).toContain('activateOnTyping: activateCompletionOnTyping')
  })
})
