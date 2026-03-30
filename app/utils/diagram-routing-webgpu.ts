import type { DiagramGpuConnectionLine } from '~/utils/diagram-gpu-scene'
import type {
  DiagramRoutingDescriptorInput,
  DiagramRoutingGeometryInput,
  DiagramRoutingMeasuredBounds,
  DiagramRoutingRequest
} from '~/utils/diagram-routing-contract'

const gpuBufferUsage = {
  COPY_DST: 0x0008,
  COPY_SRC: 0x0004,
  MAP_READ: 0x0001,
  STORAGE: 0x0080
} as const

const previewRoutePointLimit = 8
const previewRouteDescriptorStride = 144
const previewRouteOutputStride = 80
const previewRouteWorkgroupSize = 64
const previewPointTolerance = 0.5

type WebGpuNavigator = Navigator & {
  gpu?: {
    requestAdapter: (options?: Record<string, unknown>) => Promise<{
      requestDevice: () => Promise<unknown>
    } | null>
  }
}

type DiagramRoutingWebgpuPreviewCapability = {
  isSecureContext: boolean
  supported: boolean
}

type DiagramRoutingWebgpuPreviewState = {
  device: {
    createBindGroup: (descriptor: Record<string, unknown>) => unknown
    createBuffer: (descriptor: Record<string, unknown>) => {
      destroy: () => void
      getMappedRange: () => ArrayBuffer
      mapAsync: (mode: number) => Promise<void>
      unmap: () => void
    }
    createCommandEncoder: () => {
      beginComputePass: () => {
        dispatchWorkgroups: (workgroupCountX: number) => void
        end: () => void
        setBindGroup: (index: number, bindGroup: unknown) => void
        setPipeline: (pipeline: unknown) => void
      }
      copyBufferToBuffer: (source: unknown, sourceOffset: number, destination: unknown, destinationOffset: number, size: number) => void
      finish: () => unknown
    }
    createComputePipeline: (descriptor: Record<string, unknown>) => unknown
    createShaderModule: (descriptor: Record<string, unknown>) => unknown
    queue: {
      submit: (buffers: unknown[]) => void
      writeBuffer: (buffer: unknown, bufferOffset: number, data: BufferSource) => void
    }
  }
  pipeline: unknown
}

let routingPreviewStatePromise: Promise<DiagramRoutingWebgpuPreviewState | null> | null = null

