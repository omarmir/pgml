<script setup lang="ts">
import { computed } from 'vue'

import {
  buildDiagramConnectionDragPreviewPath,
  type DiagramConnectionPreviewDragState,
  type DiagramConnectionPreviewLayer,
  type DiagramConnectionPreviewPoint
} from '~/utils/diagram-connection-preview'

type DiagramConnectionRenderLine = {
  key: string
  path: string
  points: DiagramConnectionPreviewPoint[]
  color: string
  dashPattern: string
  animated: boolean
  zIndex: number
  fromOwnerNodeId: string | null
  toOwnerNodeId: string | null
}

type DiagramConnectionPathBatch = {
  animated: boolean
  color: string
  dashPattern: string
  key: string
  pathData: string
}

type DiagramConnectionRenderLayer = {
  bridgedBatches: DiagramConnectionPathBatch[]
  staticBatches: DiagramConnectionPathBatch[]
  translatedBatches: DiagramConnectionPathBatch[]
  zIndex: number
}

const {
  activeDrag = null,
  height,
  layers,
  previewPaths,
  width
} = defineProps<{
  activeDrag?: DiagramConnectionPreviewDragState | null
  height: number
  layers: DiagramConnectionPreviewLayer<DiagramConnectionRenderLine>[]
  previewPaths: Record<string, string>
  width: number
}>()

const getReferenceRaceStyle = (color: string) => {
  return {
    '--pgml-reference-race-color': color,
    '--pgml-reference-race-soft': `color-mix(in srgb, ${color} 32%, transparent)`,
    '--pgml-reference-race-strong': `color-mix(in srgb, ${color} 68%, transparent)`,
    '--pgml-reference-race-solid': `color-mix(in srgb, ${color} 88%, white 12%)`
  }
}

const getPreviewPath = (line: DiagramConnectionRenderLine) => {
  if (!activeDrag || (activeDrag.deltaX === 0 && activeDrag.deltaY === 0)) {
    return line.path
  }

  const cachedPreviewPath = previewPaths[line.key]

  if (typeof cachedPreviewPath === 'string' && cachedPreviewPath.length > 0) {
    return cachedPreviewPath
  }

  if (line.fromOwnerNodeId === activeDrag.nodeId) {
    return buildDiagramConnectionDragPreviewPath(line.points, activeDrag.deltaX, activeDrag.deltaY, 'from')
  }

  if (line.toOwnerNodeId === activeDrag.nodeId) {
    return buildDiagramConnectionDragPreviewPath(line.points, activeDrag.deltaX, activeDrag.deltaY, 'to')
  }

  return line.path
}

const getBatchKey = (line: DiagramConnectionRenderLine) => {
  return `${line.color}:${line.animated ? 'animated' : line.dashPattern}`
}

const buildPathBatches = (
  lineSet: DiagramConnectionRenderLine[],
  kind: 'static' | 'bridged'
) => {
  const batchesByKey = new Map<string, DiagramConnectionPathBatch>()

  lineSet.forEach((line) => {
    const batchKey = getBatchKey(line)
    const pathData = kind === 'bridged' ? getPreviewPath(line) : line.path
    const existingBatch = batchesByKey.get(batchKey)

    if (existingBatch) {
      existingBatch.pathData = `${existingBatch.pathData} ${pathData}`
      return
    }

    batchesByKey.set(batchKey, {
      animated: line.animated,
      color: line.color,
      dashPattern: line.dashPattern,
      key: batchKey,
      pathData
    })
  })

  return Array.from(batchesByKey.values())
}

const renderLayers = computed<DiagramConnectionRenderLayer[]>(() => {
  return layers.reduce<DiagramConnectionRenderLayer[]>((entries, layer) => {
    const staticBatches = buildPathBatches(layer.staticLines, 'static')
    const bridgedBatches = buildPathBatches(layer.bridgedLines, 'bridged')
    const translatedBatches = buildPathBatches(layer.translatedLines, 'static')

    if (
      staticBatches.length === 0
      && bridgedBatches.length === 0
      && translatedBatches.length === 0
    ) {
      return entries
    }

    entries.push({
      bridgedBatches,
      staticBatches,
      translatedBatches,
      zIndex: layer.zIndex
    })

    return entries
  }, [])
})
</script>

<template>
  <svg
    v-for="layer in renderLayers"
    :key="layer.zIndex"
    data-connection-layer="true"
    class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
    :style="{ zIndex: layer.zIndex }"
    :viewBox="`0 0 ${width} ${height}`"
    preserveAspectRatio="none"
  >
    <path
      v-for="batch in layer.staticBatches"
      :key="`static:${batch.key}`"
      :class="batch.animated ? 'pgml-reference-race-path' : undefined"
      :d="batch.pathData"
      fill="none"
      :stroke="batch.color"
      stroke-width="2"
      :stroke-dasharray="batch.dashPattern"
      :style="batch.animated ? getReferenceRaceStyle(batch.color) : undefined"
      stroke-linecap="square"
      stroke-linejoin="miter"
      opacity="0.9"
    />
    <path
      v-for="batch in layer.bridgedBatches"
      :key="`bridged:${batch.key}`"
      :class="batch.animated ? 'pgml-reference-race-path' : undefined"
      :d="batch.pathData"
      fill="none"
      :stroke="batch.color"
      stroke-width="2"
      :stroke-dasharray="batch.dashPattern"
      :style="batch.animated ? getReferenceRaceStyle(batch.color) : undefined"
      stroke-linecap="square"
      stroke-linejoin="miter"
      opacity="0.9"
    />
    <g
      v-if="activeDrag && layer.translatedBatches.length > 0"
      data-connection-drag-preview="true"
      :data-connection-drag-node="activeDrag.nodeId"
      :transform="`translate(${activeDrag.deltaX} ${activeDrag.deltaY})`"
    >
      <path
        v-for="batch in layer.translatedBatches"
        :key="`translated:${batch.key}`"
        :class="batch.animated ? 'pgml-reference-race-path' : undefined"
        :d="batch.pathData"
        fill="none"
        :stroke="batch.color"
        stroke-width="2"
        :stroke-dasharray="batch.dashPattern"
        :style="batch.animated ? getReferenceRaceStyle(batch.color) : undefined"
        stroke-linecap="square"
        stroke-linejoin="miter"
        opacity="0.9"
      />
    </g>
  </svg>
</template>

<style scoped>
.pgml-reference-race-path {
  stroke: var(--pgml-reference-race-solid);
  stroke-width: 2px !important;
  opacity: 1 !important;
  stroke-dasharray: 14 10;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  animation: pgml-reference-race-line 0.58s linear infinite;
  filter:
    drop-shadow(0 0 6px var(--pgml-reference-race-soft))
    drop-shadow(0 0 16px var(--pgml-reference-race-strong))
    drop-shadow(0 0 28px var(--pgml-reference-race-strong));
}

@keyframes pgml-reference-race-line {
  to {
    stroke-dashoffset: 24;
  }
}
</style>
