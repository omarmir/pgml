<script setup lang="ts">
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import {
  exampleSchemaName,
  formatSavedPgmlSchemaTime,
  untitledSchemaName
} from '~/utils/studio-browser-schemas'
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
  inventory: string
  operations: SourceCardOperation[]
  sqlDumpAction: {
    id: string
    value: SourceCardId
  }
  sqlDumpLabel: string
  sqlDumpDescription: string
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

const computerFileAccessDialogOpen: Ref<boolean> = ref(false)
const isConfirmingComputerFileAction: Ref<boolean> = ref(false)
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
const pgDumpImportConflictErrorMessage = 'Choose either pasted pg_dump text or a file upload, not both.'
const pgDumpImportMissingInputErrorMessage = 'Paste pg_dump text or choose a text dump file before importing.'
const pgDumpImportTargetByCardId: Record<SourceCardId, PgDumpImportTarget> = {
  'browser-local-storage': 'browser',
  'computer-saved-file': 'file',
  'hosted-database': 'hosted'
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
const buildVersionedPgmlText = (input: {
  initialVersionName?: string
  name: string
  role?: 'design' | 'implementation'
  snapshotSource: string
}) => {
  const normalizedSnapshotSource = input.snapshotSource.trim()

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
const resetPgDumpImportDialog = () => {
  pgDumpImportDialogOpen.value = false
  pgDumpImportError.value = null
  pgDumpImportSelectedFile.value = null
  pgDumpImportTarget.value = null
  pgDumpImportText.value = ''
}
const syncPgDumpImportConflictError = () => {
  const hasFile = pgDumpImportSelectedFile.value !== null
  const hasText = pgDumpImportText.value.trim().length > 0

  if (hasFile && hasText) {
    pgDumpImportError.value = pgDumpImportConflictErrorMessage
    return false
  }

  if (pgDumpImportError.value !== null) {
    pgDumpImportError.value = null
  }

  return true
}
const openPgDumpImportDialog = (cardId: SourceCardId) => {
  pgDumpImportDialogOpen.value = true
  pgDumpImportError.value = null
  pgDumpImportSelectedFile.value = null
  pgDumpImportTarget.value = pgDumpImportTargetByCardId[cardId]
  pgDumpImportText.value = ''
}
const closePgDumpImportDialog = () => {
  if (isSubmittingPgDumpImport.value) {
    return
  }

  resetPgDumpImportDialog()
}
const handlePgDumpImportDialogOpenChange = (nextOpen: boolean) => {
  if (nextOpen) {
    pgDumpImportDialogOpen.value = true
    return
  }

  closePgDumpImportDialog()
}
const setPgDumpImportText = (value: string) => {
  pgDumpImportText.value = value
  syncPgDumpImportConflictError()
}
const setPgDumpImportFile = (files: FileList | null) => {
  pgDumpImportSelectedFile.value = files?.[0] || null
  syncPgDumpImportConflictError()
}
const clearPgDumpImportFile = () => {
  pgDumpImportSelectedFile.value = null
  syncPgDumpImportConflictError()
}
const submitPgDumpImport = async () => {
  const importTarget = pgDumpImportTarget.value

  if (!importTarget) {
    return
  }

  if (!syncPgDumpImportConflictError()) {
    return
  }

  const selectedFile = pgDumpImportSelectedFile.value
  const trimmedText = pgDumpImportText.value.trim()

  if (!selectedFile && trimmedText.length === 0) {
    pgDumpImportError.value = pgDumpImportMissingInputErrorMessage
    return
  }

  isSubmittingPgDumpImport.value = true

  try {
    const importedSql = selectedFile ? await selectedFile.text() : pgDumpImportText.value
    const importedSchema = convertPgDumpToPgml({
      preferredName: selectedFile?.name,
      sql: importedSql
    })

    resetPgDumpImportDialog()

    if (importTarget === 'file') {
      queueComputerFileAccessAction({
        kind: 'create-import',
        schemaName: importedSchema.schemaName,
        text: buildVersionedPgmlText({
          initialVersionName: 'Initial implementation',
          name: importedSchema.schemaName,
          role: 'implementation',
          snapshotSource: importedSchema.pgml
        })
      })
      return
    }

    await createBrowserSchemaFromImport({
      name: importedSchema.schemaName,
      snapshotSource: importedSchema.pgml
    })
  } catch (error) {
    pgDumpImportError.value = getActionErrorMessage(error, 'Unable to import that pg_dump.')
  } finally {
    isSubmittingPgDumpImport.value = false
  }
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
const pgDumpImportSelectedFileName = computed(() => {
  return pgDumpImportSelectedFile.value?.name || ''
})
const pgDumpImportDialogCopy = computed(() => {
  if (pgDumpImportTarget.value === 'file') {
    return {
      confirmLabel: 'Import into new file',
      description: 'Paste a text pg_dump or upload a text dump file. PGML will convert the schema objects first, then ask where the new `.pgml` file should be saved.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections.',
      title: 'Import pg_dump into a new computer file'
    }
  }

  if (pgDumpImportTarget.value === 'hosted') {
    return {
      confirmLabel: 'Import into browser storage',
      description: 'Paste a text pg_dump or upload a text dump file. Hosted persistence is still a placeholder, so this import opens as a browser-backed PGML schema for now.',
      inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections.',
      title: 'Import pg_dump from the hosted lane'
    }
  }

  return {
    confirmLabel: 'Import into browser storage',
    description: 'Paste a text pg_dump or upload a text dump file. PGML will convert the schema objects and open them in browser local storage.',
    inputDescription: 'Use one input method only. PGML imports schema objects from SQL and skips table data from COPY sections.',
    title: 'Import pg_dump into browser storage'
  }
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
      description: 'Resume a schema saved in this browser, start a blank PGML document, or open the bundled example before entering the studio.',
      inventory: browserSchemaCountLabel.value,
      operations: [
        {
          description: 'Open a schema already saved in this browser and continue editing it in the studio.',
          icon: 'i-lucide-folder-open',
          items: browserExistingItems.value,
          label: 'Open existing'
        },
        {
          description: 'Open a blank PGML document and begin a schema directly in browser storage.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          to: {
            path: '/diagram',
            query: browserNewQuery
          }
        },
        {
          description: 'Load the bundled PGML example so you can explore the studio from a known starting point.',
          icon: 'i-lucide-flask-conical',
          label: 'Open bundled example',
          to: {
            path: '/diagram',
            query: browserExampleQuery
          }
        }
      ],
      sqlDumpAction: {
        id: 'open-pg-dump-import',
        value: 'browser-local-storage'
      },
      sqlDumpLabel: 'Import into browser storage',
      sqlDumpDescription: 'Convert a text pg_dump into a browser-backed PGML schema and open it directly in the studio.',
      statusLabel: 'Available now',
      statusTone: 'live',
      title: 'Browser local storage'
    },
    {
      cardId: 'computer-saved-file',
      description: 'Use this lane for local `.pgml` files, whether that means reopening a recent file, starting blank, or saving the bundled example.',
      inventory: computerFileCountLabel.value,
      operations: [
        {
          description: 'Choose a `.pgml` file from your computer or reopen one from the recent list below.',
          icon: 'i-lucide-folder-open',
          items: computerFileItems.value,
          label: 'Open existing'
        },
        {
          description: 'Create a blank `.pgml` file first, then open it in the studio with that file as the active target.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          triggerAction: {
            id: 'create-computer-file:new',
            value: 'new'
          }
        },
        {
          description: 'Save the bundled PGML example to a new `.pgml` file first, then continue editing that file in the studio.',
          icon: 'i-lucide-flask-conical',
          label: 'Save example to a new file',
          triggerAction: {
            id: 'create-computer-file:example',
            value: 'example'
          }
        }
      ],
      sqlDumpAction: {
        id: 'open-pg-dump-import',
        value: 'computer-saved-file'
      },
      sqlDumpLabel: 'Import into a new file',
      sqlDumpDescription: 'Convert a text pg_dump into a new computer-backed `.pgml` file, then keep autosave pointed at that file.',
      statusLabel: 'Available now',
      statusTone: 'live',
      title: 'Computer saved file'
    },
    {
      cardId: 'hosted-database',
      description: 'Use this lane for hosted database sources, whether that means resuming an import, starting blank, or opening a hosted example.',
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
      sqlDumpAction: {
        id: 'open-pg-dump-import',
        value: 'hosted-database'
      },
      sqlDumpLabel: 'Import from hosted lane',
      sqlDumpDescription: 'Convert a text pg_dump from this lane now, then open it in browser storage while hosted persistence stays in progress.',
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
        :inventory="card.inventory"
        :operations="card.operations"
        :sql-dump-action="card.sqlDumpAction"
        :sql-dump-label="card.sqlDumpLabel"
        :sql-dump-description="card.sqlDumpDescription"
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
            Need the language reference before you open the studio?
          </h2>
          <p class="mt-2 max-w-3xl text-[0.9rem] leading-7 text-[color:var(--studio-shell-muted)]">
            Jump straight to the PGML spec for examples, syntax details, and the current language surface area.
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
