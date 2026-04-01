<script setup lang="ts">
import { nanoid } from 'nanoid'
import { studioInputMenuUi, studioSelectUi } from '~/constants/ui'
import type {
  PgmlDetailMetadataAffectsDraft,
  PgmlDetailMetadataDraftKind,
  PgmlDetailMetadataKeyValueItem,
  PgmlDetailMetadataListItem,
  PgmlDetailPopoverMetadataDraft
} from '~/utils/pgml-detail-popover-metadata'
import { clonePgmlDetailPopoverMetadataDraft } from '~/utils/pgml-detail-popover-metadata'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioCompactFieldKickerClass,
  studioEmptyStateClass,
  studioPanelSurfaceClass,
  textareaClass
} from '~/utils/uiStyles'

type AffectsListKey = Exclude<keyof PgmlDetailMetadataAffectsDraft, 'extras'>
type KnownListKey = 'indexColumns' | 'triggerArguments' | 'triggerEvents'

type SelectItem = {
  label: string
  value: string
}

const {
  description = '',
  modelValue,
  originalValue,
  routineItems = [],
  title = 'Editing metadata'
} = defineProps<{
  description?: string
  modelValue: PgmlDetailPopoverMetadataDraft
  originalValue: PgmlDetailPopoverMetadataDraft
  routineItems?: SelectItem[]
  title?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: PgmlDetailPopoverMetadataDraft]
}>()

const helperDescription = computed(() => {
  if (description.trim().length > 0) {
    return description
  }

  return 'Edit the structured PGML metadata for this item with dedicated fields for docs, affects, and supported executable settings.'
})

const affectSections: Array<{ key: AffectsListKey, label: string }> = [
  { key: 'writes', label: 'Writes' },
  { key: 'reads', label: 'Reads' },
  { key: 'dependsOn', label: 'Depends on' },
  { key: 'sets', label: 'Sets' },
  { key: 'calls', label: 'Calls' },
  { key: 'uses', label: 'Uses' },
  { key: 'ownedBy', label: 'Owned by' }
]

const languageItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'plpgsql', value: 'plpgsql' },
  { label: 'sql', value: 'sql' },
  { label: 'plpython3u', value: 'plpython3u' },
  { label: 'plv8', value: 'plv8' },
  { label: 'plperl', value: 'plperl' }
]
const volatilityItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'Volatile', value: 'volatile' },
  { label: 'Stable', value: 'stable' },
  { label: 'Immutable', value: 'immutable' }
]
const securityItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'Invoker', value: 'invoker' },
  { label: 'Definer', value: 'definer' }
]
const triggerTimingItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'Before', value: 'before' },
  { label: 'After', value: 'after' },
  { label: 'Instead of', value: 'instead of' }
]
const triggerLevelItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'Row', value: 'row' },
  { label: 'Statement', value: 'statement' }
]
const triggerEventItems: SelectItem[] = [
  { label: 'Insert', value: 'insert' },
  { label: 'Update', value: 'update' },
  { label: 'Delete', value: 'delete' },
  { label: 'Truncate', value: 'truncate' }
]
const sequenceTypeItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'bigint', value: 'bigint' },
  { label: 'integer', value: 'integer' },
  { label: 'smallint', value: 'smallint' }
]
const cycleItems: SelectItem[] = [
  { label: 'Auto / unset', value: '' },
  { label: 'Cycle', value: 'true' },
  { label: 'No cycle', value: 'false' }
]
const indexTypeItems: SelectItem[] = [
  { label: 'btree', value: 'btree' },
  { label: 'gin', value: 'gin' },
  { label: 'gist', value: 'gist' },
  { label: 'hash', value: 'hash' },
  { label: 'brin', value: 'brin' },
  { label: 'spgist', value: 'spgist' }
]

const hasChanges = computed(() => {
  return JSON.stringify(modelValue) !== JSON.stringify(originalValue)
})

const stateLabel = computed(() => {
  return hasChanges.value ? 'Ready to apply' : 'No local metadata changes yet'
})

