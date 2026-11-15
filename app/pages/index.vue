<script setup lang="ts">
import { storeToRefs } from 'pinia'
import AppDbmlImportModal from '~/components/app/AppDbmlImportModal.vue'
import AppGithubGistConnectModal from '~/components/app/AppGithubGistConnectModal.vue'
import {
  exampleSchemaName,
  formatSavedPgmlSchemaTime,
  untitledSchemaName
} from '~/utils/studio-browser-schemas'
import { convertDbmlToPgml } from '~/utils/dbml-import'
import { convertPgDumpToPgml } from '~/utils/pg-dump-import'
import type { PgmlRecentComputerFile } from '~/utils/computer-files'
import {
  createComputerPgmlFile,
  getRecentComputerPgmlFilePermissionState,
  loadRecentComputerPgmlFile,
  openComputerPgmlFile
} from '~/utils/computer-files'
import {
  createInitialPgmlDocument,
  serializePgmlDocument
} from '~/utils/pgml-document'
import { prepareImportedExecutableAttachments } from '~/utils/pgml-import-attachments'
import { useStudioSessionStore } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import { pgmlVersionedExample } from '~/utils/pgml'
import {
  joinStudioClasses,
  studioBodyCopyClass,
  studioButtonClasses,
  studioCompactFieldKickerClass,
  studioSectionKickerClass
} from '~/utils/uiStyles'
import {
  buildBrowserStudioExampleQuery,
  buildBrowserStudioNewQuery,
  buildBrowserStudioSavedQuery,
  buildFileStudioRecentQuery,
  buildGistStudioFileQuery,
  getStudioWorkspacePath,
  isStudioWorkspacePath,
  type FileStudioLaunchRequest,
  type StudioWorkspacePage
} from '~/utils/studio-launch'

type SourceCardId = 'browser-local-storage' | 'computer-saved-file' | 'github-gist'
type PgDumpImportTarget = 'browser' | 'file' | 'gist'

type SourceCardOperationItem = {
  action?: {
    ariaLabel: string
    icon: string
    id: string
    value: string
  }
  description?: string
  label: string
  to?: {
    path: string
    query?: Record<string, string>
  }
  triggerAction?: {
    id: string
    value: string
  }
}

type SourceCardOperation = {
  description: string
  icon: string
  items?: SourceCardOperationItem[]
  label: string
  placeholder?: boolean
  to?: {
    path: string
    query?: Record<string, string>
  }
  triggerAction?: {
    id: string
    value: string
  }
}

type SourceCardDefinition = {
  cardId: SourceCardId
  description: string
  importActions: Array<{
    description: string
    id: string
    label: string
    title: string
    value: SourceCardId
  }>
  inventory: string
  operations: SourceCardOperation[]
  statusLabel: string
  statusTone: 'live' | 'placeholder'
  title: string
}

type PendingComputerFileAction = { kind: 'create-example' }
  | {
    kind: 'create-import'
    schemaName: string
    text: string
    workspacePage: StudioWorkspacePage
  }
  | { kind: 'create-new' }
  | { kind: 'open-picker' }
  | { kind: 'open-recent', recentFileId: string }

type HomeImportDraft = {
  kind: 'dbml' | 'pg_dump'
  target: PgDumpImportTarget
  text: string
  file: File | null
  foldIdentifiersToLowercase: boolean
  parseExecutableComments: boolean
}
const schemaImport = useSchemaImportSession<HomeImportDraft>()
const dbmlImportDraft = computed(() => schemaImport.draft.value?.kind === 'dbml' ? schemaImport.draft.value : null)
const pgDumpImportDraft = computed(() => schemaImport.draft.value?.kind === 'pg_dump' ? schemaImport.draft.value : null)
const dbmlImportDialogOpen = computed(() => schemaImport.isOpen.value && dbmlImportDraft.value !== null)
const pgDumpImportDialogOpen = computed(() => schemaImport.isOpen.value && pgDumpImportDraft.value !== null)
const dbmlImportError = computed(() => dbmlImportDraft.value === null ? null : schemaImport.error.value)
const pgDumpImportError = computed(() => pgDumpImportDraft.value === null ? null : schemaImport.error.value)
const dbmlImportTarget = computed(() => dbmlImportDraft.value === null ? null : dbmlImportDraft.value.target)
const pgDumpImportTarget = computed(() => pgDumpImportDraft.value === null ? null : pgDumpImportDraft.value.target)
const dbmlImportText = computed(() => dbmlImportDraft.value === null ? '' : dbmlImportDraft.value.text)
const pgDumpImportText = computed(() => pgDumpImportDraft.value === null ? '' : pgDumpImportDraft.value.text)
const dbmlImportSelectedFile = computed(() => dbmlImportDraft.value === null ? null : dbmlImportDraft.value.file)
const pgDumpImportSelectedFile = computed(() => pgDumpImportDraft.value === null ? null : pgDumpImportDraft.value.file)
const dbmlImportFoldIdentifiersToLowercase = computed(() => dbmlImportDraft.value !== null && dbmlImportDraft.value.foldIdentifiersToLowercase)
const pgDumpImportFoldIdentifiersToLowercase = computed(() => pgDumpImportDraft.value !== null && pgDumpImportDraft.value.foldIdentifiersToLowercase)
const dbmlImportParseExecutableComments = computed(() => dbmlImportDraft.value !== null && dbmlImportDraft.value.parseExecutableComments)
const isSubmittingDbmlImport = computed(() => schemaImport.isBusy.value && dbmlImportDraft.value !== null)
const isSubmittingPgDumpImport = computed(() => schemaImport.isBusy.value && pgDumpImportDraft.value !== null)
type ImportDialogCopy = {
  confirmLabel: string
  description: string
  inputDescription: string
  title: string
}

type PendingImportedSchemaLaunch = {
  importTarget: PgDumpImportTarget
  schemaName: string
  snapshotSource: string
}

