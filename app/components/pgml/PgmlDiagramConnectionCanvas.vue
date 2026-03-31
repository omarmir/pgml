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

type DiagramConnectionRenderLayer = {
  bridgedLines: DiagramConnectionRenderLine[]
  staticLines: DiagramConnectionRenderLine[]
  translatedLines: DiagramConnectionRenderLine[]
  zIndex: number
}

const {
  activeDrag = null,
  contentTransform = null,
  height,
  layers,
  previewPaths,
  renderHeight = null,
  renderWidth = null,
  width
} = defineProps<{
  activeDrag?: DiagramConnectionPreviewDragState | null
  contentTransform?: string | null
  height: number
  layers: DiagramConnectionPreviewLayer<DiagramConnectionRenderLine>[]
  previewPaths: Record<string, string>
  renderHeight?: number | null
  renderWidth?: number | null
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
  return `${line.color}:${line.animated ? 'animated' : line.dashPattern}:${line.key}`
}

const getStrokeDasharray = (line: DiagramConnectionRenderLine) => {
  const dashPattern = line.dashPattern.trim()

  if (dashPattern.length === 0 || dashPattern === '0') {
    return undefined
  }

  return dashPattern
}

const renderLayers = computed<DiagramConnectionRenderLayer[]>(() => {
  return layers.reduce<DiagramConnectionRenderLayer[]>((entries, layer) => {
    if (
      layer.staticLines.length === 0
      && layer.bridgedLines.length === 0
      && layer.translatedLines.length === 0
    ) {
      return entries
    }

    entries.push({
      bridgedLines: layer.bridgedLines,
      staticLines: layer.staticLines,
      translatedLines: layer.translatedLines,
      zIndex: layer.zIndex
    })

    return entries
  }, [])
})

const svgHeight = computed(() => {
  return renderHeight && renderHeight > 0 ? renderHeight : height
})

const svgWidth = computed(() => {
  return renderWidth && renderWidth > 0 ? renderWidth : width
})
</script>

<template>
  <template v-if="contentTransform">
    <svg
      data-connection-layer="true"
      class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      :height="svgHeight"
      :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
      :width="svgWidth"
      preserveAspectRatio="none"
    >
      <g
        :transform="contentTransform || undefined"
      >
        <g
          v-for="layer in renderLayers"
          :key="layer.zIndex"
        >
          <path
            v-for="line in layer.staticLines"
            :key="`static:${getBatchKey(line)}`"
            :data-connection-highlighted="line.animated ? 'true' : undefined"
            :data-connection-key="line.key"
            :class="line.animated ? 'pgml-reference-race-path' : undefined"
            :d="line.path"
            fill="none"
            :stroke="line.color"
            stroke-width="2"
            :stroke-dasharray="getStrokeDasharray(line)"
            :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
            stroke-linecap="square"
            stroke-linejoin="miter"
            opacity="0.9"
          />
          <path
            v-for="line in layer.bridgedLines"
            :key="`bridged:${getBatchKey(line)}`"
            :data-connection-highlighted="line.animated ? 'true' : undefined"
            :data-connection-key="line.key"
            :class="line.animated ? 'pgml-reference-race-path' : undefined"
            :d="getPreviewPath(line)"
            fill="none"
            :stroke="line.color"
            stroke-width="2"
            :stroke-dasharray="getStrokeDasharray(line)"
            :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
            stroke-linecap="square"
            stroke-linejoin="miter"
            opacity="0.9"
          />
          <g
            v-if="activeDrag && layer.translatedLines.length > 0"
            data-connection-drag-preview="true"
            :data-connection-drag-node="activeDrag.nodeId"
            :transform="`translate(${activeDrag.deltaX} ${activeDrag.deltaY})`"
          >
            <path
              v-for="line in layer.translatedLines"
              :key="`translated:${getBatchKey(line)}`"
              :data-connection-highlighted="line.animated ? 'true' : undefined"
              :data-connection-key="line.key"
              :class="line.animated ? 'pgml-reference-race-path' : undefined"
              :d="line.path"
              fill="none"
              :stroke="line.color"
              stroke-width="2"
              :stroke-dasharray="getStrokeDasharray(line)"
              :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
              stroke-linecap="square"
              stroke-linejoin="miter"
              opacity="0.9"
            />
          </g>
        </g>
      </g>
    </svg>
  </template>

  <template v-else>
    <svg
      v-for="layer in renderLayers"
      :key="layer.zIndex"
      data-connection-layer="true"
      class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      :height="height"
      :style="{ zIndex: layer.zIndex }"
      :viewBox="`0 0 ${width} ${height}`"
      :width="width"
      preserveAspectRatio="none"
    >
      <path
        v-for="line in layer.staticLines"
        :key="`static:${getBatchKey(line)}`"
        :data-connection-highlighted="line.animated ? 'true' : undefined"
        :data-connection-key="line.key"
        :class="line.animated ? 'pgml-reference-race-path' : undefined"
        :d="line.path"
        fill="none"
        :stroke="line.color"
        stroke-width="2"
        :stroke-dasharray="getStrokeDasharray(line)"
        :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
        stroke-linecap="square"
        stroke-linejoin="miter"
        opacity="0.9"
      />
      <path
        v-for="line in layer.bridgedLines"
        :key="`bridged:${getBatchKey(line)}`"
        :data-connection-highlighted="line.animated ? 'true' : undefined"
        :data-connection-key="line.key"
        :class="line.animated ? 'pgml-reference-race-path' : undefined"
        :d="getPreviewPath(line)"
        fill="none"
        :stroke="line.color"
        stroke-width="2"
        :stroke-dasharray="getStrokeDasharray(line)"
        :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
        stroke-linecap="square"
        stroke-linejoin="miter"
        opacity="0.9"
      />
      <g
        v-if="activeDrag && layer.translatedLines.length > 0"
        data-connection-drag-preview="true"
        :data-connection-drag-node="activeDrag.nodeId"
        :transform="`translate(${activeDrag.deltaX} ${activeDrag.deltaY})`"
      >
        <path
          v-for="line in layer.translatedLines"
          :key="`translated:${getBatchKey(line)}`"
          :data-connection-highlighted="line.animated ? 'true' : undefined"
          :data-connection-key="line.key"
          :class="line.animated ? 'pgml-reference-race-path' : undefined"
          :d="line.path"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          :stroke-dasharray="getStrokeDasharray(line)"
          :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
          stroke-linecap="square"
          stroke-linejoin="miter"
          opacity="0.9"
        />
      </g>
    </svg>
  </template>
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
