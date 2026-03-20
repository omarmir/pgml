<script setup lang="ts">
import type { CSSProperties, PropType } from 'vue'

import type {
  TableAttachment,
  TableAttachmentFlag,
  TableRow
} from '~/utils/pgml-diagram-canvas'

const {
  attachmentPopoverContent,
  attachmentPopoverUi,
  getAttachmentFlagStyle,
  getAttachmentKindBadgeStyle,
  getAttachmentRowStyle,
  getColumnAnchorKey,
  getColumnLabelAnchorKey,
  getRelationalRowHighlightColor,
  getSelectedAttachmentRowStyle,
  getSelectionGlowStyle,
  isAttachmentSelectionActive,
  isHighlightedRelationalRow,
  rows,
  tableId
} = defineProps({
  attachmentPopoverContent: {
    type: Object as PropType<Record<string, unknown>>,
    required: true
  },
  attachmentPopoverUi: {
    type: Object as PropType<Record<string, string>>,
    required: true
  },
  getAttachmentFlagStyle: {
    type: Function as PropType<(flag: TableAttachmentFlag) => CSSProperties>,
    required: true
  },
  getAttachmentKindBadgeStyle: {
    type: Function as PropType<(attachment: TableAttachment) => CSSProperties>,
    required: true
  },
  getAttachmentRowStyle: {
    type: Function as PropType<(attachment: TableAttachment) => CSSProperties>,
    required: true
  },
  getColumnAnchorKey: {
    type: Function as PropType<(tableId: string, columnName: string) => string>,
    required: true
  },
  getColumnLabelAnchorKey: {
    type: Function as PropType<(tableId: string, columnName: string) => string>,
    required: true
  },
  getRelationalRowHighlightColor: {
    type: Function as PropType<(tableId: string, columnName: string) => string | null>,
    required: true
  },
  getSelectedAttachmentRowStyle: {
    type: Function as PropType<() => CSSProperties>,
    required: true
  },
  getSelectionGlowStyle: {
    type: Function as PropType<(color: string) => CSSProperties>,
    required: true
  },
  isAttachmentSelectionActive: {
    type: Function as PropType<(tableId: string, attachmentId: string) => boolean>,
    required: true
  },
  isHighlightedRelationalRow: {
    type: Function as PropType<(tableId: string, columnName: string) => boolean>,
    required: true
  },
  rows: {
    type: Array as PropType<TableRow[]>,
    required: true
  },
  tableId: {
    type: String,
    required: true
  }
})

const emit = defineEmits<{
  attachmentClick: [tableId: string, attachment: TableAttachment]
  attachmentDoubleClick: [attachment: TableAttachment]
}>()

const columnModifierBadgeClass = 'inline-flex min-h-[1rem] max-w-full items-center justify-end border border-[color:var(--studio-rail)] px-1 py-0.5 font-mono text-[0.52rem] uppercase leading-[1.15] tracking-[0.04em] whitespace-normal break-all text-[color:var(--studio-shell-muted)]'
const columnRowClass = 'relative flex min-w-0 items-start justify-between gap-2 bg-[color:var(--studio-row-surface)] px-2 py-1.5'
const attachmentButtonClass = 'relative flex min-w-0 w-full items-start justify-between gap-2 px-2 py-1.5 text-left transition-[filter,transform] duration-150 hover:brightness-105'
const attachmentKindBadgeClass = 'mt-0.5 inline-flex h-4 shrink-0 items-center border px-1 font-mono text-[0.48rem] uppercase tracking-[0.06em]'
const attachmentFlagBadgeClass = 'inline-flex min-h-[1rem] max-w-full items-center justify-end border px-1 py-0.5 font-mono text-[0.5rem] uppercase leading-[1.15] tracking-[0.04em] whitespace-normal break-all'

const getColumnRowStyle = (columnName: string) => {
  const highlightColor = getRelationalRowHighlightColor(tableId, columnName)

  if (!highlightColor) {
    return undefined
  }

  return getSelectionGlowStyle(highlightColor)
}

const getAttachmentButtonStyle = (attachment: TableAttachment) => {
  return [
    getAttachmentRowStyle(attachment),
    isAttachmentSelectionActive(tableId, attachment.id) ? getSelectedAttachmentRowStyle() : undefined,
    getSelectionGlowStyle(attachment.color)
  ]
}

const handleAttachmentClick = (attachment: TableAttachment) => {
  emit('attachmentClick', tableId, attachment)
}

const handleAttachmentDoubleClick = (attachment: TableAttachment) => {
  emit('attachmentDoubleClick', attachment)
}
</script>

