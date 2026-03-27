import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram GPU shell entities source', () => {
  it('restores the rich entities browser in the GPU shell', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('const entitySearchQuery: Ref<string> = ref(\'\')')
    expect(shellFile).toContain('const buildBrowserTableItem = (table: PgmlSchemaModel[\'tables\'][number]): EntityBrowserItem => {')
    expect(shellFile).toContain('const filteredGroupedBrowserItems = computed(() => {')
    expect(shellFile).toContain('const toggleBrowserItemVisibility = (item: EntityBrowserItem) => {')
    expect(shellFile).toContain('const focusBrowserItemSource = (item: EntityBrowserItem) => {')
    expect(shellFile).toContain('data-entity-search="true"')
    expect(shellFile).toContain('data-browser-entity-row="groupItem.id"')
    expect(shellFile).toContain('data-browser-visibility-toggle="tableItem.id"')
    expect(shellFile).toContain('Standalone Objects')
    expect(shellFile).toContain('No entities match the current search.')
    expect(shellFile).toContain('.pgml-browser-search-match-row')
    expect(shellFile).toContain('.pgml-browser-search-match-text')
  })
})