let homeLifetime: 'active' | 'disposed' = 'active'
onScopeDispose(() => {
  homeLifetime = 'disposed'
})
const computerFileAccessDialog = useDialogDraft<PendingComputerFileAction>()
const { draft: pendingComputerFileAction, isOpen: computerFileAccessDialogOpen, isSaving: isConfirmingComputerFileAction } = computerFileAccessDialog
const importedSchemaLaunch = useDialogDraft<PendingImportedSchemaLaunch & { error: string | null }>()
const { draft: pendingImportedSchemaLaunch, isOpen: importedSchemaLaunchDialogOpen, isSaving: isSubmittingImportedSchemaLaunch } = importedSchemaLaunch
const githubGistDialog = useDialogDraft<{ gistId: string, token: string, error: string | null }>()
const { isOpen: githubGistConnectDialogOpen, isSaving: isSubmittingGithubGistConnection } = githubGistDialog
const githubGistId = computed(() => githubGistDialog.draft.value === null ? '' : githubGistDialog.draft.value.gistId)
const githubGistTokenInput = computed(() => githubGistDialog.draft.value === null ? '' : githubGistDialog.draft.value.token)
const githubGistConnectError = computed(() => githubGistDialog.draft.value === null ? null : githubGistDialog.draft.value.error)
const browserNewQuery = buildBrowserStudioNewQuery()
const browserExampleQuery = buildBrowserStudioExampleQuery()
const studioSessionStore = useStudioSessionStore()
const studioSourcesStore = useStudioSourcesStore()
const {
  browserSchemas: savedSchemas,
  githubGistConnection,
  githubGistError,
  githubGistFiles,
  githubGistToken,
  recentComputerFiles
} = storeToRefs(studioSourcesStore)
const router = useRouter()
const toast = useToast()
const computerFileAccessInfoPanelClass = joinStudioClasses(
  'grid gap-1 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3'
)
const modalPrimaryButtonClass = studioButtonClasses.primary
const modalSecondaryButtonClass = studioButtonClasses.secondary
const specBannerClass = joinStudioClasses(
  'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-5 py-5 sm:px-6 sm:py-6'
)
const specBannerButtonClass = studioButtonClasses.ghost
const dbmlImportConflictErrorMessage = 'Choose either pasted DBML text or a DBML file upload, not both.'
const dbmlImportMissingInputErrorMessage = 'Paste DBML text or choose a DBML file before importing.'
const pgDumpImportConflictErrorMessage = 'Choose either pasted pg_dump text or a file upload, not both.'
const pgDumpImportMissingInputErrorMessage = 'Paste pg_dump text or choose a text dump file before importing.'
const sourceImportTargetByCardId: Record<SourceCardId, PgDumpImportTarget> = {
  'browser-local-storage': 'browser',
  'computer-saved-file': 'file',
  'github-gist': 'gist'
}
const getActionErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallbackMessage
}
const pushSaveErrorToast = (description: string) => {
  toast.add({
    title: 'Save failed',
    description,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}
const pushComputerFileActionErrorToast = (description: string) => {
  toast.add({
    title: 'Computer file action failed',
    description,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}
const editImport = (patch: Partial<HomeImportDraft>) => {
  schemaImport.edit(draft => ({ ...draft, ...patch }))
  const draft = schemaImport.draft.value
  if (draft !== null && draft.file !== null && draft.text.trim().length > 0) {
    schemaImport.setError(draft.kind === 'dbml' ? dbmlImportConflictErrorMessage : pgDumpImportConflictErrorMessage)
  }
}
const submitImportedSchema = async (kind: HomeImportDraft['kind']) => {
  if (schemaImport.draft.value?.kind !== kind) return
  const request = schemaImport.begin(kind === 'dbml'
    ? { conflict: dbmlImportConflictErrorMessage, missing: dbmlImportMissingInputErrorMessage }
    : { conflict: pgDumpImportConflictErrorMessage, missing: pgDumpImportMissingInputErrorMessage })
  if (request === null) return
  const draft = request.draft
  try {
    const sourceText = draft.file === null ? draft.text : await draft.file.text()
    if (!schemaImport.owns(request)) return
    const importedSchema = kind === 'dbml'
      ? convertDbmlToPgml({ dbml: sourceText, foldIdentifiersToLowercase: draft.foldIdentifiersToLowercase,
          parseExecutableComments: draft.parseExecutableComments, preferredName: draft.file?.name })
      : convertPgDumpToPgml({ sql: sourceText, foldIdentifiersToLowercase: draft.foldIdentifiersToLowercase, preferredName: draft.file?.name })
    const preparedImport = prepareImportedExecutableAttachments(importedSchema.pgml)
    if (!schemaImport.complete(request)) return
    importedSchemaLaunch.open({ importTarget: draft.target, schemaName: importedSchema.schemaName, snapshotSource: preparedImport.pgml, error: null })
  } catch (error) {
    schemaImport.fail(request, getActionErrorMessage(error, kind === 'dbml' ? 'Unable to import that DBML.' : 'Unable to import that pg_dump.'))
  }
}
const buildVersionedPgmlText = (input: {
  initialVersionName?: string
  name: string
  role?: 'design' | 'implementation'
  snapshotSource: string
}) => {
  const normalizedSnapshotSource = input.snapshotSource.trim()

  // Imports and new-document flows both create the grammar-native VersionSet
  // format. Initial imports start with one locked implementation checkpoint;
  // brand-new documents start with only a mutable workspace draft.
  if (input.initialVersionName) {
    return serializePgmlDocument(createInitialPgmlDocument({
      initialVersion: {
        createdAt: new Date().toISOString(),
        name: input.initialVersionName,
        parentVersionId: null,
        role: input.role || 'design',
        snapshot: {
          source: normalizedSnapshotSource
        }
      },
      name: input.name,
      workspaceSource: normalizedSnapshotSource
    }))
  }

  return serializePgmlDocument(createInitialPgmlDocument({
    name: input.name,
    workspaceSource: normalizedSnapshotSource
  }))
}

const refreshSavedSchemas = () => {
  studioSourcesStore.refreshBrowserSchemas()
}
const refreshRecentComputerFiles = async () => {
  await studioSourcesStore.refreshRecentComputerFiles()
}
const refreshGithubGistFiles = async () => {
  await studioSourcesStore.refreshGithubGistFiles()
}
const closeImportedSchemaLaunchDialog = () => importedSchemaLaunch.close()
const finishImportedSchemaLaunch = async (input: {
  importTarget: PgDumpImportTarget
  schemaName: string
  snapshotSource: string
  workspacePage: StudioWorkspacePage
  canNavigate: () => boolean
}) => {
  // Browser imports become saved browser documents immediately. File imports
  // queue the file-system permission dialog first so the actual save target is
  // still chosen by the user.
  if (input.importTarget === 'file') {
    return queueComputerFileAccessAction({
      kind: 'create-import',
      schemaName: input.schemaName,
      text: buildVersionedPgmlText({
        initialVersionName: 'Initial implementation',
        name: input.schemaName,
        role: 'implementation',
        snapshotSource: input.snapshotSource
      }),
      workspacePage: input.workspacePage
    })
  }

  if (input.importTarget === 'gist') {
    return await createGithubGistFileFromImport({
      name: input.schemaName, snapshotSource: input.snapshotSource, workspacePage: input.workspacePage, canNavigate: input.canNavigate
    })
  }

  return await createBrowserSchemaFromImport({
    name: input.schemaName,
    snapshotSource: input.snapshotSource,
    workspacePage: input.workspacePage
  })
}
const createBrowserSchemaFromImport = async (input: {
  name: string
  snapshotSource: string
  workspacePage: StudioWorkspacePage
}) => {
  const createdSchema = studioSourcesStore.createBrowserSchema({
    name: input.name,
    text: buildVersionedPgmlText({
      initialVersionName: 'Initial implementation',
      name: input.name,
      role: 'implementation',
      snapshotSource: input.snapshotSource
    })
  })

  if (!createdSchema) {
    pushSaveErrorToast('Unable to save to local storage.')
    return false
  }

  await router.push({
    path: getStudioWorkspacePath(input.workspacePage),
    query: buildBrowserStudioSavedQuery(createdSchema.id)
  })

  return true
}
const createGithubGistFile = async (input: {
  name: string
  text: string
  workspacePage?: StudioWorkspacePage
  canNavigate?: () => boolean
}) => {
  if (!githubGistConnection.value || !githubGistToken.value) {
    openGithubGistConnectDialog()
    return false
  }

  const createdFile = await studioSourcesStore.createGithubGistPgmlFile({
    name: input.name,
    text: input.text
  })

  if (!createdFile) {
    pushSaveErrorToast(studioSourcesStore.githubGistError || 'Unable to save to the connected GitHub Gist.')
    return false
  }

  if (homeLifetime === 'disposed' || (input.canNavigate && !input.canNavigate())) return false
  await router.push({
    path: getStudioWorkspacePath(input.workspacePage || 'diagram'),
    query: buildGistStudioFileQuery({
      filename: createdFile.filename,
      gistId: createdFile.gistId
    })
  })

  return true
}
const createGithubGistFileFromImport = async (input: {
  name: string
  snapshotSource: string
  workspacePage: StudioWorkspacePage
  canNavigate: () => boolean
}) => {
  return await createGithubGistFile({
    name: input.name,
    text: buildVersionedPgmlText({
      initialVersionName: 'Initial implementation',
      name: input.name,
      role: 'implementation',
      snapshotSource: input.snapshotSource
    }),
    workspacePage: input.workspacePage,
    canNavigate: input.canNavigate
  })
}
const deleteBrowserSavedSchema = (schemaId: string) => {
  if (!studioSourcesStore.deleteBrowserSchema(schemaId)) {
    pushSaveErrorToast('Unable to save to local storage.')
    return
  }
}
const deleteRecentComputerFile = async (recentFileId: string) => {
  const didDeleteRecentFile = await studioSourcesStore.deleteRecentComputerFile(recentFileId)

  if (didDeleteRecentFile) {
    return
  }

  pushComputerFileActionErrorToast(
    studioSourcesStore.recentComputerFilesError || 'Unable to remove the recent file.'
  )
}
const buildFileLaunchRequest = (recentFileId: string): FileStudioLaunchRequest => {
  return {
    launch: 'recent',
    recentFileId,
    source: 'file'
  }
}
const navigateToRecentComputerFile = async (
  recentFileId: string,
  workspacePage: StudioWorkspacePage = 'diagram',
  preloadedFile?: {
    entry: PgmlRecentComputerFile
    text: string
  }
) => {
  if (homeLifetime === 'disposed') return
  if (preloadedFile) {
    studioSessionStore.primePreloadedFileLaunch(buildFileLaunchRequest(recentFileId), preloadedFile)
  }

  await router.push({
    path: getStudioWorkspacePath(workspacePage),
    query: buildFileStudioRecentQuery(recentFileId)
  })
}
const openComputerFileFromPicker = async () => {
  try {
    const loadedFile = await openComputerPgmlFile()

    if (!loadedFile) {
      return false
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(loadedFile.entry.id, 'diagram', loadedFile)
    return true
  } catch (error) {
    pushComputerFileActionErrorToast(getActionErrorMessage(error, 'Unable to open the selected file.'))
    return false
  }
}
const createComputerFile = async (input: {
  name: string
  text: string
  workspacePage?: StudioWorkspacePage
}) => {
  try {
    const createdFile = await createComputerPgmlFile({
      name: input.name,
      text: input.text
    })

    if (!createdFile) {
      return false
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(createdFile.entry.id, input.workspacePage || 'diagram', createdFile)
    return true
  } catch (error) {
    pushSaveErrorToast(getActionErrorMessage(error, 'Unable to save to the selected file.'))
    return false
  }
}
const createComputerFileFromLaunch = async (launchType: 'example' | 'new') => {
  return await createComputerFile({
    name: launchType === 'example' ? exampleSchemaName : untitledSchemaName,
    text: launchType === 'example'
      ? pgmlVersionedExample
      : buildVersionedPgmlText({
          name: untitledSchemaName,
          snapshotSource: ''
        })
  })
}
const createGithubGistFileFromLaunch = async (launchType: 'example' | 'new') => {
  if (!githubGistConnection.value || !githubGistToken.value) {
    openGithubGistConnectDialog()
    return
  }

  await createGithubGistFile({
    name: launchType === 'example' ? exampleSchemaName : untitledSchemaName,
    text: launchType === 'example'
      ? pgmlVersionedExample
      : buildVersionedPgmlText({
          name: untitledSchemaName,
          snapshotSource: ''
        })
  })
}
const openRecentComputerFileFromLaunch = async (recentFileId: string) => {
  try {
    const loadedFile = await loadRecentComputerPgmlFile(recentFileId)

    if (!loadedFile) {
      return false
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(loadedFile.entry.id, 'diagram', loadedFile)
    return true
  } catch (error) {
    pushComputerFileActionErrorToast(getActionErrorMessage(error, 'Unable to reopen the selected file.'))
    return false
  }
}
const handleRecentComputerFileLaunch = async (recentFileId: string) => {
  try {
    const permissionState = await getRecentComputerPgmlFilePermissionState(recentFileId)

    if (permissionState === 'granted') {
      await openRecentComputerFileFromLaunch(recentFileId)
      return
    }

    queueComputerFileAccessAction({
      kind: 'open-recent',
      recentFileId
    })
  } catch (error) {
    pushComputerFileActionErrorToast(getActionErrorMessage(error, 'Unable to reopen the selected file.'))
  }
}
const queueComputerFileAccessAction = (action: PendingComputerFileAction) => computerFileAccessDialog.open(action)
const openImportDialog = (kind: HomeImportDraft['kind'], cardId: SourceCardId) => {
  schemaImport.open({ kind, target: sourceImportTargetByCardId[cardId], text: '', file: null,
    foldIdentifiersToLowercase: false, parseExecutableComments: false })
}
const openDbmlImportDialog = (cardId: SourceCardId) => openImportDialog('dbml', cardId)
const openPgDumpImportDialog = (cardId: SourceCardId) => openImportDialog('pg_dump', cardId)
const handlePgDumpImportDialogOpenChange = (open: boolean) => {
  if (!open) schemaImport.close()
}
const handleDbmlImportDialogOpenChange = (open: boolean) => {
  if (!open) schemaImport.close()
}
const setDbmlImportText = (text: string) => editImport({ text })
const setPgDumpImportText = (text: string) => editImport({ text })
const setDbmlImportFile = (files: FileList | null) => editImport({ file: files === null ? null : files.item(0) })
const setPgDumpImportFile = (files: FileList | null) => editImport({ file: files === null ? null : files.item(0) })
const clearDbmlImportFile = () => editImport({ file: null })
const clearPgDumpImportFile = () => editImport({ file: null })
const submitDbmlImport = () => submitImportedSchema('dbml')
const submitPgDumpImport = () => submitImportedSchema('pg_dump')
const closeComputerFileAccessDialog = () => computerFileAccessDialog.close()
const confirmComputerFileAccessAction = async () => {
  const action = computerFileAccessDialog.beginSave()
  if (action === null) return
  try {
    // Invoke the native picker from this click before any awaited work.
    const operation = action.kind === 'open-picker'
      ? openComputerFileFromPicker()
      : action.kind === 'open-recent'
        ? openRecentComputerFileFromLaunch(action.recentFileId)
        : action.kind === 'create-new'
          ? createComputerFileFromLaunch('new')
          : action.kind === 'create-import'
            ? createComputerFile({ name: action.schemaName, text: action.text, workspacePage: action.workspacePage })
            : createComputerFileFromLaunch('example')
    const accepted = await operation
    computerFileAccessDialog.completeSave(action, accepted)
  } finally {
    computerFileAccessDialog.completeSave(action, false)
  }
}
const launchImportedSchemaIntoWorkspace = async (workspacePage: StudioWorkspacePage) => {
  const draft = importedSchemaLaunch.beginSave()
  if (draft === null) return
  draft.error = null
  try {
    const accepted = await finishImportedSchemaLaunch({ ...draft, workspacePage,
      canNavigate: () => importedSchemaLaunch.isSaving.value && importedSchemaLaunch.draft.value === draft })
    if (accepted) importedSchemaLaunch.completeSave(draft, true)
    else draft.error = draft.importTarget === 'browser' ? 'Unable to save to local storage.' : 'Unable to save to the connected GitHub Gist.'
  } catch (error) {
    draft.error = getActionErrorMessage(error, 'Unable to open the imported schema.')
    if (importedSchemaLaunch.draft.value === draft) pushSaveErrorToast(draft.error)
  } finally {
    importedSchemaLaunch.completeSave(draft, false)
  }
}
const openGithubGistConnectDialog = () => {
  githubGistDialog.open({ gistId: githubGistConnection.value === null ? '' : githubGistConnection.value.gistId, token: '', error: null })
}
const handleGithubGistConnectDialogOpenChange = (open: boolean) => {
  if (!open) githubGistDialog.close()
}
const submitGithubGistConnection = async () => {
  const draft = githubGistDialog.beginSave()
  if (draft === null) return
  draft.error = null
  try {
    const didConnect = await studioSourcesStore.connectGithubGist({ gistId: draft.gistId, token: draft.token })
    if (githubGistDialog.draft.value !== draft) return
    if (!didConnect) {
      draft.error = studioSourcesStore.githubGistError || 'Unable to connect to that GitHub Gist.'
      return
    }
    draft.token = ''
    githubGistDialog.completeSave(draft, true)
  } catch (error) {
    if (githubGistDialog.draft.value === draft) draft.error = getActionErrorMessage(error, 'Unable to connect to that GitHub Gist.')
  } finally {
    githubGistDialog.completeSave(draft, false)
  }
}
const handleSourceCardAction = async (payload: {
  actionId: string
  cardId: string
  value: string
}) => {
  if (payload.actionId === 'open-dbml-import') {
    if (payload.value === 'github-gist' && (!githubGistConnection.value || !githubGistToken.value)) {
      openGithubGistConnectDialog()
      return
    }

    openDbmlImportDialog(payload.value as SourceCardId)
    return
  }

  if (payload.actionId === 'open-pg-dump-import') {
    if (payload.value === 'github-gist' && (!githubGistConnection.value || !githubGistToken.value)) {
      openGithubGistConnectDialog()
      return
    }

    openPgDumpImportDialog(payload.value as SourceCardId)
    return
  }

  if (payload.cardId === 'browser-local-storage' && payload.actionId === 'delete-saved-schema') {
    deleteBrowserSavedSchema(payload.value)
    return
  }

  if (payload.cardId === 'github-gist') {
    if (payload.actionId === 'connect-github-gist') {
      openGithubGistConnectDialog()
      return
    }

    if (payload.actionId === 'refresh-github-gist') {
      await refreshGithubGistFiles()
      return
    }

    if (payload.actionId === 'create-github-gist-file:new') {
      await createGithubGistFileFromLaunch('new')
      return
    }

    if (payload.actionId === 'create-github-gist-file:example') {
      await createGithubGistFileFromLaunch('example')
      return
    }

    return
  }

  if (payload.cardId !== 'computer-saved-file') {
    return
  }

  if (payload.actionId === 'open-computer-file-picker') {
    queueComputerFileAccessAction({
      kind: 'open-picker'
    })
    return
  }

  if (payload.actionId === 'open-recent-computer-file') {
    await handleRecentComputerFileLaunch(payload.value)
    return
  }

  if (payload.actionId === 'delete-recent-computer-file') {
    await deleteRecentComputerFile(payload.value)
    return
  }

  if (payload.actionId === 'create-computer-file:new') {
    queueComputerFileAccessAction({
      kind: 'create-new'
    })
    return
  }

  if (payload.actionId === 'create-computer-file:example') {
    queueComputerFileAccessAction({
      kind: 'create-example'
    })
  }
}
const computerFileAccessDialogCopy = computed(() => {
  const pendingAction = pendingComputerFileAction.value
  const defaultCopy = {
    confirmLabel: 'Continue',
    nextStepDescription: 'The next step opens the browser-managed file picker or permission prompt for the `.pgml` file you selected.',
    title: 'Allow computer file access'
  }

  if (!pendingAction) {
    return defaultCopy
  }

  if (pendingAction.kind === 'open-recent') {
    const recentFileName = recentComputerFiles.value.find((file) => {
      return file.id === pendingAction.recentFileId
    })?.name || 'this recent .pgml file'

    return {
      confirmLabel: 'Continue and reopen file',
      nextStepDescription: `The next step asks the browser to reopen ${recentFileName} and keep autosave pointed at that same file.`,
      title: 'Reopen a recent computer file'
    }
  }

  if (pendingAction.kind === 'open-picker') {
    return {
      confirmLabel: 'Continue to file picker',
      nextStepDescription: 'The next step opens your browser file picker so you can choose the exact `.pgml` file PGML should open.',
      title: 'Open a computer file'
    }
  }

  if (pendingAction.kind === 'create-new') {
    return {
      confirmLabel: 'Continue to save dialog',
      nextStepDescription: 'The next step opens the browser save dialog so you can choose where the new blank `.pgml` file should live.',
      title: 'Create a computer-backed file'
    }
  }

  if (pendingAction.kind === 'create-import') {
    return {
      confirmLabel: 'Continue to save dialog',
      nextStepDescription: 'The next step opens the browser save dialog so you can choose where the imported `.pgml` file should live.',
      title: 'Create an imported file on your computer'
    }
  }

  return {
    confirmLabel: 'Continue to save dialog',
    nextStepDescription: 'The next step opens the browser save dialog so you can choose where the example `.pgml` file should be created.',
    title: 'Create an example file on your computer'
  }
})
const dbmlImportSelectedFileName = computed(() => {
  return dbmlImportSelectedFile.value?.name || ''
})
const dbmlImportDialogCopy = computed(() => {
  const copyByTarget: Record<PgDumpImportTarget, ImportDialogCopy> = {
    browser: {
      confirmLabel: 'Import into browser storage',
      description: 'Paste DBML text or upload a DBML file. PGML will validate the schema surface, optionally extract recognized SQL entities from block comments, infer obvious table attachments for imported executables, show progress while the import is prepared, and open the result in browser local storage.',
      inputDescription: 'Use one input method only. PGML imports the DBML-compatible table, enum, and ref surface it already understands. You can also opt into comment parsing for functions, triggers, procedures, sequences, and simple indexes when they are embedded in block comments. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import DBML into browser storage'
    },
    file: {
      confirmLabel: 'Import into new file',
      description: 'Paste DBML text or upload a DBML file. PGML will validate the schema surface, optionally extract recognized SQL entities from block comments, infer obvious table attachments for imported executables, show progress while the import is prepared, and then ask where the new `.pgml` file should be saved.',
      inputDescription: 'Use one input method only. PGML imports the DBML-compatible table, enum, and ref surface it already understands. You can also opt into comment parsing for functions, triggers, procedures, sequences, and simple indexes when they are embedded in block comments. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import DBML into a new computer file'
    },
    gist: {
      confirmLabel: 'Import into Gist',
      description: 'Paste DBML text or upload a DBML file. PGML will validate the schema surface, optionally extract recognized SQL entities from block comments, infer obvious executable attachments, show progress while the import is prepared, and save the result as a new `.pgml` file in the connected Gist.',
      inputDescription: 'Use one input method only. PGML imports the DBML-compatible table, enum, and ref surface it already understands. You can also opt into comment parsing for functions, triggers, procedures, sequences, and simple indexes when they are embedded in block comments. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import DBML into GitHub Gist'
    }
  }

  return copyByTarget[dbmlImportTarget.value || 'browser']
})
const pgDumpImportSelectedFileName = computed(() => {
  return pgDumpImportSelectedFile.value?.name || ''
})
const pgDumpImportDialogCopy = computed(() => {
  const copyByTarget: Record<PgDumpImportTarget, ImportDialogCopy> = {
    browser: {
      confirmLabel: 'Import into browser storage',
      description: 'Paste a text pg_dump or upload a text dump file. PGML will convert the schema objects, infer obvious executable table attachments, show progress while the import is prepared, and open the result in browser local storage.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import pg_dump into browser storage'
    },
    file: {
      confirmLabel: 'Import into new file',
      description: 'Paste a text pg_dump or upload a text dump file. PGML will convert the schema objects, infer obvious executable table attachments, show progress while the import is prepared, and then ask where the new `.pgml` file should be saved.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import pg_dump into a new computer file'
    },
    gist: {
      confirmLabel: 'Import into Gist',
      description: 'Paste a text pg_dump or upload a text dump file. PGML will convert the schema objects, infer obvious executable table attachments, show progress while the import is prepared, and save the result as a new `.pgml` file in the connected Gist.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import pg_dump into GitHub Gist'
    }
  }

  return copyByTarget[pgDumpImportTarget.value || 'browser']
})

const browserSchemaCountLabel = computed(() => {
  const schemaCount = savedSchemas.value.length

  return `${schemaCount} saved schema${schemaCount === 1 ? '' : 's'}`
})
const computerFileCountLabel = computed(() => {
  const fileCount = recentComputerFiles.value.length

  return `${fileCount} recent file${fileCount === 1 ? '' : 's'}`
})
const githubGistInventoryLabel = computed(() => {
  if (!githubGistConnection.value) {
    return 'Not connected'
  }

  if (!githubGistToken.value) {
    return 'Token required'
  }

  const fileCount = githubGistFiles.value.length

  return `${fileCount} PGML file${fileCount === 1 ? '' : 's'}`
})
const browserExistingItems = computed<SourceCardOperationItem[]>(() => {
  if (savedSchemas.value.length === 0) {
    return [{
      description: 'Start new or load the example to create the first browser-backed schema.',
      label: 'No browser-saved schemas yet.'
    }]
  }

  return savedSchemas.value.map((schema) => {
    return {
      action: {
        ariaLabel: `Delete ${schema.name}`,
        icon: 'i-lucide-trash-2',
        id: 'delete-saved-schema',
        value: schema.id
      },
      description: `Saved ${formatSavedPgmlSchemaTime(schema.updatedAt)}`,
      label: schema.name,
      to: {
        path: '/diagram',
        query: buildBrowserStudioSavedQuery(schema.id)
      }
    }
  })
})
const computerFileItems = computed<SourceCardOperationItem[]>(() => {
  const chooseFileItem: SourceCardOperationItem = {
    description: 'Choose an existing `.pgml` file from your computer and add it to the recent list.',
    label: 'Choose a .pgml file from your computer',
    triggerAction: {
      id: 'open-computer-file-picker',
      value: 'picker'
    }
  }

  if (recentComputerFiles.value.length === 0) {
    return [
      chooseFileItem,
      {
        description: 'Create a new file or choose an existing `.pgml` file to start a recent list.',
        label: 'No recent computer files yet.'
      }
    ]
  }

  return [
    chooseFileItem,
    ...recentComputerFiles.value.map((file) => {
      return {
        action: {
          ariaLabel: `Remove ${file.name} from recent files`,
          icon: 'i-lucide-trash-2',
          id: 'delete-recent-computer-file',
          value: file.id
        },
        description: `Opened ${formatSavedPgmlSchemaTime(file.updatedAt)}`,
        label: file.name,
        triggerAction: {
          id: 'open-recent-computer-file',
          value: file.id
        }
      }
    })
  ]
})
const githubGistItems = computed<SourceCardOperationItem[]>(() => {
  const connectItem: SourceCardOperationItem = {
    description: githubGistConnection.value
      ? 'Reconnect this Gist with a token from your password manager.'
      : 'Enter a Gist ID and a GitHub token. The token stays in memory only.',
    label: githubGistConnection.value ? 'Reconnect GitHub Gist' : 'Connect GitHub Gist',
    triggerAction: {
      id: 'connect-github-gist',
      value: 'connect'
    }
  }

  if (!githubGistConnection.value || !githubGistToken.value) {
    return [
      connectItem,
      {
        description: 'PGML files are fetched from GitHub after you connect.',
        label: 'No Gist files loaded.'
      }
    ]
  }

  if (githubGistFiles.value.length === 0) {
    return [
      connectItem,
      {
        description: 'Create a new PGML file or import DBML/pg_dump into this Gist.',
        label: 'No PGML files in this Gist yet.'
      }
    ]
  }

  return [
    connectItem,
    ...githubGistFiles.value.map((file) => {
      return {
        description: `Remote file updated ${formatSavedPgmlSchemaTime(file.updatedAt)}`,
        label: file.filename,
        to: {
          path: '/diagram',
          query: buildGistStudioFileQuery({
            filename: file.filename,
            gistId: file.gistId
          })
        }
      }
    })
  ]
})
const sourceCards = computed<SourceCardDefinition[]>(() => {
  return [
    {
      cardId: 'browser-local-storage',
      description: 'Resume a versioned PGML document saved in this browser, start a blank workspace, or open the bundled multi-version example before entering the studio.',
      inventory: browserSchemaCountLabel.value,
      operations: [
        {
          description: 'Open a schema already saved in this browser and continue editing it in the studio.',
          icon: 'i-lucide-folder-open',
          items: browserExistingItems.value,
          label: 'Open existing'
        },
        {
          description: 'Open a blank versioned PGML document and begin a schema directly in browser storage.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          to: {
            path: '/diagram',
            query: browserNewQuery
          }
        },
        {
          description: 'Load the bundled PGML example so you can explore checkpoints, compare, migrations, and rich Postgres objects from a known starting point.',
          icon: 'i-lucide-flask-conical',
          label: 'Open bundled example',
          to: {
            path: '/diagram',
            query: browserExampleQuery
          }
        }
      ],
      importActions: [
        {
          description: 'Convert a text pg_dump into a browser-backed versioned PGML document, show progress while the import is prepared, and review executable placement only when a table attachment is ambiguous.',
          id: 'open-pg-dump-import',
          label: 'Import into browser storage',
          title: 'pg_dump',
          value: 'browser-local-storage'
        },
        {
          description: 'Validate DBML-compatible schema blocks, extract supported executable objects, and open the result as a browser-backed versioned PGML document with attachment review only when placement is ambiguous.',
          id: 'open-dbml-import',
          label: 'Import DBML into browser storage',
          title: 'DBML',
          value: 'browser-local-storage'
        }
      ],
      statusLabel: 'Available now',
      statusTone: 'live',
      title: 'Browser local storage'
    },
    {
      cardId: 'computer-saved-file',
      description: 'Use this lane for local versioned `.pgml` files, whether that means reopening a recent file, starting blank, or saving the bundled example.',
      inventory: computerFileCountLabel.value,
      operations: [
        {
          description: 'Choose a `.pgml` file from your computer or reopen one from the recent list below.',
          icon: 'i-lucide-folder-open',
          items: computerFileItems.value,
          label: 'Open existing'
        },
        {
          description: 'Create a blank versioned `.pgml` file first, then open it in the studio with that file as the active target.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          triggerAction: {
            id: 'create-computer-file:new',
            value: 'new'
          }
        },
        {
          description: 'Save the bundled multi-version PGML example to a new `.pgml` file first, then continue editing that file in the studio.',
          icon: 'i-lucide-flask-conical',
          label: 'Save example to a new file',
          triggerAction: {
            id: 'create-computer-file:example',
            value: 'example'
          }
        }
      ],
      importActions: [
        {
          description: 'Convert a text pg_dump into a new computer-backed versioned `.pgml` file, show progress while the import is prepared, and review executable placement only when a table attachment is ambiguous.',
          id: 'open-pg-dump-import',
          label: 'Import into a new file',
          title: 'pg_dump',
          value: 'computer-saved-file'
        },
        {
          description: 'Validate a DBML file, extract supported executable objects, and save the resulting versioned PGML with attachment review only when placement is ambiguous.',
          id: 'open-dbml-import',
          label: 'Import DBML into a new file',
          title: 'DBML',
          value: 'computer-saved-file'
        }
      ],
      statusLabel: 'Available now',
      statusTone: 'live',
      title: 'Computer saved file'
    },
    {
      cardId: 'github-gist',
      description: 'Use this lane for remote PGML files stored in a GitHub Gist. PGML fetches the Gist each time and saves only when you explicitly choose Save.',
      inventory: githubGistInventoryLabel.value,
      operations: [
        {
          description: githubGistError.value || 'Connect a Gist or open a remote `.pgml` file from the connected Gist.',
          icon: 'i-lucide-folder-open',
          items: githubGistItems.value,
          label: 'Open existing'
        },
        {
          description: 'Create a blank versioned `.pgml` file in the connected Gist, then open it in the studio.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          triggerAction: {
            id: 'create-github-gist-file:new',
            value: 'new'
          }
        },
        {
          description: 'Save the bundled multi-version PGML example as a new `.pgml` file in the connected Gist.',
          icon: 'i-lucide-flask-conical',
          label: 'Save example to Gist',
          triggerAction: {
            id: 'create-github-gist-file:example',
            value: 'example'
          }
        }
      ],
      importActions: [
        {
          description: 'Convert a text pg_dump into a new versioned `.pgml` file in the connected Gist, then open it in the studio.',
          id: 'open-pg-dump-import',
          label: 'Import into Gist',
          title: 'pg_dump',
          value: 'github-gist'
        },
        {
          description: 'Import DBML into a new versioned `.pgml` file in the connected Gist, with attachment review only when placement is ambiguous.',
          id: 'open-dbml-import',
          label: 'Import DBML into Gist',
          title: 'DBML',
          value: 'github-gist'
        }
      ],
      statusLabel: githubGistConnection.value ? 'Remote' : 'Connect',
      statusTone: githubGistConnection.value ? 'live' : 'placeholder',
      title: 'GitHub Gists'
    }
  ]
})

onMounted(() => {
  refreshSavedSchemas()
  void refreshRecentComputerFiles()
  void refreshGithubGistFiles()
})

onBeforeRouteLeave((to) => {
  if (!isStudioWorkspacePath(to.path)) {
    return
  }

  studioSessionStore.authorizeLaunchAccess()
})
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-8 lg:gap-10">
    <section class="grid min-w-0 gap-5 lg:grid-cols-3">
      <AppSourceLaunchCard
        v-for="card in sourceCards"
        :key="card.cardId"
        :card-id="card.cardId"
        :description="card.description"
        :import-actions="card.importActions"
        :inventory="card.inventory"
        :operations="card.operations"
        :status-label="card.statusLabel"
        :status-tone="card.statusTone"
        :title="card.title"
        @action="handleSourceCardAction"
      />
    </section>

    <section
      data-spec-banner="true"
      :class="specBannerClass"
    >
      <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div class="min-w-0">
          <div :class="studioSectionKickerClass">
            Spec guide
          </div>
          <h2 class="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[color:var(--studio-shell-text)]">
            Need the PGML spec before you open analysis, compare, and migrations?
          </h2>
          <p class="mt-2 max-w-3xl text-[0.9rem] leading-7 text-[color:var(--studio-shell-muted)]">
            Jump straight to the PGML spec for `VersionSet`, named `View` blocks, checkpoints, `SchemaMetadata`, DBML and pg_dump imports, executable placement, and history-aware SQL or Kysely migrations.
          </p>
        </div>

        <div class="shrink-0">
          <UButton
            to="/spec"
            label="Jump to spec"
            color="neutral"
            variant="ghost"
            :class="specBannerButtonClass"
          />
        </div>
      </div>
    </section>

    <ClientOnly>
      <AppDbmlImportModal
        :open="dbmlImportDialogOpen"
        :title="dbmlImportDialogCopy.title"
        :description="dbmlImportDialogCopy.description"
        :confirm-label="dbmlImportDialogCopy.confirmLabel"
        :input-description="dbmlImportDialogCopy.inputDescription"
        :fold-identifiers-to-lowercase="dbmlImportFoldIdentifiersToLowercase"
        :model-value="dbmlImportText"
        :parse-executable-comments="dbmlImportParseExecutableComments"
        :selected-file-name="dbmlImportSelectedFileName"
        :error-message="dbmlImportError"
        :is-submitting="isSubmittingDbmlImport"
        @update:open="handleDbmlImportDialogOpenChange"
        @update:fold-identifiers-to-lowercase="editImport({ foldIdentifiersToLowercase: $event })"
        @update:model-value="setDbmlImportText"
        @update:parse-executable-comments="editImport({ parseExecutableComments: $event })"
        @select-file="setDbmlImportFile"
        @clear-file="clearDbmlImportFile"
        @submit="submitDbmlImport"
        @after-leave="schemaImport.afterLeave('dbml')"
      />

      <AppPgDumpImportModal
        :open="pgDumpImportDialogOpen"
        :title="pgDumpImportDialogCopy.title"
        :description="pgDumpImportDialogCopy.description"
        :confirm-label="pgDumpImportDialogCopy.confirmLabel"
        :input-description="pgDumpImportDialogCopy.inputDescription"
        :fold-identifiers-to-lowercase="pgDumpImportFoldIdentifiersToLowercase"
        :model-value="pgDumpImportText"
        :selected-file-name="pgDumpImportSelectedFileName"
        :error-message="pgDumpImportError"
        :is-submitting="isSubmittingPgDumpImport"
        @update:open="handlePgDumpImportDialogOpenChange"
        @update:fold-identifiers-to-lowercase="editImport({ foldIdentifiersToLowercase: $event })"
        @update:model-value="setPgDumpImportText"
        @select-file="setPgDumpImportFile"
        @clear-file="clearPgDumpImportFile"
        @submit="submitPgDumpImport"
        @after-leave="schemaImport.afterLeave('pg_dump')"
      />

      <AppGithubGistConnectModal
        :open="githubGistConnectDialogOpen"
        :gist-id="githubGistId"
        :token="githubGistTokenInput"
        :error-message="githubGistConnectError"
        :is-submitting="isSubmittingGithubGistConnection"
        @update:open="handleGithubGistConnectDialogOpenChange"
        @update:gist-id="githubGistDialog.updateDraft({ gistId: $event })"
        @update:token="githubGistDialog.updateDraft({ token: $event })"
        @submit="submitGithubGistConnection"
        @after-leave="githubGistDialog.afterLeave"
      />

      <StudioModalFrame
        :open="importedSchemaLaunchDialogOpen"
        title="Open imported schema"
        description="Choose which workspace should open the imported document first. Diagram keeps the visual canvas and editor; Analysis skips both and opens directly into versions, compare, and migrations."
        surface-id="imported-schema-launch"
        body-class="grid gap-3 px-4 py-3"
        @update:open="importedSchemaLaunch.updateOpen"
        @after-leave="importedSchemaLaunch.afterLeave"
        @close="closeImportedSchemaLaunchDialog"
      >
        <div :class="computerFileAccessInfoPanelClass">
          <div :class="studioCompactFieldKickerClass">
            Imported schema
          </div>
          <p :class="studioBodyCopyClass">
            {{ pendingImportedSchemaLaunch ? pendingImportedSchemaLaunch.schemaName : 'Imported schema' }}
          </p>
        </div>

        <p
          v-if="pendingImportedSchemaLaunch && pendingImportedSchemaLaunch.error"
          role="alert"
          class="text-sm text-[color:var(--studio-shell-error)]"
        >
          {{ pendingImportedSchemaLaunch.error }}
        </p>
        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="modalSecondaryButtonClass"
            :disabled="isSubmittingImportedSchemaLaunch"
            @click="closeImportedSchemaLaunchDialog"
          />
          <UButton
            label="Open Diagram"
            color="neutral"
            variant="outline"
            :class="modalSecondaryButtonClass"
            :disabled="isSubmittingImportedSchemaLaunch"
            @click="launchImportedSchemaIntoWorkspace('diagram')"
          />
          <UButton
            label="Open Analysis"
            color="neutral"
            variant="soft"
            :class="modalPrimaryButtonClass"
            :loading="isSubmittingImportedSchemaLaunch"
            @click="launchImportedSchemaIntoWorkspace('analysis')"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="computerFileAccessDialogOpen"
        :title="computerFileAccessDialogCopy.title"
        description="PGML only asks for browser-managed access to the exact `.pgml` file you choose or reopen. Your browser still shows its own native picker or permission prompt next."
        surface-id="computer-file-access"
        body-class="grid gap-3 px-4 py-3"
        @update:open="computerFileAccessDialog.updateOpen"
        @after-leave="computerFileAccessDialog.afterLeave"
        @close="closeComputerFileAccessDialog"
      >
        <div :class="computerFileAccessInfoPanelClass">
          <div :class="studioCompactFieldKickerClass">
            Why PGML asks
          </div>
          <p :class="studioBodyCopyClass">
            PGML needs that file access so it can reopen the same schema later, keep autosave writing back to it, and keep the recent list accurate.
          </p>
        </div>

        <div :class="computerFileAccessInfoPanelClass">
          <div :class="studioCompactFieldKickerClass">
            What PGML can access
          </div>
          <p :class="studioBodyCopyClass">
            Only the file you choose or the recent file you explicitly reopen. PGML does not get access to the rest of your computer.
          </p>
        </div>

        <div :class="computerFileAccessInfoPanelClass">
          <div :class="studioCompactFieldKickerClass">
            What happens next
          </div>
          <p :class="studioBodyCopyClass">
            {{ computerFileAccessDialogCopy.nextStepDescription }}
          </p>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="modalSecondaryButtonClass"
            :disabled="isConfirmingComputerFileAction"
            @click="closeComputerFileAccessDialog"
          />
          <UButton
            :label="computerFileAccessDialogCopy.confirmLabel"
            color="neutral"
            variant="soft"
            :class="modalPrimaryButtonClass"
            :loading="isConfirmingComputerFileAction"
            @click="confirmComputerFileAccessAction"
          />
        </template>
      </StudioModalFrame>
    </ClientOnly>
  </div>
</template>
