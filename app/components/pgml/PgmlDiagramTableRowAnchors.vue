<script setup lang="ts">
import type { PropType } from 'vue'

import type { TableRow } from '~/utils/pgml-diagram-canvas'

const {
  getColumnAnchorKey,
  getColumnLabelAnchorKey,
  rows,
  tableId
} = defineProps({
  getColumnAnchorKey: {
    type: Function as PropType<(tableId: string, columnName: string) => string>,
    required: true
  },
  getColumnLabelAnchorKey: {
    type: Function as PropType<(tableId: string, columnName: string) => string>,
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
      class="relative h-[31px]"
      aria-hidden="true"
    >
      <strong
        :data-column-label-anchor="getColumnLabelAnchorKey(tableId, row.column.name)"
        class="absolute left-2 top-1.5 block h-4 w-[calc(100%-16px)]"
      />
    </div>

    <div
      v-else
      :data-table-row-anchor="row.key"
      data-table-row-kind="attachment"
      class="h-[31px]"
      aria-hidden="true"
    />
  </template>
</template>
