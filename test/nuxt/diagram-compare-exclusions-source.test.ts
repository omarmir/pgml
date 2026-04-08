import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram compare exclusions source', () => {
  it('uses nested group sections, separate ungrouped tables, and additional compare-entity sections in the comparison-scoped exclusion editor', () => {
    const pageFile = readSourceFile('app/pages/diagram.vue')

    expect(pageFile).toContain('data-compare-exclusion-groups-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-group-section="section.groupOption.value"')
    expect(pageFile).toContain('data-compare-exclusion-group-tables="section.groupOption.value"')
    expect(pageFile).toContain('data-compare-exclusion-ungrouped-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-entities-section="true"')
    expect(pageFile).toContain('data-compare-exclusion-entity-section="section.entityKind"')
    expect(pageFile).toContain('data-compare-exclusion-option="option.id"')
    expect(pageFile).toContain('clonePgmlCompareExclusions(activeCompareExclusions.value)')
    expect(pageFile).toContain('setCurrentCompareExclusions(compareExclusionsDraft.value)')
    expect(pageFile).toContain('const filteredCompareExclusionGroupSections = computed(() => {')
    expect(pageFile).toContain('const filteredCompareExclusionUngroupedTableOptions = computed(() => {')
    expect(pageFile).toContain('const filteredCompareExclusionEntitySections = computed(() => {')
    expect(pageFile).toContain('Select a group to exclude its full cluster, pick individual tables inside it, or exclude any other comparable entity kind directly.')
    expect(pageFile).toContain('Groups')
    expect(pageFile).toContain('Ungrouped tables')
    expect(pageFile).toContain('Other compare entities')
    expect(pageFile.indexOf('data-compare-exclusion-groups-section="true"')).toBeLessThan(
      pageFile.indexOf('data-compare-exclusion-ungrouped-section="true"')
    )
    expect(pageFile.indexOf('data-compare-exclusion-ungrouped-section="true"')).toBeLessThan(
      pageFile.indexOf('data-compare-exclusion-entities-section="true"')
    )
  })
})
