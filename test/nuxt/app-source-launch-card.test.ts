import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Source launch card source', () => {
  it('renders shared operations, exposes the pg_dump import action, and emits shared actions from props', () => {
    const file = readSourceFile('app/components/app/AppSourceLaunchCard.vue')

    expect(file).toContain('defineProps<{')
    expect(file).toContain('defineEmits<{')
    expect(file).toContain('operations: SourceLaunchCardOperation[]')
    expect(file).toContain('sqlDumpAction?: SourceLaunchCardAction')
    expect(file).toContain('SQL dump')
    expect(file).toContain('Import a pg_dump')
    expect(file).toContain('emit(\'action\'')
    expect(file).toContain('triggerAction')
    expect(file).toContain('emitLaunchAction(sqlDumpAction)')
    expect(file).toContain('v-for="operation in operations"')
  })
})
