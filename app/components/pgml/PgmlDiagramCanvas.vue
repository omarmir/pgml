<script setup lang="ts">
import type { Ref } from 'vue'
import { ref } from 'vue'
import PgmlDiagramCanvasGpuShell from '~/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import type { PgmlNodeProperties, PgmlSchemaModel, PgmlSourceRange } from '~/utils/pgml'
import type { DiagramPanelTab, StudioMobileCanvasView } from '~/utils/studio-workspace'

type CanvasHandle = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}

const {
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  mobileActiveView = null,
  mobilePanelTab = null,
  model,
  viewportResetKey = 0
} = defineProps<{
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  model: PgmlSchemaModel
  viewportResetKey?: number
}>()

const emit = defineEmits<{
  createGroup: []
  createTable: [groupName: string | null]
  editGroup: [groupName: string]
  editTable: [tableId: string]
  focusSource: [sourceRange: PgmlSourceRange]
  nodePropertiesChange: [properties: Record<string, PgmlNodeProperties>]
  panelTabChange: [tab: DiagramPanelTab]
}>()

const shellRef: Ref<CanvasHandle | null> = ref(null)

defineExpose<CanvasHandle>({
  exportDiagram: async (format, scaleFactor = 1) => {
    await shellRef.value?.exportDiagram(format, scaleFactor)
  },
  exportPng: async (scaleFactor) => {
    await shellRef.value?.exportPng(scaleFactor)
  },
  exportSvg: async () => {
    await shellRef.value?.exportSvg()
  },
  getNodeLayoutProperties: () => {
    return shellRef.value?.getNodeLayoutProperties() || {}
  }
})
</script>

<template>
  <PgmlDiagramCanvasGpuShell
    ref="shellRef"
    :export-base-name="exportBaseName"
    :export-preference-key="exportPreferenceKey"
    :has-blocking-source-errors="hasBlockingSourceErrors"
    :mobile-active-view="mobileActiveView"
    :mobile-panel-tab="mobilePanelTab"
    :model="model"
    :viewport-reset-key="viewportResetKey"
    @create-group="emit('createGroup')"
    @create-table="emit('createTable', $event)"
    @edit-group="emit('editGroup', $event)"
    @edit-table="emit('editTable', $event)"
    @focus-source="emit('focusSource', $event)"
    @node-properties-change="emit('nodePropertiesChange', $event)"
    @panel-tab-change="emit('panelTabChange', $event)"
  />
</template>