const showsDocs = computed(() => {
  return modelValue.kind === 'function'
    || modelValue.kind === 'procedure'
    || modelValue.kind === 'sequence'
    || modelValue.kind === 'trigger'
})

const showsAffects = computed(() => {
  return modelValue.kind === 'function'
    || modelValue.kind === 'procedure'
    || modelValue.kind === 'sequence'
    || modelValue.kind === 'trigger'
})

const showsRoutineFields = computed(() => {
  return modelValue.kind === 'function' || modelValue.kind === 'procedure'
})

const showsTriggerFields = computed(() => modelValue.kind === 'trigger')
const showsSequenceFields = computed(() => modelValue.kind === 'sequence')
const showsIndexFields = computed(() => modelValue.kind === 'index')
const showsConstraintFields = computed(() => modelValue.kind === 'constraint')
const showsCustomMetadata = computed(() => {
  return modelValue.kind === 'function'
    || modelValue.kind === 'procedure'
    || modelValue.kind === 'sequence'
    || modelValue.kind === 'trigger'
})

const fieldSurfaceClass = joinStudioClasses(studioPanelSurfaceClass, 'grid gap-3 px-3 py-3')
const compactButtonClass = joinStudioClasses(
  studioButtonClasses.secondary,
  'px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.08em]'
)

const createEmptyListItem = (): PgmlDetailMetadataListItem => {
  return {
    id: nanoid(),
    value: ''
  }
}

const createEmptyKeyValueItem = (): PgmlDetailMetadataKeyValueItem => {
  return {
    id: nanoid(),
    key: '',
    value: ''
  }
}

const emitNextDraft = (mutator: (draft: PgmlDetailPopoverMetadataDraft) => void) => {
  // The editor receives immutable draft snapshots from its parent. Clone first,
  // mutate the clone, then emit the next draft so the popup stays predictable
  // and we avoid hidden nested mutations in the caller's state.
  const nextDraft = clonePgmlDetailPopoverMetadataDraft(modelValue)

  mutator(nextDraft)
  emit('update:modelValue', nextDraft)
}

const appendDraftListItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataListItem[]
) => {
  emitNextDraft((draft) => {
    getEntries(draft).push(createEmptyListItem())
  })
}

const updateDraftListItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataListItem[],
  itemId: string,
  value: string
) => {
  emitNextDraft((draft) => {
    const item = getEntries(draft).find(entry => entry.id === itemId)

    if (item) {
      item.value = value
    }
  })
}

const removeDraftListItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataListItem[],
  setEntries: (
    draft: PgmlDetailPopoverMetadataDraft,
    entries: PgmlDetailMetadataListItem[]
  ) => void,
  itemId: string
) => {
  emitNextDraft((draft) => {
    setEntries(draft, getEntries(draft).filter(entry => entry.id !== itemId))
  })
}

const appendDraftKeyValueItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataKeyValueItem[]
) => {
  emitNextDraft((draft) => {
    getEntries(draft).push(createEmptyKeyValueItem())
  })
}

const updateDraftKeyValueItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataKeyValueItem[],
  entryId: string,
  field: 'key' | 'value',
  value: string
) => {
  emitNextDraft((draft) => {
    const entry = getEntries(draft).find(item => item.id === entryId)

    if (entry) {
      entry[field] = value
    }
  })
}

const removeDraftKeyValueItem = (
  getEntries: (draft: PgmlDetailPopoverMetadataDraft) => PgmlDetailMetadataKeyValueItem[],
  setEntries: (
    draft: PgmlDetailPopoverMetadataDraft,
    entries: PgmlDetailMetadataKeyValueItem[]
  ) => void,
  entryId: string
) => {
  emitNextDraft((draft) => {
    setEntries(draft, getEntries(draft).filter(entry => entry.id !== entryId))
  })
}

const updateDocsSummary = (value: string) => {
  emitNextDraft((draft) => {
    draft.docsSummary = value
  })
}

const addDocsEntry = () => {
  appendDraftKeyValueItem(draft => draft.docsEntries)
}

