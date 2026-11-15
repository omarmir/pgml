import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('GitHub Gist source', () => {
  it('keeps GitHub tokens in memory while persisting only Gist metadata', () => {
    const storeFile = readSourceFile('app/stores/studio-sources.ts')
    const gistUtilsFile = readSourceFile('app/utils/github-gists.ts')
    const connectModalFile = readSourceFile('app/components/app/AppGithubGistConnectModal.vue')

    expect(storeFile).toContain('kind: \'connected\', metadata: PgmlGistConnectionMetadata, token: string')
    expect(storeFile).toContain('gistConnectionState.value.kind === \'connected\' ? gistConnectionState.value.token : null')
    expect(storeFile).not.toContain('persistPgmlGistConnectionMetadata(githubGistToken')
    expect(gistUtilsFile).toContain('export type PgmlGistConnectionMetadata')
    expect(gistUtilsFile).toContain('selectedFilename: string | null')
    expect(connectModalFile).toContain('name="password"')
    expect(connectModalFile).toContain('autocomplete="current-password"')
    expect(connectModalFile).toContain('name="username"')
    expect(connectModalFile).toContain('autocomplete="username"')
  })

  it('uses a manual Gist save action instead of autosave status copy', () => {
    const workspaceFile = readSourceFile('app/components/studio/StudioWorkspacePage.vue')
    const headerTitleFile = readSourceFile('app/components/app/AppHeaderTitleBlock.vue')
    const studioLayoutFile = readSourceFile('app/layouts/studio.vue')

    expect(headerTitleFile).toContain('flex min-w-0 flex-col items-center')
    expect(studioLayoutFile).toContain('v-if="schemaStatusData.action"')
    expect(workspaceFile).toContain('Unsaved changes. Use Save to write them to Gist.')
    expect(workspaceFile).toContain('label: \'Save\'')
  })

  it('disables queued browser persistence before resetting source state on route leave', () => {
    const workspaceFile = readSourceFile('app/components/studio/StudioWorkspacePage.vue')

    expect(workspaceFile).toContain('workspacePersistenceActive.value && currentPersistenceSource.value === \'browser\'')
    expect(workspaceFile).toContain('workspaceLifetime.value = \'leaving\'\n  clearStudioHeaderActions()')
  })
})