const previewShaderCode = `
struct PreviewRouteDescriptor {
  fromElementBounds : vec4<f32>,
  fromHostBounds : vec4<f32>,
  toElementBounds : vec4<f32>,
  toHostBounds : vec4<f32>,
  fromGroupBounds : vec4<f32>,
  toGroupBounds : vec4<f32>,
  sharedGroupBounds : vec4<f32>,
  planeOriginScale : vec4<f32>,
  flags0 : vec4<u32>,
  flags1 : vec4<u32>,
}

struct PreviewRouteOutput {
  pointCount : u32,
  _padding0 : vec3<u32>,
  points : array<vec2<f32>, 8>,
}

@group(0) @binding(0) var<storage, read> descriptors : array<PreviewRouteDescriptor>;
@group(0) @binding(1) var<storage, read_write> routes : array<PreviewRouteOutput>;

const sideLeft : u32 = 0u;
const sideRight : u32 = 1u;
const sideTop : u32 = 2u;
const sideBottom : u32 = 3u;
const horizontalBias : f32 = 0.75;
const routeBaseOffset : f32 = 10.0;
const sameSideLaneOffset : f32 = 18.0;
const groupedLaneBaseOffset : f32 = 18.0;
const sharedGroupLaneBaseOffset : f32 = 8.0;
const previewRatioMin : f32 = 0.16;
const previewRatioMax : f32 = 0.84;
const pointTolerance : f32 = 0.5;

fn rectWidth(bounds : vec4<f32>) -> f32 {
  return bounds.z - bounds.x;
}

fn rectHeight(bounds : vec4<f32>) -> f32 {
  return bounds.w - bounds.y;
}

fn rectCenterX(bounds : vec4<f32>) -> f32 {
  return bounds.x + rectWidth(bounds) * 0.5;
}

fn rectCenterY(bounds : vec4<f32>) -> f32 {
  return bounds.y + rectHeight(bounds) * 0.5;
}

fn normalizeX(bounds : vec4<f32>, planeOriginScale : vec4<f32>, edge : u32) -> f32 {
  if (edge == 0u) {
    return (bounds.x - planeOriginScale.x) / max(planeOriginScale.z, 1.0);
  }

  return (bounds.z - planeOriginScale.x) / max(planeOriginScale.z, 1.0);
}

fn normalizeY(bounds : vec4<f32>, planeOriginScale : vec4<f32>, edge : u32) -> f32 {
  if (edge == 0u) {
    return (bounds.y - planeOriginScale.y) / max(planeOriginScale.z, 1.0);
  }

  return (bounds.w - planeOriginScale.y) / max(planeOriginScale.z, 1.0);
}

fn clampRatio(value : f32) -> f32 {
  return clamp(value, previewRatioMin, previewRatioMax);
}

fn isHorizontalSide(side : u32) -> bool {
  return side == sideLeft || side == sideRight;
}

fn getDefaultFromSide(fromBounds : vec4<f32>, toBounds : vec4<f32>) -> u32 {
  let deltaX = rectCenterX(toBounds) - rectCenterX(fromBounds);
  let deltaY = rectCenterY(toBounds) - rectCenterY(fromBounds);

  if (abs(deltaX) >= abs(deltaY) * horizontalBias) {
    if (deltaX >= 0.0) {
      return sideRight;
    }

    return sideLeft;
  }

  if (deltaY >= 0.0) {
    return sideBottom;
  }

  return sideTop;
}

fn getOppositeSide(side : u32) -> u32 {
  if (side == sideLeft) {
    return sideRight;
  }

  if (side == sideRight) {
    return sideLeft;
  }

  if (side == sideTop) {
    return sideBottom;
  }

  return sideTop;
}

fn getDesiredRatio(side : u32, hostBounds : vec4<f32>, targetCenterX : f32, targetCenterY : f32) -> f32 {
  if (isHorizontalSide(side)) {
    return clampRatio((targetCenterY - hostBounds.y) / max(rectHeight(hostBounds), 1.0));
  }

  return clampRatio((targetCenterX - hostBounds.x) / max(rectWidth(hostBounds), 1.0));
}

fn getFieldRatio(elementBounds : vec4<f32>, hostBounds : vec4<f32>, side : u32, targetCenterX : f32, targetCenterY : f32) -> f32 {
  if (isHorizontalSide(side)) {
    return clampRatio((rectCenterY(elementBounds) - hostBounds.y) / max(rectHeight(hostBounds), 1.0));
  }

  return getDesiredRatio(side, hostBounds, targetCenterX, targetCenterY);
}

fn getAnchorPoint(bounds : vec4<f32>, side : u32, ratio : f32, planeOriginScale : vec4<f32>) -> vec2<f32> {
  let xLeft = normalizeX(bounds, planeOriginScale, 0u);
  let xRight = normalizeX(bounds, planeOriginScale, 1u);
  let yTop = normalizeY(bounds, planeOriginScale, 0u);
  let yBottom = normalizeY(bounds, planeOriginScale, 1u);
  let xCenter = (bounds.x - planeOriginScale.x + rectWidth(bounds) * ratio) / max(planeOriginScale.z, 1.0);
  let yCenter = (bounds.y - planeOriginScale.y + rectHeight(bounds) * ratio) / max(planeOriginScale.z, 1.0);

  if (side == sideLeft) {
    return vec2<f32>(xLeft, yCenter);
  }

  if (side == sideRight) {
    return vec2<f32>(xRight, yCenter);
  }

  if (side == sideTop) {
    return vec2<f32>(xCenter, yTop);
  }

  return vec2<f32>(xCenter, yBottom);
}

fn moveAnchorPoint(point : vec2<f32>, side : u32, distance : f32) -> vec2<f32> {
  if (side == sideLeft) {
    return vec2<f32>(point.x - distance, point.y);
  }

  if (side == sideRight) {
    return vec2<f32>(point.x + distance, point.y);
  }

  if (side == sideTop) {
    return vec2<f32>(point.x, point.y - distance);
  }

  return vec2<f32>(point.x, point.y + distance);
}

fn getRouteOffset(index : u32) -> f32 {
  let primary = f32(index % 4u) * 4.0;
  let secondary = f32((index / 4u) % 3u) * 2.0;

  return routeBaseOffset + primary + secondary;
}

fn getGroupedOuterPoint(
  side : u32,
  exitPoint : vec2<f32>,
  groupBounds : vec4<f32>,
  planeOriginScale : vec4<f32>,
  descriptorIndex : u32
) -> vec2<f32> {
  let laneOffset = groupedLaneBaseOffset + f32(descriptorIndex % 4u) * groupedLaneBaseOffset;
  let groupLeft = (groupBounds.x - planeOriginScale.x) / max(planeOriginScale.z, 1.0);
  let groupRight = (groupBounds.z - planeOriginScale.x) / max(planeOriginScale.z, 1.0);
  let groupBottom = (groupBounds.w - planeOriginScale.y) / max(planeOriginScale.z, 1.0);

  if (side == sideLeft) {
    return vec2<f32>(groupLeft - laneOffset, exitPoint.y);
  }

  if (side == sideRight) {
    return vec2<f32>(groupRight + laneOffset, exitPoint.y);
  }

  return vec2<f32>(exitPoint.x, groupBottom + laneOffset);
}

fn getSharedGroupLaneSide(fromBounds : vec4<f32>, toBounds : vec4<f32>, groupBounds : vec4<f32>) -> u32 {
  let leftScore = (rectCenterX(fromBounds) - groupBounds.x) + (rectCenterX(toBounds) - groupBounds.x);
  let rightScore = (groupBounds.z - rectCenterX(fromBounds)) + (groupBounds.z - rectCenterX(toBounds));

  if (leftScore <= rightScore) {
    return sideLeft;
  }

  return sideRight;
}

fn buildSharedGroupLaneX(laneSide : u32, groupBounds : vec4<f32>, planeOriginScale : vec4<f32>, descriptorIndex : u32) -> f32 {
  let laneOffset = sharedGroupLaneBaseOffset + f32(descriptorIndex % 4u) * 10.0;
  let groupLeft = (groupBounds.x - planeOriginScale.x) / max(planeOriginScale.z, 1.0);
  let groupRight = (groupBounds.z - planeOriginScale.x) / max(planeOriginScale.z, 1.0);

  if (laneSide == sideLeft) {
    return groupLeft - laneOffset;
  }

  return groupRight + laneOffset;
}

fn appendPoint(points : ptr<function, array<vec2<f32>, 8>>, pointCount : ptr<function, u32>, point : vec2<f32>) {
  if (*pointCount >= 8u) {
    return;
  }

  (*points)[*pointCount] = point;
  *pointCount = *pointCount + 1u;
}

fn writeRoute(index : u32, points : array<vec2<f32>, 8>, pointCount : u32) {
  routes[index].pointCount = pointCount;

  for (var pointIndex : u32 = 0u; pointIndex < 8u; pointIndex = pointIndex + 1u) {
    routes[index].points[pointIndex] = points[pointIndex];
  }
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) globalId : vec3<u32>) {
  let descriptorIndex = globalId.x;

  if (descriptorIndex >= arrayLength(&descriptors)) {
    return;
  }

  let descriptor = descriptors[descriptorIndex];
  let planeOriginScale = descriptor.planeOriginScale;
  let fromHasGroup = descriptor.flags0.z == 1u;
  let toHasGroup = descriptor.flags0.w == 1u;
  let fromIsField = descriptor.flags0.x == 1u;
  let toIsField = descriptor.flags0.y == 1u;
  let sharedGroup = descriptor.flags1.x == 1u;
  let routeIndex = descriptor.flags1.y;
  let fromDefaultSide = getDefaultFromSide(descriptor.fromElementBounds, descriptor.toElementBounds);
  let toDefaultSide = getOppositeSide(fromDefaultSide);
  let fromSide = select(
    fromDefaultSide,
    select(sideLeft, sideRight, rectCenterX(descriptor.toElementBounds) >= rectCenterX(descriptor.fromHostBounds)),
    fromIsField
  );
  let toSide = select(
    toDefaultSide,
    select(sideLeft, sideRight, rectCenterX(descriptor.fromElementBounds) >= rectCenterX(descriptor.toHostBounds)),
    toIsField
  );
  let fromRatio = select(
    getDesiredRatio(fromSide, descriptor.fromHostBounds, rectCenterX(descriptor.toElementBounds), rectCenterY(descriptor.toElementBounds)),
    getFieldRatio(descriptor.fromElementBounds, descriptor.fromHostBounds, fromSide, rectCenterX(descriptor.toElementBounds), rectCenterY(descriptor.toElementBounds)),
    fromIsField
  );
  let toRatio = select(
    getDesiredRatio(toSide, descriptor.toHostBounds, rectCenterX(descriptor.fromElementBounds), rectCenterY(descriptor.fromElementBounds)),
    getFieldRatio(descriptor.toElementBounds, descriptor.toHostBounds, toSide, rectCenterX(descriptor.fromElementBounds), rectCenterY(descriptor.fromElementBounds)),
    toIsField
  );
  let fromAnchor = getAnchorPoint(descriptor.fromHostBounds, fromSide, fromRatio, planeOriginScale);
  let toAnchor = getAnchorPoint(descriptor.toHostBounds, toSide, toRatio, planeOriginScale);
  var points : array<vec2<f32>, 8>;
  var pointCount : u32 = 0u;

  if (sharedGroup) {
    let laneSide = getSharedGroupLaneSide(descriptor.fromElementBounds, descriptor.toElementBounds, descriptor.sharedGroupBounds);
    let laneX = buildSharedGroupLaneX(laneSide, descriptor.sharedGroupBounds, planeOriginScale, routeIndex);

    appendPoint(&points, &pointCount, fromAnchor);
    appendPoint(&points, &pointCount, vec2<f32>(laneX, fromAnchor.y));
    appendPoint(&points, &pointCount, vec2<f32>(laneX, toAnchor.y));
    appendPoint(&points, &pointCount, toAnchor);
    writeRoute(descriptorIndex, points, pointCount);
    return;
  }

  let routeOffset = getRouteOffset(routeIndex);
  let fromExit = moveAnchorPoint(fromAnchor, fromSide, routeOffset);
  let toExit = moveAnchorPoint(toAnchor, toSide, routeOffset);
  let fromOuter = select(
    fromExit,
    getGroupedOuterPoint(fromSide, fromExit, descriptor.fromGroupBounds, planeOriginScale, routeIndex),
    fromHasGroup
  );
  let toOuter = select(
    toExit,
    getGroupedOuterPoint(toSide, toExit, descriptor.toGroupBounds, planeOriginScale, routeIndex),
    toHasGroup
  );

  appendPoint(&points, &pointCount, fromAnchor);

  if (distance(fromAnchor, fromExit) > pointTolerance) {
    appendPoint(&points, &pointCount, fromExit);
  }

  if (distance(fromExit, fromOuter) > pointTolerance) {
    appendPoint(&points, &pointCount, fromOuter);
  }

  if (abs(fromOuter.x - toOuter.x) > pointTolerance && abs(fromOuter.y - toOuter.y) > pointTolerance) {
    if (isHorizontalSide(fromSide) && isHorizontalSide(toSide)) {
      let sameSide = fromSide == toSide;
      let middleX = select(
        (fromOuter.x + toOuter.x) * 0.5,
        select(
          min(fromOuter.x, toOuter.x) - sameSideLaneOffset,
          max(fromOuter.x, toOuter.x) + sameSideLaneOffset,
          fromSide == sideRight
        ),
        sameSide
      );

      appendPoint(&points, &pointCount, vec2<f32>(middleX, fromOuter.y));
      appendPoint(&points, &pointCount, vec2<f32>(middleX, toOuter.y));
    } else if (!isHorizontalSide(fromSide) && !isHorizontalSide(toSide)) {
      let sameSide = fromSide == toSide;
      let middleY = select(
        (fromOuter.y + toOuter.y) * 0.5,
        select(
          min(fromOuter.y, toOuter.y) - sameSideLaneOffset,
          max(fromOuter.y, toOuter.y) + sameSideLaneOffset,
          fromSide == sideBottom
        ),
        sameSide
      );

      appendPoint(&points, &pointCount, vec2<f32>(fromOuter.x, middleY));
      appendPoint(&points, &pointCount, vec2<f32>(toOuter.x, middleY));
    } else if (isHorizontalSide(fromSide)) {
      appendPoint(&points, &pointCount, vec2<f32>(toOuter.x, fromOuter.y));
    } else {
      appendPoint(&points, &pointCount, vec2<f32>(fromOuter.x, toOuter.y));
    }
  }

  if (distance(toOuter, toExit) > pointTolerance) {
    appendPoint(&points, &pointCount, toOuter);
  }

  if (distance(toExit, toOuter) > pointTolerance) {
    appendPoint(&points, &pointCount, toExit);
  }

  appendPoint(&points, &pointCount, toAnchor);
  writeRoute(descriptorIndex, points, pointCount);
}
`

