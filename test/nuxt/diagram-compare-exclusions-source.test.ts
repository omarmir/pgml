import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram compare exclusions source', () => {
  it('uses search plus a type-filter row with nested group sections, separate ungrouped tables, and additional non-column compare-entity sections in the comparison-scoped exclusion editor', () => {
    const pageFile = readSourceFile('app/components/studio/StudioWorkspacePage.vue')
    const entityKindOrderBlock = pageFile.match(/const compareExclusionEntityKindOrder: PgmlDiagramCompareEntityKind\[] = \[[\s\S]*?\]/)?.[0] || ''
    const exclusionOptionsBlock = pageFile.match(/data-compare-exclusion-options="true"[\s\S]*?data-compare-exclusion-groups-section="true"/)?.[0] || ''

    expect(pageFile).toContain('const compareExclusionsTypeFilter: Ref<CompareExclusionTypeFilterValue> = ref(\'all\')')
    expect(pageFile).toContain('const compareExclusionTypeFilterItems = computed<CompareExclusionTypeFilterItem[]>(() => {')
    expect(pageFile).toContain('const setCompareExclusionsTypeFilter = (value: CompareExclusionTypeFilterValue) => {')
    expect(pageFile).toContain('const isCompareExclusionsTypeFilterActive = (value: CompareExclusionTypeFilterValue) => {')
    expect(pageFile).toContain('data-compare-exclusion-groups-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-group-section="section.groupOption.value"')
    expect(pageFile).toContain('data-compare-exclusion-group-tables="section.groupOption.value"')
    expect(pageFile).toContain('data-compare-exclusion-ungrouped-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-entities-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-options="true"')
    expect(pageFile).toContain('data-compare-exclusions-type-filters="true"')
    expect(pageFile).toContain('data-compare-exclusions-type-filter="item.value"')
    expect(pageFile).toContain('data-compare-exclusion-entity-section="section.entityKind"')
    expect(pageFile).toContain('data-compare-exclusion-option="option.id"')
    expect(pageFile).toContain('clonePgmlCompareExclusions(activeCompareExclusions.value)')
    expect(pageFile).toContain('setCurrentCompareExclusions(compareExclusionsDraft.value)')
    expect(pageFile).toContain('const filteredCompareExclusionGroupSections = computed(() => {')
    expect(pageFile).toContain('const filteredCompareExclusionUngroupedTableOptions = computed(() => {')
    expect(pageFile).toContain('const filteredCompareExclusionEntitySections = computed(() => {')
    expect(pageFile).toContain('Filter by type')
    expect(pageFile).toContain('Select a group to exclude its full cluster, pick individual tables inside it, or exclude other comparable entities like indexes, references, types, and executables.')
    expect(pageFile).toContain('const compareExclusionChipExtraClass = [')
    expect(pageFile).toContain('const compareExclusionTypeFilterChipExtraClass = [')
    expect(exclusionOptionsBlock).not.toContain('max-h-[50vh]')
    expect(exclusionOptionsBlock).not.toContain('overflow-x-hidden')
    expect(exclusionOptionsBlock).not.toContain('overflow-y-auto')
    expect(pageFile).toContain('Groups')
    expect(pageFile).toContain('Ungrouped tables')
    expect(pageFile).toContain('Other compare entities')
    expect(entityKindOrderBlock).not.toContain('\'column\'')
    expect(pageFile.indexOf('data-compare-exclusion-groups-section="true"')).toBeLessThan(
      pageFile.indexOf('data-compare-exclusion-ungrouped-section="true"')
    )
    expect(pageFile.indexOf('data-compare-exclusion-ungrouped-section="true"')).toBeLessThan(
      pageFile.indexOf('data-compare-exclusion-entities-section="true"')
    )
  })
})
