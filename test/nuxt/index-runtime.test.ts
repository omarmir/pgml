import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Index page source', () => {
  it('wires the browser launch flows and keeps the unfinished paths marked as placeholders', () => {
    const file = readSourceFile('app/pages/index.vue')

    expect(file).toContain('const sourceCards = computed<SourceCardDefinition[]>(() => {')
    expect(file).toContain('readSavedPgmlSchemasFromBrowserStorage')
    expect(file).toContain('persistSavedPgmlSchemasToBrowserStorage')
    expect(file).toContain('buildBrowserStudioExampleQuery')
    expect(file).toContain('buildBrowserStudioNewQuery')
    expect(file).toContain('buildBrowserStudioSavedQuery')
    expect(file).toContain('delete-saved-schema')
    expect(file).toContain('@item-action="handleSourceCardItemAction"')
    expect(file).toContain('const specBannerButtonClass = studioButtonClasses.ghost')
    expect(file).toContain('data-spec-banner="true"')
    expect(file).toContain('sqlDumpDescription')
    expect(file).toContain('Placeholder')
  })
})
