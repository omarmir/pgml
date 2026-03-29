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

type VersionCompareOption = {
  label: string
  value: string
}

type VersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

type VersionPanelItem = {
  branchRootId: string | null
  branchRootLabel: string | null
  childCount: number
  createdAt: string
  depth: number
  id: string
  isLeaf: boolean
  isRoot: boolean
  isWorkspaceBase: boolean
  label: string
  lineageLabel: string
  parentVersionId: string | null
  role: 'design' | 'implementation'
}

const {
  canCreateCheckpoint = true,
  compareRelationshipSummary = '',
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  layoutChanged = 0,
  latestVersionId = null,
  mobileActiveView = null,
  mobilePanelTab = null,
  model,
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationSql = '',
  migrationWarnings = [],
  previewTargetId = 'workspace',
  versionCompareBaseId = null,
  versionCompareOptions = [],
  versionCompareTargetId = 'workspace',
  versionDiffSections = [],
  versionItems = [],
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.',
  viewportResetKey = 0
} = defineProps<{
  canCreateCheckpoint?: boolean
  compareRelationshipSummary?: string
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  layoutChanged?: number
  latestVersionId?: string | null
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationSql?: string
  migrationWarnings?: string[]
  model: PgmlSchemaModel
  previewTargetId?: string
  versionCompareBaseId?: string | null
  versionCompareOptions?: VersionCompareOption[]
  versionCompareTargetId?: string
  versionDiffSections?: VersionDiffSection[]
  versionItems?: VersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
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
  restoreVersion: [versionId: string]
  updateVersionCompareBaseId: [value: string | null]
  updateVersionCompareTargetId: [value: string]
  versionCheckpoint: []
  versionImportDump: []
  viewVersionTarget: [targetId: string]
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
    :can-create-checkpoint="canCreateCheckpoint"
    :compare-relationship-summary="compareRelationshipSummary"
    :export-base-name="exportBaseName"
    :export-preference-key="exportPreferenceKey"
    :has-blocking-source-errors="hasBlockingSourceErrors"
    :layout-changed="layoutChanged"
    :latest-version-id="latestVersionId"
    :mobile-active-view="mobileActiveView"
    :mobile-panel-tab="mobilePanelTab"
    :migration-file-name="migrationFileName"
    :migration-has-changes="migrationHasChanges"
    :migration-sql="migrationSql"
    :migration-warnings="migrationWarnings"
    :model="model"
    :preview-target-id="previewTargetId"
    :version-compare-base-id="versionCompareBaseId"
    :version-compare-options="versionCompareOptions"
    :version-compare-target-id="versionCompareTargetId"
    :version-diff-sections="versionDiffSections"
    :version-items="versionItems"
    :workspace-base-label="workspaceBaseLabel"
    :workspace-status="workspaceStatus"
    :viewport-reset-key="viewportResetKey"
    @create-group="emit('createGroup')"
    @create-table="emit('createTable', $event)"
    @edit-group="emit('editGroup', $event)"
    @edit-table="emit('editTable', $event)"
    @focus-source="emit('focusSource', $event)"
    @node-properties-change="emit('nodePropertiesChange', $event)"
    @panel-tab-change="emit('panelTabChange', $event)"
    @restore-version="emit('restoreVersion', $event)"
    @update-version-compare-base-id="emit('updateVersionCompareBaseId', $event)"
    @update-version-compare-target-id="emit('updateVersionCompareTargetId', $event)"
    @version-checkpoint="emit('versionCheckpoint')"
    @version-import-dump="emit('versionImportDump')"
    @view-version-target="emit('viewVersionTarget', $event)"
  />
</template>
