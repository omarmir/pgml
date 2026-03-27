<script setup lang="ts">
import type { CSSProperties } from 'vue'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioToolbarButtonClass
} from '~/utils/uiStyles'

const {
  isEditorPanelVisible,
  layoutShellRefSetter,
  studioLayoutStyle
} = defineProps<{
  isEditorPanelVisible: boolean
  layoutShellRefSetter: (value: unknown) => void
  studioLayoutStyle: CSSProperties
}>()

const emit = defineEmits<{
  resizeEditorBy: [delta: number]
  startEditorResize: [event: PointerEvent]
  toggleEditorVisibility: []
}>()

const editorVisibilityButtonClass = joinStudioClasses(
  studioButtonClasses.secondary,
  'absolute left-3 top-3 z-[4]',
  studioToolbarButtonClass
)
</script>

<template>
  <div
    :ref="layoutShellRefSetter"
    class="grid h-full min-h-0 w-full gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)]"
    :style="studioLayoutStyle"
  >
    <slot
      v-if="isEditorPanelVisible"
      name="editor"
    />

    <div
      v-if="isEditorPanelVisible"
      data-editor-resize-handle="true"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize PGML editor"
      tabindex="0"
      class="group relative z-10 h-full overflow-visible cursor-ew-resize bg-transparent outline-none"
      @pointerdown="emit('startEditorResize', $event)"
      @keydown.left.prevent="emit('resizeEditorBy', -32)"
      @keydown.right.prevent="emit('resizeEditorBy', 32)"
    >
      <div
        data-editor-resize-hit-area="true"
        class="absolute inset-y-0 left-0 w-5"
      />
      <div
        data-editor-resize-divider="true"
        class="absolute inset-y-0 left-0 w-px bg-[color:var(--studio-shell-border)] transition-colors duration-150 group-hover:bg-[color:var(--studio-ring)] group-focus-visible:bg-[color:var(--studio-ring)]"
      />
      <div
        data-editor-resize-grip="true"
        class="absolute left-0 top-1/2 flex h-10 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-muted)] transition-colors duration-150 group-hover:border-[color:var(--studio-ring)] group-hover:text-[color:var(--studio-shell-text)] group-focus-visible:border-[color:var(--studio-ring)] group-focus-visible:text-[color:var(--studio-shell-text)]"
      >
        <UIcon
          name="i-lucide-grip-vertical"
          class="h-3.5 w-3.5"
        />
      </div>
    </div>

    <section class="relative min-h-0 w-full overflow-hidden p-0">
      <UButton
        :label="isEditorPanelVisible ? 'Hide PGML editor' : 'Show PGML editor'"
        :icon="isEditorPanelVisible ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
        data-editor-visibility-toggle="true"
        color="neutral"
        variant="outline"
        size="xs"
        :class="editorVisibilityButtonClass"
        @click="emit('toggleEditorVisibility')"
      />
      <slot name="canvas" />
    </section>
  </div>
</template>
