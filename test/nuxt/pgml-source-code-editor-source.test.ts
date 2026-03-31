import { describe, expect, it } from 'vitest'

import { readSourceFile } from './source-test-utils'

describe('PgmlSourceCodeEditor source', () => {
  it('supports buffered commits, blur flushes, and external diagnostics', () => {
    const file = readSourceFile('app/components/pgml/PgmlSourceCodeEditor.vue')
    const codeMirrorFile = readSourceFile('app/utils/pgml-codemirror.ts')

    expect(file).toContain('commitDebounceMs = 0')
    expect(file).toContain('const completionAnalysis: ShallowRef<PgmlDocumentAnalysis | null> = shallowRef(null)')
    expect(file).toContain('const diagnosticsCompartment = new Compartment()')
    expect(file).toContain('const flushPendingChanges = async () => {')
    expect(file).toContain('const hasPendingChanges = () => {')
    expect(file).toContain('const scheduleCompletionAnalysis = (options: {')
    expect(file).toContain('EditorView.domEventHandlers({')
    expect(file).toContain('blur: () => {')
    expect(file).toContain('scheduleCompletionAnalysis()')
    expect(file).toContain('queueValueCommit()')
    expect(file).toContain('diagnosticsCompartment.reconfigure(buildDiagnosticsExtensions())')
    expect(file).toContain('defineExpose({')
    expect(codeMirrorFile).toContain('activateCompletionOnTyping?: boolean')
    expect(codeMirrorFile).toContain('externalDiagnostics?: PgmlLanguageDiagnostic[] | null')
    expect(codeMirrorFile).toContain('getCompletionAnalysis?: (() => PgmlDocumentAnalysis | null) | null')
    expect(codeMirrorFile).toContain('linterDelayMs?: number')
    expect(codeMirrorFile).toContain('maxSynchronousCompletionDocLength?: number')
    expect(codeMirrorFile).toContain('activateOnTyping: activateCompletionOnTyping')
    expect(codeMirrorFile).toContain('createPgmlCodeMirrorDiagnosticsExtensions')
    expect(codeMirrorFile).toContain('override: [createPgmlCompletionSource({')
  })
})