const getWebgpuNavigator = () => {
  if (!import.meta.client) {
    return null
  }

  return navigator as WebGpuNavigator
}

const toRectVector = (bounds: DiagramRoutingMeasuredBounds | null) => {
  if (!bounds) {
    return [0, 0, 0, 0]
  }

  return [
    bounds.left,
    bounds.top,
    bounds.right,
    bounds.bottom
  ]
}

const getAnchorHostBounds = (geometry: DiagramRoutingGeometryInput) => {
  if ((geometry.isColumnAnchor || geometry.isColumnLabelAnchor) && geometry.tableBounds) {
    return geometry.tableBounds
  }

  return geometry.bounds
}

const appendNormalizedPreviewPoint = (
  points: DiagramGpuConnectionLine['points'],
  point: DiagramGpuConnectionLine['points'][number]
) => {
  const lastPoint = points.at(-1)

  if (
    lastPoint
    && Math.abs(lastPoint.x - point.x) <= previewPointTolerance
    && Math.abs(lastPoint.y - point.y) <= previewPointTolerance
  ) {
    return
  }

  const previousPoint = points.at(-2)

  if (previousPoint && lastPoint) {
    const previousVertical = Math.abs(previousPoint.x - lastPoint.x) <= previewPointTolerance
    const nextVertical = Math.abs(lastPoint.x - point.x) <= previewPointTolerance
    const previousHorizontal = Math.abs(previousPoint.y - lastPoint.y) <= previewPointTolerance
    const nextHorizontal = Math.abs(lastPoint.y - point.y) <= previewPointTolerance

    if ((previousVertical && nextVertical) || (previousHorizontal && nextHorizontal)) {
      points[points.length - 1] = point
      return
    }
  }

  points.push(point)
}

