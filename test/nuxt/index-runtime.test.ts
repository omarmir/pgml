import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Index page source', () => {
  it('wires the browser and computer-file launch flows while keeping hosted database unfinished', () => {
    const file = readSourceFile('app/pages/index.vue')

    expect(file).toContain('const sourceCards = computed<SourceCardDefinition[]>(() => {')
    expect(file).toContain('readSavedPgmlSchemasFromBrowserStorage')
    expect(file).toContain('persistSavedPgmlSchemasToBrowserStorage')
    expect(file).toContain('listRecentComputerPgmlFiles')
    expect(file).toContain('loadRecentComputerPgmlFile')
    expect(file).toContain('openComputerPgmlFile')
    expect(file).toContain('createComputerPgmlFile')
    expect(file).toContain('buildBrowserStudioExampleQuery')
    expect(file).toContain('buildBrowserStudioNewQuery')
    expect(file).toContain('buildBrowserStudioSavedQuery')
    expect(file).toContain('buildFileStudioRecentQuery')
    expect(file).toContain('authorizeStudioLaunchAccess')
    expect(file).toContain('primePreloadedFileStudioLaunch')
    expect(file).toContain('onBeforeRouteLeave((to) => {')
    expect(file).toContain('delete-saved-schema')
    expect(file).toContain('computerFileAccessDialogOpen')
    expect(file).toContain('Allow computer file access')
    expect(file).toContain('@action="handleSourceCardAction"')
    expect(file).toContain('const specBannerButtonClass = studioButtonClasses.ghost')
    expect(file).toContain('data-spec-banner="true"')
    expect(file).toContain('sqlDumpDescription')
    expect(file).toContain('Choose a .pgml file from your computer')
    expect(file).toContain('Hosted database')
  })
})
