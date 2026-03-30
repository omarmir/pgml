import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram compare panel source', () => {
  it('renders a dedicated compare inspector and syncs it with the diagram shell', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')
    const comparePanelFile = readSourceFile('app/components/pgml/PgmlDiagramComparePanel.vue')
    const versionsPanelFile = readSourceFile('app/components/pgml/PgmlDiagramVersionsPanel.vue')

    expect(shellFile).toContain('const selectedCompareEntryId: Ref<string | null> = ref(null)')
    expect(shellFile).toContain('const isCompareDiagramActive = computed(() => {')
    expect(shellFile).toContain('const compareGhostOverlays = computed<DiagramCompareGhostOverlay[]>(() => {')
    expect(shellFile).toContain('const selectedDiagramCompareEntryIds = computed(() => {')
    expect(shellFile).toContain('const openComparator = () => {')
    expect(shellFile).toContain('data-diagram-tool-toggle="compare"')
    expect(shellFile).toContain('data-diagram-tool-toggle="versions"')
    expect(shellFile).toContain('data-diagram-tool-panel="true"')
    expect(shellFile).toContain('data-diagram-tool-panel-tab="compare"')
    expect(shellFile).toContain('data-diagram-tool-panel-tab="versions"')
    expect(shellFile).toContain('grid grid-cols-3 border-b border-[color:var(--studio-divider)]')
    expect(shellFile).toContain('<PgmlDiagramComparePanel')
    expect(shellFile).toContain('<PgmlDiagramVersionsPanel')
    expect(shellFile).toContain('data-compare-ghost-entry="overlay.entryId"')

    expect(comparePanelFile).toContain('data-diagram-compare-panel="true"')
    expect(comparePanelFile).toContain('data-compare-search="true"')
    expect(comparePanelFile).toContain('data-compare-entry="entry.id"')
    expect(comparePanelFile).toContain('data-compare-entry-detail="true"')
    expect(comparePanelFile).toContain('type PgmlCompareFilterKind = \'all\' | \'added\' | \'modified\' | \'removed\'')
    expect(comparePanelFile).toContain('const compareFilterOptions: PgmlCompareFilterOption[] = [')
    expect(comparePanelFile).toContain('v-for="option in compareFilterOptions"')
    expect(comparePanelFile).toContain('@click="clearFilters"')
    expect(comparePanelFile).toContain('label="Show on diagram"')
    expect(comparePanelFile).toContain('selectedDiagramContextIds')

    expect(versionsPanelFile).toContain('\'open-comparator\': []')
    expect(versionsPanelFile).toContain('data-version-open-comparator="true"')
    expect(versionsPanelFile).toContain('openComparatorWithPreset')
  })
})