export const normalizeDiagramRoutingPreviewPoints = (
  rawPoints: DiagramGpuConnectionLine['points']
) => {
  const normalizedPoints: DiagramGpuConnectionLine['points'] = []

  rawPoints.forEach((point) => {
    appendNormalizedPreviewPoint(normalizedPoints, point)
  })

  return normalizedPoints
}

const getLineBounds = (points: DiagramGpuConnectionLine['points']) => {
  const firstPoint = points[0]

  if (!firstPoint) {
    return {
      maxX: 0,
      maxY: 0,
      minX: 0,
      minY: 0
    }
  }

  return points.slice(1).reduce<DiagramGpuConnectionLine['bounds']>((bounds, point) => {
    return {
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y)
    }
  }, {
    maxX: firstPoint.x,
    maxY: firstPoint.y,
    minX: firstPoint.x,
    minY: firstPoint.y
  })
}

const getPreviewCapability = (): DiagramRoutingWebgpuPreviewCapability => {
  if (!import.meta.client) {
    return {
      isSecureContext: false,
      supported: false
    }
  }

  return {
    isSecureContext: window.isSecureContext,
    supported: window.isSecureContext && Boolean(getWebgpuNavigator()?.gpu)
  }
}

const initializeRoutingPreviewState = async (): Promise<DiagramRoutingWebgpuPreviewState | null> => {
  const capability = getPreviewCapability()

  if (!capability.supported) {
    return null
  }

  const adapter = await getWebgpuNavigator()?.gpu?.requestAdapter({
    powerPreference: 'high-performance'
  })

  if (!adapter) {
    return null
  }

  const device = await adapter.requestDevice() as unknown as DiagramRoutingWebgpuPreviewState['device']
  const shaderModule = device.createShaderModule({
    code: previewShaderCode
  })
  const pipeline = device.createComputePipeline({
    compute: {
      entryPoint: 'main',
      module: shaderModule
    },
    layout: 'auto'
  })

  return {
    device,
    pipeline
  }
}

