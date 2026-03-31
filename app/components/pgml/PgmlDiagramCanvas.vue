<script setup lang="ts">
import type { Ref } from 'vue'
import { ref } from 'vue'
import PgmlDiagramCanvasGpuShell from '~/components/pgml/PgmlDiagramCanvasGpuShell.vue'
import type { PgmlDiagramCompareEntry } from '~/utils/pgml-diagram-compare'
import type { PgmlNodeProperties, PgmlSchemaModel, PgmlSourceRange } from '~/utils/pgml'
import type { PgmlVersionMigrationStepBundle } from '~/utils/pgml-version-migration'
import type { DiagramPanelTab, DiagramToolPanelTab, StudioMobileCanvasView } from '~/utils/studio-workspace'

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

type DiagramViewItem = {
  label: string
  value: string
}

type DiagramViewSettings = {
  snapToGrid: boolean
  showExecutableObjects: boolean
  showRelationshipLines: boolean
  showTableFields: boolean
}

type VersionMigrationArtifactsProps = {
  // The GPU shell and versions panel consume the same migration artifact set.
  // Keeping the pass-through shape named here makes prop drift easier to spot.
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationKysely?: string
  migrationKyselyFileName?: string
  migrationSql?: string
  migrationSteps?: PgmlVersionMigrationStepBundle[]
  migrationWarnings?: string[]
}

type VersionPanelItem = {
  ancestorCount: number
  branchLeafCount: number
  branchMaxDepth: number
  branchVersionCount: number
  branchRootId: string | null
  branchRootLabel: string | null
  childCount: number
  createdAt: string
  descendantCount: number
  depth: number
  id: string
  isLeaf: boolean
  isLatestByRole: boolean
  isLatestOverall: boolean
  isRoot: boolean
  siblingCount: number
  isWorkspaceBase: boolean
  label: string
  lineageLabel: string
  parentVersionLabel: string | null
  parentVersionId: string | null
  role: 'design' | 'implementation'
}

const {
  canCreateCheckpoint = true,
  canEditDetailSource = false,
  compareBaseLabel = 'Base',
  compareBaseModel = null,
  compareEntries = [],
  compareRelationshipSummary = '',
  compareTargetLabel = 'Target',
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  mobileActiveView = null,
  mobilePanelTab = null,
  mobileToolPanelTab = null,
  model,
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationKysely = '',
  migrationKyselyFileName = 'pgml-version.migration.ts',
  migrationSql = '',
  migrationSteps = [],
  migrationWarnings = [],
  previewTargetId = 'workspace',
  sourceText = '',
  versionCompareBaseId = null,
  versionCompareOptions = [],
  versionCompareTargetId = 'workspace',
  versionItems = [],
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.',
  viewportResetKey = 0
} = defineProps<VersionMigrationArtifactsProps & {
  activeDiagramViewId?: string | null
  canCreateCheckpoint?: boolean
  canDeleteDiagramView?: boolean
  canEditDetailSource?: boolean
  compareBaseLabel?: string
  compareBaseModel?: PgmlSchemaModel | null
  compareEntries?: PgmlDiagramCompareEntry[]
  compareRelationshipSummary?: string
  compareTargetLabel?: string
  diagramViewItems?: DiagramViewItem[]
  diagramViewSettings?: DiagramViewSettings
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  mobileToolPanelTab?: DiagramToolPanelTab | null
  model: PgmlSchemaModel
  previewTargetId?: string
  sourceText?: string
  versionCompareBaseId?: string | null
  versionCompareOptions?: VersionCompareOption[]
  versionCompareTargetId?: string
  versionItems?: VersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
  viewportResetKey?: number
}>()