const updateDocsEntry = (entryId: string, field: 'key' | 'value', value: string) => {
  updateDraftKeyValueItem(draft => draft.docsEntries, entryId, field, value)
}

const removeDocsEntry = (entryId: string) => {
  removeDraftKeyValueItem(
    draft => draft.docsEntries,
    (draft, entries) => {
      draft.docsEntries = entries
    },
    entryId
  )
}

const addAffectsItem = (key: AffectsListKey) => {
  appendDraftListItem(draft => draft.affects[key])
}

const updateAffectsItem = (key: AffectsListKey, itemId: string, value: string) => {
  updateDraftListItem(draft => draft.affects[key], itemId, value)
}

const removeAffectsItem = (key: AffectsListKey, itemId: string) => {
  removeDraftListItem(
    draft => draft.affects[key],
    (draft, entries) => {
      draft.affects[key] = entries
    },
    itemId
  )
}

const addAffectsExtra = () => {
  appendDraftKeyValueItem(draft => draft.affects.extras)
}

const updateAffectsExtra = (entryId: string, field: 'key' | 'value', value: string) => {
  updateDraftKeyValueItem(draft => draft.affects.extras, entryId, field, value)
}

const removeAffectsExtra = (entryId: string) => {
  removeDraftKeyValueItem(
    draft => draft.affects.extras,
    (draft, entries) => {
      draft.affects.extras = entries
    },
    entryId
  )
}

const updateKnownScalar = (field: keyof PgmlDetailPopoverMetadataDraft['known'], value: string) => {
  emitNextDraft((draft) => {
    draft.known[field] = value as never
  })
}

const addKnownListItem = (field: KnownListKey) => {
  appendDraftListItem(draft => draft.known[field])
}

const updateKnownListItem = (field: KnownListKey, itemId: string, value: string) => {
  updateDraftListItem(draft => draft.known[field], itemId, value)
}

const removeKnownListItem = (field: KnownListKey, itemId: string) => {
  removeDraftListItem(
    draft => draft.known[field],
    (draft, entries) => {
      draft.known[field] = entries
    },
    itemId
  )
}

const addCustomMetadata = () => {
  appendDraftKeyValueItem(draft => draft.customMetadata)
}

const updateCustomMetadata = (entryId: string, field: 'key' | 'value', value: string) => {
  updateDraftKeyValueItem(draft => draft.customMetadata, entryId, field, value)
}

const removeCustomMetadata = (entryId: string) => {
  removeDraftKeyValueItem(
    draft => draft.customMetadata,
    (draft, entries) => {
      draft.customMetadata = entries
    },
    entryId
  )
}

const getAffectsItems = (key: AffectsListKey) => {
  return modelValue.affects[key]
}

const getKnownListItems = (key: KnownListKey) => {
  return modelValue.known[key]
}

const kindLabels: Record<PgmlDetailMetadataDraftKind, string> = {
  constraint: 'Constraint',
  function: 'Function',
  index: 'Index',
  procedure: 'Procedure',
  sequence: 'Sequence',
  trigger: 'Trigger'
}

const getKindLabel = (kind: PgmlDetailMetadataDraftKind) => {
  return kindLabels[kind]
}
</script>

