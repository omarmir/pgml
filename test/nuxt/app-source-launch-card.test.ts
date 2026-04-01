import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Source launch card source', () => {
  it('renders shared operations, exposes the import actions, and emits shared actions from props', () => {
    const file = readSourceFile('app/components/app/AppSourceLaunchCard.vue')

    expect(file).toContain('defineProps<{')
    expect(file).toContain('defineEmits<{')
    expect(file).toContain('operations: SourceLaunchCardOperation[]')
    expect(file).toContain('importActions?: SourceLaunchCardImportAction[]')
    expect(file).toContain('Imports')
    expect(file).toContain('v-for="importAction in importActions"')
    expect(file).toContain('emit(\'action\'')
    expect(file).toContain('triggerAction')
    expect(file).toContain('emitLaunchAction(importAction)')
    expect(file).toContain('v-for="operation in operations"')
  })
})
