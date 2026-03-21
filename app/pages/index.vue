<script setup lang="ts">
import type { Ref } from 'vue'
import type { SavedPgmlSchema } from '~/composables/usePgmlStudioSchemas'
import {
  formatSavedPgmlSchemaTime,
  persistSavedPgmlSchemasToBrowserStorage,
  readSavedPgmlSchemasFromBrowserStorage
} from '~/composables/usePgmlStudioSchemas'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioSectionKickerClass
} from '~/utils/uiStyles'
import {
  buildBrowserStudioExampleQuery,
  buildBrowserStudioNewQuery,
  buildBrowserStudioSavedQuery
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

const savedSchemas: Ref<SavedPgmlSchema[]> = ref([])
const browserNewQuery = buildBrowserStudioNewQuery()
const browserExampleQuery = buildBrowserStudioExampleQuery()
const specBannerClass = joinStudioClasses(
  'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-5 py-5 sm:px-6 sm:py-6'
)
const specBannerButtonClass = studioButtonClasses.ghost

const refreshSavedSchemas = () => {
  savedSchemas.value = readSavedPgmlSchemasFromBrowserStorage()
}
const deleteBrowserSavedSchema = (schemaId: string) => {
  const nextSavedSchemas = savedSchemas.value.filter(schema => schema.id !== schemaId)

  if (!persistSavedPgmlSchemasToBrowserStorage(nextSavedSchemas)) {
    return
  }

  savedSchemas.value = nextSavedSchemas
}
const handleSourceCardItemAction = (payload: {
  actionId: string
  cardId: string
  value: string
}) => {
  if (payload.cardId !== 'browser-local-storage' || payload.actionId !== 'delete-saved-schema') {
    return
  }

  deleteBrowserSavedSchema(payload.value)
}

const browserSchemaCountLabel = computed(() => {
  const schemaCount = savedSchemas.value.length

  return `${schemaCount} saved schema${schemaCount === 1 ? '' : 's'}`
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
      description: 'Use this lane for local `.pgml` files, whether that means resuming an upload, starting blank, or opening a file-based example.',
      inventory: 'Placeholder',
      operations: [
        {
          description: 'Recent `.pgml` uploads will appear here once the local file workflow is implemented.',
          icon: 'i-lucide-folder-open',
          items: [{
            description: 'Placeholder only.',
            label: 'File-backed schemas will be listed here.'
          }],
          label: 'Open existing'
        },
        {
          description: 'Open a blank PGML document for a file-backed workflow once local file support is wired in.',
          icon: 'i-lucide-square-pen',
          label: 'Start new',
          placeholder: true
        },
        {
          description: 'Load a bundled example for the file-backed workflow once local file support is wired in.',
          icon: 'i-lucide-flask-conical',
          label: 'Start from example',
          placeholder: true
        }
      ],
      sqlDumpDescription: 'Import a SQL dump from disk into the file-backed workflow from this card once it is implemented.',
      statusLabel: 'Placeholder',
      statusTone: 'placeholder',
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
        @item-action="handleSourceCardItemAction"
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
  </div>
</template>
