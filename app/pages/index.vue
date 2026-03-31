<script setup lang="ts">
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppDbmlImportModal from '~/components/app/AppDbmlImportModal.vue'
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
  type FileStudioLaunchRequest
} from '~/utils/studio-launch'

type SourceCardId = 'browser-local-storage' | 'computer-saved-file' | 'hosted-database'
type PgDumpImportTarget = 'browser' | 'file' | 'hosted'

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
  }
  | { kind: 'create-new' }
  | { kind: 'open-picker' }
  | { kind: 'open-recent', recentFileId: string }

type ImportedSchemaResult = {
  pgml: string
  schemaName: string
}

type ImportDialogState = {
  dialogOpen: Ref<boolean>
  error: Ref<string | null>
  isSubmitting: Ref<boolean>
  selectedFile: Ref<File | null>
  target: Ref<PgDumpImportTarget | null>
  text: Ref<string>
}

type ImportDialogCopy = {
  confirmLabel: string
  description: string
  inputDescription: string
  title: string
}

const computerFileAccessDialogOpen: Ref<boolean> = ref(false)
const dbmlImportDialogOpen: Ref<boolean> = ref(false)
const dbmlImportError: Ref<string | null> = ref(null)
const dbmlImportParseExecutableComments: Ref<boolean> = ref(false)
const dbmlImportSelectedFile: Ref<File | null> = ref(null)
const dbmlImportTarget: Ref<PgDumpImportTarget | null> = ref(null)
const dbmlImportText: Ref<string> = ref('')
const isConfirmingComputerFileAction: Ref<boolean> = ref(false)
const isSubmittingDbmlImport: Ref<boolean> = ref(false)
const isSubmittingPgDumpImport: Ref<boolean> = ref(false)
const pendingComputerFileAction: Ref<PendingComputerFileAction | null> = ref(null)
const pgDumpImportDialogOpen: Ref<boolean> = ref(false)
const pgDumpImportError: Ref<string | null> = ref(null)
const pgDumpImportSelectedFile: Ref<File | null> = ref(null)
const pgDumpImportTarget: Ref<PgDumpImportTarget | null> = ref(null)
const pgDumpImportText: Ref<string> = ref('')
const browserNewQuery = buildBrowserStudioNewQuery()
const browserExampleQuery = buildBrowserStudioExampleQuery()
const studioSessionStore = useStudioSessionStore()
const studioSourcesStore = useStudioSourcesStore()
const {
  browserSchemas: savedSchemas,
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
  'hosted-database': 'hosted'
}
const dbmlImportState: ImportDialogState = {
  dialogOpen: dbmlImportDialogOpen,
  error: dbmlImportError,
  isSubmitting: isSubmittingDbmlImport,
  selectedFile: dbmlImportSelectedFile,
  target: dbmlImportTarget,
  text: dbmlImportText
}
const pgDumpImportState: ImportDialogState = {
  dialogOpen: pgDumpImportDialogOpen,
  error: pgDumpImportError,
  isSubmitting: isSubmittingPgDumpImport,
  selectedFile: pgDumpImportSelectedFile,
  target: pgDumpImportTarget,
  text: pgDumpImportText
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
const resetImportDialogState = (state: ImportDialogState) => {
  state.dialogOpen.value = false
  state.error.value = null
  state.selectedFile.value = null
  state.target.value = null
  state.text.value = ''
}
const syncImportConflictError = (input: {
  conflictErrorMessage: string
  state: ImportDialogState
}) => {
  const hasFile = input.state.selectedFile.value !== null
  const hasText = input.state.text.value.trim().length > 0

  if (hasFile && hasText) {
    input.state.error.value = input.conflictErrorMessage
    return false
  }

  if (input.state.error.value !== null) {
    input.state.error.value = null
  }

  return true
}
const openImportDialogForCard = (state: ImportDialogState, cardId: SourceCardId) => {
  resetImportDialogState(state)
  state.dialogOpen.value = true
  state.target.value = sourceImportTargetByCardId[cardId]
}
const closeImportDialog = (state: ImportDialogState) => {
  if (state.isSubmitting.value) {
    return
  }

  resetImportDialogState(state)
}
const handleImportDialogOpenChange = (state: ImportDialogState, nextOpen: boolean) => {
  if (nextOpen) {
    state.dialogOpen.value = true
    return
  }

  closeImportDialog(state)
}
const setImportText = (
  state: ImportDialogState,
  value: string,
  conflictErrorMessage: string
) => {
  state.text.value = value
  syncImportConflictError({
    conflictErrorMessage,
    state
  })
}
const setImportFile = (
  state: ImportDialogState,
  files: FileList | null,
  conflictErrorMessage: string
) => {
  state.selectedFile.value = files?.[0] || null
  syncImportConflictError({
    conflictErrorMessage,
    state
  })
}
const clearImportFile = (state: ImportDialogState, conflictErrorMessage: string) => {
  state.selectedFile.value = null
  syncImportConflictError({
    conflictErrorMessage,
    state
  })
}
const submitImportedSchema = async (input: {
  conflictErrorMessage: string
  convert: (input: {
    preferredName?: string | null
    sourceText: string
  }) => ImportedSchemaResult
  fallbackErrorMessage: string
  missingInputErrorMessage: string
  state: ImportDialogState
}) => {
  const importTarget = input.state.target.value

  if (!importTarget) {
    return
  }

  if (!syncImportConflictError({
    conflictErrorMessage: input.conflictErrorMessage,
    state: input.state
  })) {
    return
  }

  const selectedFile = input.state.selectedFile.value
  const trimmedText = input.state.text.value.trim()

  if (!selectedFile && trimmedText.length === 0) {
    input.state.error.value = input.missingInputErrorMessage
    return
  }

  input.state.isSubmitting.value = true

  try {
    const importedSource = selectedFile ? await selectedFile.text() : input.state.text.value
    const importedSchema = input.convert({
      preferredName: selectedFile?.name,
      sourceText: importedSource
    })

    resetImportDialogState(input.state)
    await finishImportedSchemaLaunch({
      importTarget,
      schemaName: importedSchema.schemaName,
      snapshotSource: importedSchema.pgml
    })
  } catch (error) {
    input.state.error.value = getActionErrorMessage(error, input.fallbackErrorMessage)
  } finally {
    input.state.isSubmitting.value = false
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
const finishImportedSchemaLaunch = async (input: {
  importTarget: PgDumpImportTarget
  schemaName: string
  snapshotSource: string
}) => {
  // Browser imports become saved browser documents immediately. File imports
  // queue the file-system permission dialog first so the actual save target is
  // still chosen by the user.
  if (input.importTarget === 'file') {
    queueComputerFileAccessAction({
      kind: 'create-import',
      schemaName: input.schemaName,
      text: buildVersionedPgmlText({
        initialVersionName: 'Initial implementation',
        name: input.schemaName,
        role: 'implementation',
        snapshotSource: input.snapshotSource
      })
    })
    return
  }

  await createBrowserSchemaFromImport({
    name: input.schemaName,
    snapshotSource: input.snapshotSource
  })
}
const createBrowserSchemaFromImport = async (input: {
  name: string
  snapshotSource: string
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
    path: '/diagram',
    query: buildBrowserStudioSavedQuery(createdSchema.id)
  })

  return true
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
  preloadedFile?: {
    entry: PgmlRecentComputerFile
    text: string
  }
) => {
  if (preloadedFile) {
    studioSessionStore.primePreloadedFileLaunch(buildFileLaunchRequest(recentFileId), preloadedFile)
  }

  await router.push({
    path: '/diagram',
    query: buildFileStudioRecentQuery(recentFileId)
  })
}
const openComputerFileFromPicker = async () => {
  try {
    const loadedFile = await openComputerPgmlFile()

    if (!loadedFile) {
      return
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(loadedFile.entry.id, loadedFile)
  } catch (error) {
    pushComputerFileActionErrorToast(getActionErrorMessage(error, 'Unable to open the selected file.'))
  }
}
const createComputerFile = async (input: {
  name: string
  text: string
}) => {
  try {
    const createdFile = await createComputerPgmlFile(input)

    if (!createdFile) {
      return
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(createdFile.entry.id, createdFile)
  } catch (error) {
    pushSaveErrorToast(getActionErrorMessage(error, 'Unable to save to the selected file.'))
  }
}
const createComputerFileFromLaunch = async (launchType: 'example' | 'new') => {
  await createComputerFile({
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
      return
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(loadedFile.entry.id, loadedFile)
  } catch (error) {
    pushComputerFileActionErrorToast(getActionErrorMessage(error, 'Unable to reopen the selected file.'))
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
const queueComputerFileAccessAction = (action: PendingComputerFileAction) => {
  pendingComputerFileAction.value = action
  computerFileAccessDialogOpen.value = true
}
const openDbmlImportDialog = (cardId: SourceCardId) => {
  dbmlImportParseExecutableComments.value = false
  openImportDialogForCard(dbmlImportState, cardId)
}
const openPgDumpImportDialog = (cardId: SourceCardId) => {
  openImportDialogForCard(pgDumpImportState, cardId)
}
const handlePgDumpImportDialogOpenChange = (nextOpen: boolean) => {
  handleImportDialogOpenChange(pgDumpImportState, nextOpen)
}
const handleDbmlImportDialogOpenChange = (nextOpen: boolean) => {
  if (nextOpen) {
    dbmlImportParseExecutableComments.value = false
    dbmlImportState.dialogOpen.value = true
    return
  }

  dbmlImportParseExecutableComments.value = false
  closeImportDialog(dbmlImportState)
}
const setDbmlImportText = (value: string) => {
  setImportText(dbmlImportState, value, dbmlImportConflictErrorMessage)
}
const setDbmlImportFile = (files: FileList | null) => {
  setImportFile(dbmlImportState, files, dbmlImportConflictErrorMessage)
}
const clearDbmlImportFile = () => {
  clearImportFile(dbmlImportState, dbmlImportConflictErrorMessage)
}
const submitDbmlImport = async () => {
  await submitImportedSchema({
    conflictErrorMessage: dbmlImportConflictErrorMessage,
    convert: ({ preferredName, sourceText }) => {
      return convertDbmlToPgml({
        dbml: sourceText,
        parseExecutableComments: dbmlImportParseExecutableComments.value,
        preferredName
      })
    },
    fallbackErrorMessage: 'Unable to import that DBML.',
    missingInputErrorMessage: dbmlImportMissingInputErrorMessage,
    state: dbmlImportState
  })
}
const setPgDumpImportText = (value: string) => {
  setImportText(pgDumpImportState, value, pgDumpImportConflictErrorMessage)
}
const setPgDumpImportFile = (files: FileList | null) => {
  setImportFile(pgDumpImportState, files, pgDumpImportConflictErrorMessage)
}
const clearPgDumpImportFile = () => {
  clearImportFile(pgDumpImportState, pgDumpImportConflictErrorMessage)
}
const submitPgDumpImport = async () => {
  await submitImportedSchema({
    conflictErrorMessage: pgDumpImportConflictErrorMessage,
    convert: ({ preferredName, sourceText }) => {
      return convertPgDumpToPgml({
        preferredName,
        sql: sourceText
      })
    },
    fallbackErrorMessage: 'Unable to import that pg_dump.',
    missingInputErrorMessage: pgDumpImportMissingInputErrorMessage,
    state: pgDumpImportState
  })
}
const closeComputerFileAccessDialog = () => {
  if (isConfirmingComputerFileAction.value) {
    return
  }

  computerFileAccessDialogOpen.value = false
  pendingComputerFileAction.value = null
}
const confirmComputerFileAccessAction = async () => {
  const pendingAction = pendingComputerFileAction.value

  if (!pendingAction) {
    return
  }

  computerFileAccessDialogOpen.value = false
  isConfirmingComputerFileAction.value = true

  try {
    if (pendingAction.kind === 'open-picker') {
      await openComputerFileFromPicker()
      return
    }

    if (pendingAction.kind === 'open-recent') {
      await openRecentComputerFileFromLaunch(pendingAction.recentFileId)
      return
    }

    if (pendingAction.kind === 'create-new') {
      await createComputerFileFromLaunch('new')
      return
    }

    if (pendingAction.kind === 'create-import') {
      await createComputerFile({
        name: pendingAction.schemaName,
        text: pendingAction.text
      })
      return
    }

    await createComputerFileFromLaunch('example')
  } finally {
    isConfirmingComputerFileAction.value = false
    pendingComputerFileAction.value = null
  }
}
const handleSourceCardAction = async (payload: {
  actionId: string
  cardId: string
  value: string
}) => {
  if (payload.actionId === 'open-dbml-import') {
    openDbmlImportDialog(payload.value as SourceCardId)
    return
  }

  if (payload.actionId === 'open-pg-dump-import') {
    openPgDumpImportDialog(payload.value as SourceCardId)
    return
  }

  if (payload.cardId === 'browser-local-storage' && payload.actionId === 'delete-saved-schema') {
    deleteBrowserSavedSchema(payload.value)
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
    hosted: {
      confirmLabel: 'Import into browser storage',
      description: 'Paste DBML text or upload a DBML file. Hosted persistence is still a placeholder, so this import opens as a browser-backed PGML schema for now after validating the schema surface, optionally extracting recognized SQL entities from block comments, inferring obvious executable attachments, and showing progress while the import is prepared.',
      inputDescription: 'Use one input method only. PGML imports the DBML-compatible table, enum, and ref surface it already understands. You can also opt into comment parsing for functions, triggers, procedures, sequences, and simple indexes when they are embedded in block comments. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import DBML from the hosted lane'
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
    hosted: {
      confirmLabel: 'Import into browser storage',
      description: 'Paste a text pg_dump or upload a text dump file. Hosted persistence is still a placeholder, so this import opens as a browser-backed PGML schema for now after converting the schema objects, inferring obvious executable attachments, and showing progress while the import is prepared.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections. If an imported executable still has ambiguous placement, PGML pauses for a table-selection review before replacing the workspace.',
      title: 'Import pg_dump from the hosted lane'
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
      cardId: 'hosted-database',
      description: 'Use this lane for hosted database sources, whether that means resuming an import, starting blank, or opening a hosted example once the hosted workflow is wired in.',
      inventory: 'Placeholder',
      operations: [
        {
          description: 'Saved hosted connections and imported schemas will appear here once the hosted workflow is implemented.',
          icon: 'i-lucide-folder-open',
          items: [{
            description: 'Placeholder only.',
            label: 'Hosted database sources will be listed here.'
          }],
          label: 'Open existing'
        },
        {
          description: 'Open a blank PGML document for a hosted workflow once database connection support is wired in.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          placeholder: true
        },
        {
          description: 'Load a bundled example for the hosted workflow once database connection support is wired in.',
          icon: 'i-lucide-flask-conical',
          label: 'Preview hosted example',
          placeholder: true
        }
      ],
      importActions: [
        {
          description: 'Convert a text pg_dump from this lane now, show progress while it is prepared, and open it in browser storage as a versioned PGML document while hosted persistence stays in progress.',
          id: 'open-pg-dump-import',
          label: 'Import from hosted lane',
          title: 'pg_dump',
          value: 'hosted-database'
        },
        {
          description: 'Import DBML from this lane now, extract supported executable objects, and open it in browser storage as a versioned PGML document while hosted persistence stays in progress.',
          id: 'open-dbml-import',
          label: 'Import DBML from hosted lane',
          title: 'DBML',
          value: 'hosted-database'
        }
      ],
      statusLabel: 'Placeholder',
      statusTone: 'placeholder',
      title: 'Hosted database'
    }
  ]
})

onMounted(() => {
  refreshSavedSchemas()
  void refreshRecentComputerFiles()
})

onBeforeRouteLeave((to) => {
  if (to.path !== '/diagram') {
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
            Need the PGML spec before you open versioning, compare, and migrations?
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
        :model-value="dbmlImportText"
        :parse-executable-comments="dbmlImportParseExecutableComments"
        :selected-file-name="dbmlImportSelectedFileName"
        :error-message="dbmlImportError"
        :is-submitting="isSubmittingDbmlImport"
        @update:open="handleDbmlImportDialogOpenChange"
        @update:model-value="setDbmlImportText"
        @update:parse-executable-comments="dbmlImportParseExecutableComments = $event"
        @select-file="setDbmlImportFile"
        @clear-file="clearDbmlImportFile"
        @submit="submitDbmlImport"
      />

      <AppPgDumpImportModal
        :open="pgDumpImportDialogOpen"
        :title="pgDumpImportDialogCopy.title"
        :description="pgDumpImportDialogCopy.description"
        :confirm-label="pgDumpImportDialogCopy.confirmLabel"
        :input-description="pgDumpImportDialogCopy.inputDescription"
        :model-value="pgDumpImportText"
        :selected-file-name="pgDumpImportSelectedFileName"
        :error-message="pgDumpImportError"
        :is-submitting="isSubmittingPgDumpImport"
        @update:open="handlePgDumpImportDialogOpenChange"
        @update:model-value="setPgDumpImportText"
        @select-file="setPgDumpImportFile"
        @clear-file="clearPgDumpImportFile"
        @submit="submitPgDumpImport"
      />

      <StudioModalFrame
        v-model:open="computerFileAccessDialogOpen"
        :title="computerFileAccessDialogCopy.title"
        description="PGML only asks for browser-managed access to the exact `.pgml` file you choose or reopen. Your browser still shows its own native picker or permission prompt next."
        surface-id="computer-file-access"
        body-class="grid gap-3 px-4 py-3"
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
