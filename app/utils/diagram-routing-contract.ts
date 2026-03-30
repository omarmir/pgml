import type { DiagramRect } from '~/utils/diagram-routing'

export type DiagramRoutingMeasuredBounds = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

export type DiagramRoutingEndpointLocator = {
  attribute: string
  value: string
} | null

export type DiagramRoutingGeometryInput = {
  bounds: DiagramRoutingMeasuredBounds
  groupNodeId: string | null
  identity: string
  isColumnAnchor: boolean
  isColumnLabelAnchor: boolean
  locator: DiagramRoutingEndpointLocator
  nodeAnchorId: string | null
  ownerNodeId: string | null
  rowKey: string | null
  tableBounds: DiagramRoutingMeasuredBounds | null
  tableId: string | null
}

export type DiagramRoutingDescriptorInput = {
  animated: boolean
  color: string
  dashPattern: string
  dashed: boolean
  fromGeometry: DiagramRoutingGeometryInput
  key: string
  selectedForeground: boolean
  toGeometry: DiagramRoutingGeometryInput
}

export type DiagramRoutingRequest = {
  descriptors: DiagramRoutingDescriptorInput[]
  groupGeometries: DiagramRoutingGeometryInput[]
  groupHeaderBands: DiagramRect[]
  nodeOrders: Record<string, number>
  planeBounds: DiagramRoutingMeasuredBounds
  requestId: number
  scale: number
}

export type DiagramRoutingBackend = 'cpu' | 'webgpu'