<template>
  <div
    data-detail-popover-metadata-editor="true"
    class="grid gap-3"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          {{ title }}
        </div>
        <p :class="studioCompactBodyCopyClass">
          {{ helperDescription }}
        </p>
      </div>
      <div class="shrink-0 text-[0.62rem] text-[color:var(--studio-shell-muted)]">
        {{ stateLabel }}
      </div>
    </div>

    <div :class="fieldSurfaceClass">
      <div class="flex flex-wrap gap-2 text-[0.58rem]">
        <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
          {{ getKindLabel(modelValue.kind) }} metadata
        </span>
        <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
          {{ hasChanges ? 'Unsaved edits' : 'No edits' }}
        </span>
      </div>

      <div
        v-if="showsRoutineFields"
        class="grid gap-3 md:grid-cols-3"
      >
        <label
          class="grid gap-1"
          data-detail-metadata-field="language"
        >
          <span :class="studioCompactFieldKickerClass">Language</span>
          <USelect
            :model-value="modelValue.known.language"
            :items="languageItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('language', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Volatility</span>
          <USelect
            :model-value="modelValue.known.volatility"
            :items="volatilityItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('volatility', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Security</span>
          <USelect
            :model-value="modelValue.known.security"
            :items="securityItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('security', String($event || ''))"
          />
        </label>
      </div>

      <div
        v-if="showsTriggerFields"
        class="grid gap-3"
      >
        <div class="grid gap-3 md:grid-cols-3">
          <label class="grid gap-1">
            <span :class="studioCompactFieldKickerClass">Timing</span>
            <USelect
              :model-value="modelValue.known.triggerTiming"
              :items="triggerTimingItems"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateKnownScalar('triggerTiming', String($event || ''))"
            />
          </label>
          <label class="grid gap-1">
            <span :class="studioCompactFieldKickerClass">Level</span>
            <USelect
              :model-value="modelValue.known.triggerLevel"
              :items="triggerLevelItems"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateKnownScalar('triggerLevel', String($event || ''))"
            />
          </label>
          <label
            class="grid gap-1"
            data-detail-metadata-field="trigger-function"
          >
            <span :class="studioCompactFieldKickerClass">Function</span>
            <UInputMenu
              :model-value="modelValue.known.triggerFunction"
              :items="routineItems"
              value-key="value"
              label-key="label"
              placeholder="Routine name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioInputMenuUi"
              @update:model-value="updateKnownScalar('triggerFunction', String($event || ''))"
            />
          </label>
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3">
            <span :class="studioCompactFieldKickerClass">Events</span>
            <button
              type="button"
              :class="compactButtonClass"
              @click="addKnownListItem('triggerEvents')"
            >
              Add event
            </button>
          </div>
          <div
            v-if="getKnownListItems('triggerEvents').length"
            class="grid gap-2"
          >
            <div
              v-for="entry in getKnownListItems('triggerEvents')"
              :key="entry.id"
              class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <USelect
                :model-value="entry.value"
                :items="triggerEventItems"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="updateKnownListItem('triggerEvents', entry.id, String($event || ''))"
              />
              <button
                type="button"
                :class="compactButtonClass"
                @click="removeKnownListItem('triggerEvents', entry.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No trigger events recorded yet.
          </div>
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3">
            <span :class="studioCompactFieldKickerClass">Arguments</span>
            <button
              type="button"
              :class="compactButtonClass"
              @click="addKnownListItem('triggerArguments')"
            >
              Add argument
            </button>
          </div>
          <div
            v-if="getKnownListItems('triggerArguments').length"
            class="grid gap-2"
          >
            <div
              v-for="entry in getKnownListItems('triggerArguments')"
              :key="entry.id"
              class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <UInput
                :model-value="entry.value"
                color="neutral"
                variant="outline"
                size="sm"
                @update:model-value="updateKnownListItem('triggerArguments', entry.id, String($event || ''))"
              />
              <button
                type="button"
                :class="compactButtonClass"
                @click="removeKnownListItem('triggerArguments', entry.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No trigger arguments recorded yet.
          </div>
        </div>
      </div>

      <div
        v-if="showsSequenceFields"
        class="grid gap-3 md:grid-cols-2"
      >
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Value type</span>
          <USelect
            :model-value="modelValue.known.sequenceAs"
            :items="sequenceTypeItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('sequenceAs', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Cycle</span>
          <USelect
            :model-value="modelValue.known.sequenceCycle"
            :items="cycleItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('sequenceCycle', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Start</span>
          <UInput
            :model-value="modelValue.known.sequenceStart"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceStart', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Increment</span>
          <UInput
            :model-value="modelValue.known.sequenceIncrement"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceIncrement', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Minimum</span>
          <UInput
            :model-value="modelValue.known.sequenceMin"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceMin', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Maximum</span>
          <UInput
            :model-value="modelValue.known.sequenceMax"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceMax', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Cache</span>
          <UInput
            :model-value="modelValue.known.sequenceCache"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceCache', String($event || ''))"
          />
        </label>
        <label class="grid gap-1">
          <span :class="studioCompactFieldKickerClass">Owned by</span>
          <UInput
            :model-value="modelValue.known.sequenceOwnedBy"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateKnownScalar('sequenceOwnedBy', String($event || ''))"
          />
        </label>
      </div>

      <div
        v-if="showsIndexFields"
        class="grid gap-3"
      >
        <label
          class="grid gap-1 md:max-w-[16rem]"
          data-detail-metadata-field="index-type"
        >
          <span :class="studioCompactFieldKickerClass">Index type</span>
          <USelect
            :model-value="modelValue.known.indexType"
            :items="indexTypeItems"
            color="neutral"
            variant="outline"
            size="sm"
            :ui="studioSelectUi"
            @update:model-value="updateKnownScalar('indexType', String($event || ''))"
          />
        </label>

        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3">
            <span :class="studioCompactFieldKickerClass">Indexed columns</span>
            <button
              type="button"
              data-detail-metadata-add-index-column="true"
              :class="compactButtonClass"
              @click="addKnownListItem('indexColumns')"
            >
              Add column
            </button>
          </div>
          <div
            v-if="getKnownListItems('indexColumns').length"
            class="grid gap-2"
          >
            <div
              v-for="entry in getKnownListItems('indexColumns')"
              :key="entry.id"
              class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <UInput
                :model-value="entry.value"
                data-detail-metadata-index-column="true"
                placeholder="Column name"
                color="neutral"
                variant="outline"
                size="sm"
                @update:model-value="updateKnownListItem('indexColumns', entry.id, String($event || ''))"
              />
              <button
                type="button"
                :class="compactButtonClass"
                @click="removeKnownListItem('indexColumns', entry.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div
            v-else
            :class="studioEmptyStateClass"
          >
            Add at least one indexed column.
          </div>
        </div>
      </div>

      <label
        v-if="showsConstraintFields"
        class="grid gap-1"
        data-detail-metadata-field="constraint-expression"
      >
        <span :class="studioCompactFieldKickerClass">Constraint expression</span>
        <textarea
          :value="modelValue.known.constraintExpression"
          rows="4"
          :class="joinStudioClasses(textareaClass, 'min-h-[6rem] text-[0.72rem] leading-5')"
          @input="updateKnownScalar('constraintExpression', String(($event.target as HTMLTextAreaElement).value || ''))"
        />
      </label>
    </div>

    <div
      v-if="showsDocs"
      :class="fieldSurfaceClass"
    >
      <div class="flex items-center justify-between gap-3">
        <span :class="studioCompactFieldKickerClass">Documentation</span>
        <button
          type="button"
          data-detail-metadata-add-doc-entry="true"
          :class="compactButtonClass"
          @click="addDocsEntry"
        >
          Add doc field
        </button>
      </div>

      <label class="grid gap-1">
        <span :class="studioCompactFieldKickerClass">Summary</span>
        <textarea
          :value="modelValue.docsSummary"
          data-detail-metadata-summary="true"
          rows="3"
          :class="joinStudioClasses(textareaClass, 'min-h-[5rem] text-[0.72rem] leading-5')"
          @input="updateDocsSummary(String(($event.target as HTMLTextAreaElement).value || ''))"
        />
      </label>

      <div
        v-if="modelValue.docsEntries.length"
        class="grid gap-2"
      >
        <div
          v-for="entry in modelValue.docsEntries"
          :key="entry.id"
          class="grid gap-2 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)_auto]"
        >
          <UInput
            :model-value="entry.key"
            data-detail-metadata-doc-key="true"
            placeholder="Doc key"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateDocsEntry(entry.id, 'key', String($event || ''))"
          />
          <UInput
            :model-value="entry.value"
            data-detail-metadata-doc-value="true"
            placeholder="Doc value"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateDocsEntry(entry.id, 'value', String($event || ''))"
          />
          <button
            type="button"
            :class="compactButtonClass"
            @click="removeDocsEntry(entry.id)"
          >
            Remove
          </button>
        </div>
      </div>
      <div
        v-else
        :class="studioEmptyStateClass"
      >
        No extra documentation fields yet.
      </div>
    </div>

    <div
      v-if="showsAffects"
      :class="fieldSurfaceClass"
    >
      <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Affects
      </div>

      <div class="grid gap-3">
        <div
          v-for="section in affectSections"
          :key="section.key"
          class="grid gap-2"
        >
          <div class="flex items-center justify-between gap-3">
            <span :class="studioCompactFieldKickerClass">{{ section.label }}</span>
            <button
              type="button"
              :class="compactButtonClass"
              @click="addAffectsItem(section.key)"
            >
              Add item
            </button>
          </div>

          <div
            v-if="getAffectsItems(section.key).length"
            class="grid gap-2"
          >
            <div
              v-for="entry in getAffectsItems(section.key)"
              :key="entry.id"
              class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <UInput
                :model-value="entry.value"
                color="neutral"
                variant="outline"
                size="sm"
                @update:model-value="updateAffectsItem(section.key, entry.id, String($event || ''))"
              />
              <button
                type="button"
                :class="compactButtonClass"
                @click="removeAffectsItem(section.key, entry.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No {{ section.label.toLowerCase() }} entries yet.
          </div>
        </div>

        <div class="grid gap-2">
          <div class="flex items-center justify-between gap-3">
            <span :class="studioCompactFieldKickerClass">Custom affects entries</span>
            <button
              type="button"
              :class="compactButtonClass"
              @click="addAffectsExtra"
            >
              Add field
            </button>
          </div>

          <div
            v-if="modelValue.affects.extras.length"
            class="grid gap-2"
          >
            <div
              v-for="entry in modelValue.affects.extras"
              :key="entry.id"
              class="grid gap-2 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)_auto]"
            >
              <UInput
                :model-value="entry.key"
                placeholder="Key"
                color="neutral"
                variant="outline"
                size="sm"
                @update:model-value="updateAffectsExtra(entry.id, 'key', String($event || ''))"
              />
              <UInput
                :model-value="entry.value"
                placeholder="Comma separated values"
                color="neutral"
                variant="outline"
                size="sm"
                @update:model-value="updateAffectsExtra(entry.id, 'value', String($event || ''))"
              />
              <button
                type="button"
                :class="compactButtonClass"
                @click="removeAffectsExtra(entry.id)"
              >
                Remove
              </button>
            </div>
          </div>
          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No custom affects fields yet.
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showsCustomMetadata"
      :class="fieldSurfaceClass"
    >
      <div class="flex items-center justify-between gap-3">
        <span :class="studioCompactFieldKickerClass">Custom metadata</span>
        <button
          type="button"
          :class="compactButtonClass"
          @click="addCustomMetadata"
        >
          Add metadata
        </button>
      </div>

      <div
        v-if="modelValue.customMetadata.length"
        class="grid gap-2"
      >
        <div
          v-for="entry in modelValue.customMetadata"
          :key="entry.id"
          class="grid gap-2 md:grid-cols-[minmax(0,0.42fr)_minmax(0,1fr)_auto]"
        >
          <UInput
            :model-value="entry.key"
            placeholder="Key"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateCustomMetadata(entry.id, 'key', String($event || ''))"
          />
          <UInput
            :model-value="entry.value"
            placeholder="Value"
            color="neutral"
            variant="outline"
            size="sm"
            @update:model-value="updateCustomMetadata(entry.id, 'value', String($event || ''))"
          />
          <button
            type="button"
            :class="compactButtonClass"
            @click="removeCustomMetadata(entry.id)"
          >
            Remove
          </button>
        </div>
      </div>
      <div
        v-else
        :class="studioEmptyStateClass"
      >
        No custom metadata entries yet.
      </div>
    </div>
  </div>
</template>
