import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Source launch card source', () => {
  it('renders shared operations, SQL dump copy, and emits per-item actions from props', () => {
    const file = readSourceFile('app/components/app/AppSourceLaunchCard.vue')

    expect(file).toContain('defineProps<{')
    expect(file).toContain('defineEmits<{')
    expect(file).toContain('operations: SourceLaunchCardOperation[]')
    expect(file).toContain('SQL dump')
    expect(file).toContain('emit(\'item-action\'')
    expect(file).toContain('v-for="operation in operations"')
  })
})