const getRoutingPreviewState = async () => {
  if (!routingPreviewStatePromise) {
    routingPreviewStatePromise = initializeRoutingPreviewState()
  }

  return routingPreviewStatePromise
}

const buildPreviewDescriptorBuffer = (request: DiagramRoutingRequest) => {
  const groupBoundsById = request.groupGeometries.reduce<Record<string, DiagramRoutingMeasuredBounds>>((entries, geometry) => {
    if (geometry.nodeAnchorId) {
      entries[geometry.nodeAnchorId] = geometry.bounds
    }

    return entries
  }, {})
  const dataView = new DataView(new ArrayBuffer(Math.max(request.descriptors.length, 1) * previewRouteDescriptorStride))

  request.descriptors.forEach((descriptor, index) => {
    const offset = index * previewRouteDescriptorStride
    const fromAnchorHostBounds = getAnchorHostBounds(descriptor.fromGeometry)
    const toAnchorHostBounds = getAnchorHostBounds(descriptor.toGeometry)
    const fromGroupBounds = descriptor.fromGeometry.groupNodeId
      ? groupBoundsById[descriptor.fromGeometry.groupNodeId] || null
      : null
    const toGroupBounds = descriptor.toGeometry.groupNodeId
      ? groupBoundsById[descriptor.toGeometry.groupNodeId] || null
      : null
    const sharedGroupBounds = descriptor.fromGeometry.groupNodeId
      && descriptor.fromGeometry.groupNodeId === descriptor.toGeometry.groupNodeId
      ? groupBoundsById[descriptor.fromGeometry.groupNodeId] || null
      : null
    const floatValues = [
      ...toRectVector(descriptor.fromGeometry.bounds),
      ...toRectVector(fromAnchorHostBounds),
      ...toRectVector(descriptor.toGeometry.bounds),
      ...toRectVector(toAnchorHostBounds),
      ...toRectVector(fromGroupBounds),
      ...toRectVector(toGroupBounds),
      ...toRectVector(sharedGroupBounds),
      request.planeBounds.left,
      request.planeBounds.top,
      request.scale,
      0
    ]
    const flagValues = [
      Number(descriptor.fromGeometry.isColumnAnchor || descriptor.fromGeometry.isColumnLabelAnchor),
      Number(descriptor.toGeometry.isColumnAnchor || descriptor.toGeometry.isColumnLabelAnchor),
      Number(Boolean(descriptor.fromGeometry.groupNodeId)),
      Number(Boolean(descriptor.toGeometry.groupNodeId)),
      Number(Boolean(sharedGroupBounds)),
      index,
      0,
      0
    ]

    floatValues.forEach((value, floatIndex) => {
      dataView.setFloat32(offset + floatIndex * 4, value, true)
    })

    flagValues.forEach((value, flagIndex) => {
      dataView.setUint32(offset + 128 + flagIndex * 4, value, true)
    })
  })

  return dataView.buffer
}

