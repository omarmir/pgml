export type DiagramPanelTab = 'inspector' | 'entities' | 'compare' | 'export' | 'versions'

export type StudioMobileCanvasView = 'diagram' | 'panel'

export type StudioMobileWorkspaceView = StudioMobileCanvasView | 'pgml'

export const defaultStudioMobilePanelTab: DiagramPanelTab = 'entities'

export const diagramPanelTabLabelByValue: Readonly<Record<DiagramPanelTab, string>> = Object.freeze({
  compare: 'Compare',
  entities: 'Entities',
  export: 'Export',
  inspector: 'Inspector',
  versions: 'Versions'
})

export const diagramPanelTabIconByValue: Readonly<Record<DiagramPanelTab, string>> = Object.freeze({
  compare: 'i-lucide-scan-search',
  entities: 'i-lucide-table-of-contents',
  export: 'i-lucide-file-output',
  inspector: 'i-lucide-sliders-horizontal',
  versions: 'i-lucide-git-compare'
})

export const studioMobileWorkspaceViewLabelByValue: Readonly<Record<StudioMobileWorkspaceView, string>> = Object.freeze({
  diagram: 'Diagram',
  panel: 'Diagram panel',
  pgml: 'PGML'
})

export const studioMobileWorkspaceViewIconByValue: Readonly<Record<StudioMobileWorkspaceView, string>> = Object.freeze({
  diagram: 'i-lucide-workflow',
  panel: 'i-lucide-panels-top-left',
  pgml: 'i-lucide-file-code-2'
})
