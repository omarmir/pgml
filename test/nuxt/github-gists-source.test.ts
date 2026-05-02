import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('GitHub Gist source', () => {
  it('keeps GitHub tokens in memory while persisting only Gist metadata', () => {
    const storeFile = readSourceFile('app/stores/studio-sources.ts')
    const gistUtilsFile = readSourceFile('app/utils/github-gists.ts')
    const connectModalFile = readSourceFile('app/components/app/AppGithubGistConnectModal.vue')

    expect(storeFile).toContain('const githubGistToken: Ref<string | null> = ref(null)')
    expect(storeFile).not.toContain('persistPgmlGistConnectionMetadata(githubGistToken')
    expect(gistUtilsFile).toContain('export type PgmlGistConnectionMetadata')
    expect(gistUtilsFile).toContain('selectedFilename: string | null')
    expect(connectModalFile).toContain('name="password"')
    expect(connectModalFile).toContain('autocomplete="current-password"')
    expect(connectModalFile).toContain('name="username"')
    expect(connectModalFile).toContain('autocomplete="username"')
  })

  it('uses a manual Gist save action instead of autosave status copy', () => {
    const diagramWorkspaceFile = readSourceFile('app/components/studio/StudioWorkspacePage.vue')
    const analysisWorkspaceFile = readSourceFile('app/components/studio/StudioAnalysisWorkspacePage.vue')
    const headerTitleFile = readSourceFile('app/components/app/AppHeaderTitleBlock.vue')
    const studioLayoutFile = readSourceFile('app/layouts/studio.vue')

    expect(headerTitleFile).toContain('flex min-w-0 flex-col items-center')
    expect(studioLayoutFile).toContain('v-if="schemaStatusData.action"')
    expect(diagramWorkspaceFile).toContain('Unsaved changes. Use Save to write them to Gist.')
    expect(diagramWorkspaceFile).toContain('label: \'Save\'')
    expect(analysisWorkspaceFile).toContain('Unsaved changes. Use Save to write them to Gist.')
    expect(analysisWorkspaceFile).toContain('label: \'Save\'')
  })
})