const decodePreviewRoutes = (
  descriptors: DiagramRoutingDescriptorInput[],
  buffer: ArrayBuffer
) => {
  const dataView = new DataView(buffer)

  return descriptors.map((descriptor, index) => {
    const offset = index * previewRouteOutputStride
    const rawPointCount = dataView.getUint32(offset, true)
    const rawPoints: DiagramGpuConnectionLine['points'] = []

    for (let pointIndex = 0; pointIndex < Math.min(rawPointCount, previewRoutePointLimit); pointIndex += 1) {
      const pointOffset = offset + 16 + pointIndex * 8

      rawPoints.push({
        x: dataView.getFloat32(pointOffset, true),
        y: dataView.getFloat32(pointOffset + 4, true)
      })
    }

    const points = normalizeDiagramRoutingPreviewPoints(rawPoints)

    return {
      animated: descriptor.animated,
      bounds: getLineBounds(points),
      color: descriptor.color,
      dashPattern: descriptor.dashPattern,
      dashed: descriptor.dashed,
      fromOwnerNodeId: descriptor.fromGeometry.ownerNodeId,
      key: descriptor.key,
      points,
      toOwnerNodeId: descriptor.toGeometry.ownerNodeId,
      zIndex: 0
    } satisfies DiagramGpuConnectionLine
  })
}

