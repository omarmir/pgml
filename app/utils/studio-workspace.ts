export type DiagramPanelTab = 'inspector' | 'entities' | 'export'

export type StudioMobileCanvasView = 'diagram' | 'panel'

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
