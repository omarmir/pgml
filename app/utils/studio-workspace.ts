export type DiagramPanelTab = 'inspector' | 'entities' | 'export'

export type DiagramToolPanelTab = 'compare' | 'migrations' | 'versions'

export type StudioMobileCanvasView = 'diagram' | 'panel' | 'tool-panel'

export type StudioMobileWorkspaceView = StudioMobileCanvasView | 'pgml'

export const defaultStudioMobilePanelTab: DiagramPanelTab = 'entities'

export const diagramPanelTabLabelByValue: Readonly<Record<DiagramPanelTab, string>> = Object.freeze({
  entities: 'Entities',
  export: 'Export',
  inspector: 'Inspector'
})

export const diagramPanelTabIconByValue: Readonly<Record<DiagramPanelTab, string>> = Object.freeze({
  entities: 'i-lucide-table-of-contents',
  export: 'i-lucide-file-output',
  inspector: 'i-lucide-sliders-horizontal'
})

export const diagramToolPanelTabLabelByValue: Readonly<Record<DiagramToolPanelTab, string>> = Object.freeze({
  compare: 'Compare',
  migrations: 'Migrations',
  versions: 'Versions'
})

export const diagramToolPanelTabIconByValue: Readonly<Record<DiagramToolPanelTab, string>> = Object.freeze({
  compare: 'i-lucide-scan-search',
  migrations: 'i-lucide-file-code-2',
  versions: 'i-lucide-git-compare'
})

export const studioMobileWorkspaceViewLabelByValue: Readonly<Record<StudioMobileWorkspaceView, string>> = Object.freeze({
  'diagram': 'Diagram',
  'tool-panel': 'History tools',
  'panel': 'Diagram panel',
  'pgml': 'PGML'
})

export const studioMobileWorkspaceViewIconByValue: Readonly<Record<StudioMobileWorkspaceView, string>> = Object.freeze({
  'diagram': 'i-lucide-workflow',
  'tool-panel': 'i-lucide-git-compare-arrows',
  'panel': 'i-lucide-panels-top-left',
  'pgml': 'i-lucide-file-code-2'
})
