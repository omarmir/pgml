<script setup lang="ts">
import type { Ref } from 'vue'
import type { SavedPgmlSchema } from '~/composables/usePgmlStudioSchemas'
import {
  exampleSchemaName,
  formatSavedPgmlSchemaTime,
  persistSavedPgmlSchemasToBrowserStorage,
  readSavedPgmlSchemasFromBrowserStorage,
  untitledSchemaName
} from '~/composables/usePgmlStudioSchemas'
import type { PgmlRecentComputerFile } from '~/utils/computer-files'
import {
  createComputerPgmlFile,
  getRecentComputerPgmlFilePermissionState,
  loadRecentComputerPgmlFile,
  listRecentComputerPgmlFiles,
  openComputerPgmlFile
} from '~/utils/computer-files'
import { pgmlExample } from '~/utils/pgml'
import {
  joinStudioClasses,
  studioBodyCopyClass,
  studioButtonClasses,
  studioCompactFieldKickerClass,
  studioSectionKickerClass
} from '~/utils/uiStyles'
import {
  authorizeStudioLaunchAccess,
  buildBrowserStudioExampleQuery,
  buildBrowserStudioNewQuery,
  buildBrowserStudioSavedQuery,
  buildFileStudioRecentQuery,
  primePreloadedFileStudioLaunch,
  type FileStudioLaunchRequest
} from '~/utils/studio-launch'

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
  cardId: string
  description: string
  inventory: string
  operations: SourceCardOperation[]
  sqlDumpDescription: string
  statusLabel: string
  statusTone: 'live' | 'placeholder'
  title: string
}

type PendingComputerFileAction
  = { kind: 'create-example' }
    | { kind: 'create-new' }
    | { kind: 'open-picker' }
    | { kind: 'open-recent', recentFileId: string }

const savedSchemas: Ref<SavedPgmlSchema[]> = ref([])
const recentComputerFiles: Ref<PgmlRecentComputerFile[]> = ref([])
const computerFileAccessDialogOpen: Ref<boolean> = ref(false)
const isConfirmingComputerFileAction: Ref<boolean> = ref(false)
const pendingComputerFileAction: Ref<PendingComputerFileAction | null> = ref(null)
const browserNewQuery = buildBrowserStudioNewQuery()
const browserExampleQuery = buildBrowserStudioExampleQuery()
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

const refreshSavedSchemas = () => {
  savedSchemas.value = readSavedPgmlSchemasFromBrowserStorage()
}
const refreshRecentComputerFiles = async () => {
  recentComputerFiles.value = await listRecentComputerPgmlFiles()
}
const deleteBrowserSavedSchema = (schemaId: string) => {
  const nextSavedSchemas = savedSchemas.value.filter(schema => schema.id !== schemaId)

  if (!persistSavedPgmlSchemasToBrowserStorage(nextSavedSchemas)) {
    pushSaveErrorToast('Unable to save to local storage.')
    return
  }

  savedSchemas.value = nextSavedSchemas
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
    primePreloadedFileStudioLaunch(buildFileLaunchRequest(recentFileId), preloadedFile)
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
const createComputerFileFromLaunch = async (launchType: 'example' | 'new') => {
  try {
    const createdFile = await createComputerPgmlFile({
      name: launchType === 'example' ? exampleSchemaName : untitledSchemaName,
      text: launchType === 'example' ? pgmlExample : ''
    })

    if (!createdFile) {
      return
    }

    await refreshRecentComputerFiles()
    await navigateToRecentComputerFile(createdFile.entry.id, createdFile)
  } catch (error) {
    pushSaveErrorToast(getActionErrorMessage(error, 'Unable to save to the selected file.'))
  }
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

  return {
    confirmLabel: 'Continue to save dialog',
    nextStepDescription: 'The next step opens the browser save dialog so you can choose where the example `.pgml` file should be created.',
    title: 'Create an example file on your computer'
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
          label: 'Start from example',
          to: {
            path: '/diagram',
            query: browserExampleQuery
          }
        }
      ],
      sqlDumpDescription: 'Import a SQL dump into browser storage from this card once that ingestion path is implemented.',
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
          label: 'Start from example',
          triggerAction: {
            id: 'create-computer-file:example',
            value: 'example'
          }
        }
      ],
      sqlDumpDescription: 'Import a SQL dump from disk into a new computer-backed `.pgml` file from this card once that path is implemented.',
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
          label: 'Start from example',
          placeholder: true
        }
      ],
      sqlDumpDescription: 'Import a SQL dump through the hosted workflow from this card once that ingestion path is implemented.',
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

  authorizeStudioLaunchAccess()
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
