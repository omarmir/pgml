import { describe, expect, it } from 'vitest'

import { readSourceFile } from './source-test-utils'

describe('usePgmlStudioVersionHistory source', () => {
  it('keeps mutable document structure separate from the live workspace source', () => {
    const file = readSourceFile('app/composables/usePgmlStudioVersionHistory.ts')

    expect(file).toContain('const sharedVersionHistoryState = useStudioWorkspaceVersionHistoryState({')
    expect(file).toContain('const documentState = sharedVersionHistoryState.document')
    expect(file).toContain('const document: ComputedRef<PgmlVersionSetDocument> = computed(() => {')
    expect(file).toContain('return buildWorkspaceSyncedDocument(documentState.value, input.source.value)')
    expect(file).toContain('const workspaceDirty = computed(() => isPgmlWorkspaceDirty(document.value))')
    expect(file).toContain('const versions = computed(() => documentState.value.versions)')
    expect(file).not.toContain('watch(input.source, () => {')
  })
})
