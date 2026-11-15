import { mountSuspended } from '@nuxt/test-utils/runtime'
import { defineComponent } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePgmlStudioGists } from '../../app/composables/usePgmlStudioGists'
import { resetStudioWorkspaceState } from '../../app/composables/useStudioWorkspaceState'
import { useStudioSourcesStore } from '../../app/stores/studio-sources'
import { loadPgmlGistFile, loadPgmlGistFiles, savePgmlGistFile } from '../../app/utils/github-gists'

vi.mock('../../app/utils/github-gists', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../app/utils/github-gists')>()
  return {
    ...original,
    readPgmlGistConnectionMetadata: () => null,
    persistPgmlGistConnectionMetadata: () => true,
    loadPgmlGistFiles: vi.fn(async () => []),
    loadPgmlGistFile: vi.fn(),
    savePgmlGistFile: vi.fn()
  }
})

const mountGists = async () => {
  const source = ref('A original')
  let api!: ReturnType<typeof usePgmlStudioGists>
  let store!: ReturnType<typeof useStudioSourcesStore>
  const wrapper = await mountSuspended(defineComponent({
    setup() {
      store = useStudioSourcesStore()
      api = usePgmlStudioGists({ source, buildSchemaText: () => source.value })
      return () => null
    }
  }))
  await store.connectGithubGist({ gistId: 'A', token: 'token A' })
  api.syncLoadedGistFile({ filename: 'A.pgml', gistId: 'A', text: 'A original', updatedAt: 'old A' })
  return { api, store, source, wrapper }
}

describe('Gist persistence adapter', () => {
  beforeEach(() => {
    resetStudioWorkspaceState()
    vi.clearAllMocks()
    vi.mocked(loadPgmlGistFiles).mockResolvedValue([])
  })

  it('never saves the selected file into a different connected Gist', async () => {
    const { api, store } = await mountGists()
    await store.connectGithubGist({ gistId: 'B', token: 'token B' })
    expect(await api.saveSchemaToGistFile()).toBe(false)
    expect(savePgmlGistFile).not.toHaveBeenCalled()
    expect(api.currentGistId.value).toBe('A')
    expect(api.gistFileSaveError.value).not.toBeNull()
  })

  it('captures remote identity and discards old completion after another file is loaded', async () => {
    const { api, store, source } = await mountGists()
    let finish!: (value: Awaited<ReturnType<typeof savePgmlGistFile>>) => void
    vi.mocked(savePgmlGistFile).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    source.value = 'A edited'
    const pending = api.saveSchemaToGistFile()
    await store.connectGithubGist({ gistId: 'B', token: 'token B' })
    api.syncLoadedGistFile({ filename: 'B.pgml', gistId: 'B', text: 'B original', updatedAt: 'B time' })
    finish({ filename: 'A.pgml', gistId: 'A', size: 8, updatedAt: 'new A' })
    expect(await pending).toBe(false)
    expect(savePgmlGistFile).toHaveBeenCalledWith({ filename: 'A.pgml', gistId: 'A', text: 'A edited', token: 'token A' })
    expect(api.currentGistId.value).toBe('B')
    expect(api.currentGistFileUpdatedAt.value).toBe('B time')
    expect(api.hasPendingGistFileChanges.value).toBe(false)
    expect(store.githubGistFiles).toEqual([])
  })

  it('ignores a remote load completed after its adapter unmounts', async () => {
    const { api, source, wrapper } = await mountGists()
    let finish!: (value: Awaited<ReturnType<typeof loadPgmlGistFile>>) => void
    vi.mocked(loadPgmlGistFile).mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const pending = api.loadGistPgmlFileByName('other.pgml')
    wrapper.unmount()
    finish({ filename: 'other.pgml', gistId: 'A', text: 'stale', size: 5, updatedAt: 'later' })
    expect(await pending).toBe(false)
    expect(source.value).toBe('A original')
  })
  it.each(['older-first', 'newer-first'])('keeps the latest remote intent across two live adapters (%s)', async (order) => {
    const { api: first, source } = await mountGists()
    let second!: ReturnType<typeof usePgmlStudioGists>
    await mountSuspended(defineComponent({ setup() {
      second = usePgmlStudioGists({ source, buildSchemaText: () => source.value })
      return () => null
    } }))
    type Loaded = Awaited<ReturnType<typeof loadPgmlGistFile>>
    let finishA!: (value: Loaded) => void
    let finishB!: (value: Loaded) => void
    vi.mocked(loadPgmlGistFile)
      .mockImplementationOnce(() => new Promise((resolve) => { finishA = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishB = resolve }))
    const old = first.loadGistPgmlFileByName('old.pgml')
    const latest = second.loadGistPgmlFileByName('new.pgml')
    const A = { filename: 'old.pgml', gistId: 'A', text: 'old remote', size: 10, updatedAt: 'old' }
    const B = { filename: 'new.pgml', gistId: 'A', text: 'new remote', size: 10, updatedAt: 'new' }
    if (order === 'older-first') {
      finishA(A)
      expect(await old).toBe(false)
      finishB(B)
    } else {
      finishB(B)
      expect(await latest).toBe(true)
      finishA(A)
    }
    expect(await old).toBe(false)
    expect(await latest).toBe(true)
    expect(source.value).toBe('new remote')
    expect(first.currentGistFileName.value).toBe('new.pgml')
    expect(second.currentGistFileName.value).toBe('new.pgml')
  })
})