<template>
  <template
    v-for="row in rows"
    :key="row.key"
  >
    <div
      v-if="row.kind === 'column'"
      :data-table-row-anchor="row.key"
      data-table-row-kind="column"
      :data-column-anchor="getColumnAnchorKey(tableId, row.column.name)"
      :class="[
        columnRowClass,
        isHighlightedRelationalRow(tableId, row.column.name) ? 'pgml-selection-glow pgml-selection-glow-subtle' : ''
      ]"
      :style="getColumnRowStyle(row.column.name)"
      :data-relational-highlighted="isHighlightedRelationalRow(tableId, row.column.name) ? 'true' : undefined"
    >
      <div
        :data-column-label-anchor="getColumnLabelAnchorKey(tableId, row.column.name)"
        class="min-w-0"
      >
        <strong
          data-table-row-title
          class="block truncate font-mono text-[0.68rem] font-medium text-[color:var(--studio-shell-text)]"
        >
          {{ row.column.name }}
        </strong>
        <span
          data-table-row-subtitle
          class="mt-0.5 block truncate text-[0.64rem] text-[color:var(--studio-shell-muted)]"
        >
          {{ row.column.type }}
        </span>
      </div>
      <div class="grid max-w-[8.5rem] shrink-0 justify-items-end gap-0.5 text-right">
        <span
          v-for="modifier in row.column.modifiers.slice(0, 2)"
          :key="modifier"
          data-table-row-badge
          :class="columnModifierBadgeClass"
        >
          {{ modifier }}
        </span>
      </div>
    </div>

    <UPopover
      v-else
      mode="click"
      :content="attachmentPopoverContent"
      :ui="attachmentPopoverUi"
    >
      <button
        type="button"
        :data-table-row-anchor="row.key"
        data-table-row-kind="attachment"
        :data-attachment-row="row.attachment.id"
        :class="[
          attachmentButtonClass,
          isAttachmentSelectionActive(tableId, row.attachment.id) ? 'pgml-selection-glow' : ''
        ]"
        :style="getAttachmentButtonStyle(row.attachment)"
        :aria-label="`${row.attachment.kind} ${row.attachment.title}`"
        :data-selection-active="isAttachmentSelectionActive(tableId, row.attachment.id) ? 'true' : undefined"
        @pointerdown.stop
        @click.stop="handleAttachmentClick(row.attachment)"
        @dblclick.stop="handleAttachmentDoubleClick(row.attachment)"
      >
        <div class="flex min-w-0 items-start gap-2">
          <span
            data-table-row-badge
            :class="attachmentKindBadgeClass"
            :style="getAttachmentKindBadgeStyle(row.attachment)"
          >
            {{ row.attachment.kind }}
          </span>
          <div class="min-w-0">
            <strong
              data-table-row-title
              class="block truncate font-mono text-[0.66rem] font-medium text-[color:var(--studio-shell-text)]"
            >
              {{ row.attachment.title }}
            </strong>
            <span
              v-if="row.attachment.subtitle"
              data-table-row-subtitle
              class="mt-0.5 block truncate text-[0.62rem] text-[color:var(--studio-shell-muted)]"
            >
              {{ row.attachment.subtitle }}
            </span>
          </div>
        </div>

        <div class="flex max-w-[8.5rem] shrink-0 flex-wrap justify-end gap-0.5 text-right">
          <span
            v-for="flag in row.attachment.flags"
            :key="flag.key"
            data-table-row-badge
            :class="attachmentFlagBadgeClass"
            :style="getAttachmentFlagStyle(flag)"
          >
            {{ flag.label }}
          </span>
        </div>
      </button>

      <template #content>
        <div
          :data-attachment-popover="row.attachment.id"
          class="grid gap-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <span
                class="mb-1 inline-flex items-center border px-1.5 font-mono text-[0.56rem] uppercase tracking-[0.08em]"
                :style="getAttachmentKindBadgeStyle(row.attachment)"
              >
                {{ row.attachment.kind }}
              </span>
              <h5 class="truncate text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                {{ row.attachment.title }}
              </h5>
              <p
                v-if="row.attachment.subtitle"
                class="mt-1 text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]"
              >
                {{ row.attachment.subtitle }}
              </p>
            </div>

            <div class="flex shrink-0 flex-wrap justify-end gap-1">
              <span
                v-for="flag in row.attachment.flags"
                :key="flag.key"
                class="inline-flex items-center border px-1.5 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.06em]"
                :style="getAttachmentFlagStyle(flag)"
              >
                {{ flag.label }}
              </span>
            </div>
          </div>

          <div class="grid max-h-64 gap-1 overflow-auto border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-2">
            <p
              v-for="detail in row.attachment.details"
              :key="detail"
              class="break-words whitespace-pre-wrap font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
            >
              {{ detail }}
            </p>
          </div>
        </div>
      </template>
    </UPopover>
  </template>
</template>