const emit = defineEmits<{
  createGroup: []
  createTable: [groupName: string | null]
  createDiagramView: []
  deleteDiagramView: []
  editGroup: [groupName: string]
  renameDiagramView: []
  editTable: [tableId: string]
  focusSource: [sourceRange: PgmlSourceRange]
  mobileCanvasViewChange: [view: StudioMobileCanvasView]
  nodePropertiesChange: [properties: Record<string, PgmlNodeProperties>]
  panelTabChange: [tab: DiagramPanelTab]
  toolPanelTabChange: [tab: DiagramToolPanelTab]
  toolPanelVisibilityChange: [payload: { open: boolean, tab: DiagramToolPanelTab }]
  replaceSourceRange: [payload: { nextText: string, sourceRange: PgmlSourceRange }]
  restoreVersion: [versionId: string]
  selectDiagramView: [viewId: string]
  updateDiagramViewSettings: [settings: Partial<DiagramViewSettings>]
  updateVersionCompareBaseId: [value: string | null]
  updateVersionCompareTargetId: [value: string]
  versionCheckpoint: []
  versionImportDbml: []
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
    :active-diagram-view-id="activeDiagramViewId"
    :can-create-checkpoint="canCreateCheckpoint"
    :can-delete-diagram-view="canDeleteDiagramView"
    :can-edit-detail-source="canEditDetailSource"
    :compare-base-label="compareBaseLabel"
    :compare-base-model="compareBaseModel"
    :compare-entries="compareEntries"
    :compare-relationship-summary="compareRelationshipSummary"
    :compare-target-label="compareTargetLabel"
    :diagram-view-items="diagramViewItems"
    :diagram-view-settings="diagramViewSettings"
    :export-base-name="exportBaseName"
    :export-preference-key="exportPreferenceKey"
    :has-blocking-source-errors="hasBlockingSourceErrors"
    :mobile-active-view="mobileActiveView"
    :mobile-panel-tab="mobilePanelTab"
    :mobile-tool-panel-tab="mobileToolPanelTab"
    :migration-file-name="migrationFileName"
    :migration-has-changes="migrationHasChanges"
    :migration-kysely="migrationKysely"
    :migration-kysely-file-name="migrationKyselyFileName"
    :migration-sql="migrationSql"
    :migration-steps="migrationSteps"
    :migration-warnings="migrationWarnings"
    :model="model"
    :preview-target-id="previewTargetId"
    :source-text="sourceText"
    :version-compare-base-id="versionCompareBaseId"
    :version-compare-options="versionCompareOptions"
    :version-compare-target-id="versionCompareTargetId"
    :version-items="versionItems"
    :workspace-base-label="workspaceBaseLabel"
    :workspace-status="workspaceStatus"
    :viewport-reset-key="viewportResetKey"
    @create-group="emit('createGroup')"
    @create-table="emit('createTable', $event)"
    @create-diagram-view="emit('createDiagramView')"
    @delete-diagram-view="emit('deleteDiagramView')"
    @edit-group="emit('editGroup', $event)"
    @rename-diagram-view="emit('renameDiagramView')"
    @edit-table="emit('editTable', $event)"
    @focus-source="emit('focusSource', $event)"
    @mobile-canvas-view-change="emit('mobileCanvasViewChange', $event)"
    @node-properties-change="emit('nodePropertiesChange', $event)"
    @panel-tab-change="emit('panelTabChange', $event)"
    @tool-panel-tab-change="emit('toolPanelTabChange', $event)"
    @tool-panel-visibility-change="emit('toolPanelVisibilityChange', $event)"
    @replace-source-range="emit('replaceSourceRange', $event)"
    @restore-version="emit('restoreVersion', $event)"
    @select-diagram-view="emit('selectDiagramView', $event)"
    @update-diagram-view-settings="emit('updateDiagramViewSettings', $event)"
    @update-version-compare-base-id="emit('updateVersionCompareBaseId', $event)"
    @update-version-compare-target-id="emit('updateVersionCompareTargetId', $event)"
    @version-checkpoint="emit('versionCheckpoint')"
    @version-import-dbml="emit('versionImportDbml')"
    @version-import-dump="emit('versionImportDump')"
    @view-version-target="emit('viewVersionTarget', $event)"
  />
</template>