export const routeDiagramConnectionsWithWebgpu = async (request: DiagramRoutingRequest) => {
  if (request.descriptors.length === 0) {
    return []
  }

  const state = await getRoutingPreviewState()

  if (!state) {
    return null
  }

  const descriptorBufferData = buildPreviewDescriptorBuffer(request)
  const descriptorBuffer = state.device.createBuffer({
    size: descriptorBufferData.byteLength,
    usage: gpuBufferUsage.COPY_DST | gpuBufferUsage.STORAGE
  })
  const outputBuffer = state.device.createBuffer({
    size: request.descriptors.length * previewRouteOutputStride,
    usage: gpuBufferUsage.COPY_SRC | gpuBufferUsage.STORAGE
  })
  const readbackBuffer = state.device.createBuffer({
    size: request.descriptors.length * previewRouteOutputStride,
    usage: gpuBufferUsage.COPY_DST | gpuBufferUsage.MAP_READ
  })

  try {
    state.device.queue.writeBuffer(descriptorBuffer, 0, descriptorBufferData)

    const bindGroup = state.device.createBindGroup({
      entries: [
        {
          binding: 0,
          resource: {
            buffer: descriptorBuffer
          }
        },
        {
          binding: 1,
          resource: {
            buffer: outputBuffer
          }
        }
      ],
      layout: (state.pipeline as { getBindGroupLayout: (index: number) => unknown }).getBindGroupLayout(0)
    })
    const commandEncoder = state.device.createCommandEncoder()
    const computePass = commandEncoder.beginComputePass()

    computePass.setPipeline(state.pipeline)
    computePass.setBindGroup(0, bindGroup)
    computePass.dispatchWorkgroups(Math.ceil(request.descriptors.length / previewRouteWorkgroupSize))
    computePass.end()
    commandEncoder.copyBufferToBuffer(
      outputBuffer,
      0,
      readbackBuffer,
      0,
      request.descriptors.length * previewRouteOutputStride
    )
    state.device.queue.submit([commandEncoder.finish()])

    await readbackBuffer.mapAsync(gpuBufferUsage.MAP_READ)

    const outputData = readbackBuffer.getMappedRange().slice(0)

    readbackBuffer.unmap()

    return decodePreviewRoutes(request.descriptors, outputData)
  } catch {
    routingPreviewStatePromise = null
    return null
  } finally {
    descriptorBuffer.destroy()
    outputBuffer.destroy()
    readbackBuffer.destroy()
  }
}
