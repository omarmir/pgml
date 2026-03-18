<script setup lang="ts">
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import { parsePgml, pgmlExample } from '~/utils/pgml'

type PgmlDiagramCanvasExposed = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
}

const source: Ref<string> = ref(pgmlExample)
const lineNumberRef: Ref<HTMLDivElement | null> = ref(null)
const textareaRef: Ref<HTMLTextAreaElement | null> = ref(null)
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const exportMenuRef: Ref<HTMLDivElement | null> = ref(null)
const exportMenuOpen: Ref<boolean> = ref(false)
const isExporting: Ref<boolean> = ref(false)
const exportScales = [1, 2, 3, 4, 8]
const { studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()

const parsedState = computed(() => {
  try {
    return {
      model: parsePgml(source.value),
      error: null
    }
  } catch (error) {
    return {
      model: parsePgml(pgmlExample),
      error: error instanceof Error ? error.message : 'Unable to parse PGML.'
    }
  }
})

const parsedModel = computed(() => parsedState.value.model)
const parseError = computed(() => parsedState.value.error)
const lineNumbers = computed(() => {
  return Array.from({ length: Math.max(source.value.split('\n').length, 1) }, (_, index) => index + 1)
})

const loadExample = () => {
  source.value = pgmlExample
}

const clearSchema = () => {
  source.value = ''
}

const toggleExportMenu = () => {
  exportMenuOpen.value = !exportMenuOpen.value
}

const runExport = async (format: 'svg' | 'png', scaleFactor?: number) => {
  if (!canvasRef.value || isExporting.value) {
    return
  }

  exportMenuOpen.value = false
  isExporting.value = true

  try {
    await canvasRef.value.exportDiagram(format, scaleFactor)
  } catch (error) {
    console.error(error)
  } finally {
    isExporting.value = false
  }
}

const syncLineNumberScroll = () => {
  if (!lineNumberRef.value || !textareaRef.value) {
    return
  }

  lineNumberRef.value.scrollTop = textareaRef.value.scrollTop
}

onClickOutside(exportMenuRef, () => {
  exportMenuOpen.value = false
})
</script>

<template>
  <div class="grid h-screen min-h-0 w-full grid-cols-[320px_minmax(0,1fr)] gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] max-[1100px]:h-auto max-[1100px]:grid-cols-1">
    <aside class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] pr-0 max-[1100px]:border-r-0">
      <div class="flex h-full min-h-0 flex-col bg-[color:var(--studio-shell-bg)]">
        <div class="flex items-center justify-between gap-2 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-3 py-2">
          <div class="flex items-center gap-2">
            <UButton
              to="/"
              icon="i-lucide-arrow-left"
              color="neutral"
              variant="ghost"
              class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              aria-label="Back to home"
            />
            <span class="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">PGML</span>
          </div>

          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-flask-conical"
              color="neutral"
              variant="ghost"
              class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              aria-label="Load example"
              @click="loadExample"
            />
            <UButton
              icon="i-lucide-eraser"
              color="neutral"
              variant="ghost"
              class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              aria-label="Clear schema"
              @click="clearSchema"
            />
            <UButton
              :icon="studioThemeIcon"
              color="neutral"
              variant="ghost"
              class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              :aria-label="studioThemeLabel"
              :title="studioThemeLabel"
              @click="toggleStudioTheme"
            />

            <div
              ref="exportMenuRef"
              class="relative"
            >
              <UButton
                icon="i-lucide-download"
                color="neutral"
                variant="ghost"
                class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                aria-label="Export diagram"
                :disabled="isExporting"
                @click.stop="toggleExportMenu"
              />

              <div
                v-if="exportMenuOpen"
                class="absolute right-0 top-[calc(100%+4px)] z-20 grid min-w-[140px] gap-px border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-border)]"
              >
                <button
                  v-for="scaleOption in exportScales"
                  :key="scaleOption"
                  type="button"
                  class="bg-[color:var(--studio-control-bg)] px-3 py-2 text-left font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                  @click="runExport('png', scaleOption)"
                >
                  PNG {{ scaleOption }}x
                </button>

                <button
                  type="button"
                  class="bg-[color:var(--studio-control-bg)] px-3 py-2 text-left font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                  @click="runExport('svg')"
                >
                  SVG
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] overflow-hidden bg-[color:var(--studio-shell-bg)]">
          <div
            ref="lineNumberRef"
            class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] py-3 text-center font-mono text-[0.78rem] leading-[1.9] text-[color:var(--studio-shell-muted)]"
          >
            <span
              v-for="line in lineNumbers"
              :key="line"
              class="block"
            >
              {{ line }}
            </span>
          </div>

          <textarea
            ref="textareaRef"
            v-model="source"
            data-pgml-editor="true"
            class="h-full min-h-0 w-full resize-none overflow-y-auto border-none bg-[color:var(--studio-shell-bg)] px-3.5 py-3 font-mono text-[0.84rem] leading-[1.9] text-[color:var(--studio-shell-text)] caret-[color:var(--studio-shell-label)] outline-none placeholder:text-[color:var(--studio-shell-muted)]"
            spellcheck="false"
            placeholder="Paste PGML here..."
            @scroll="syncLineNumberScroll"
          />
        </div>
      </div>

      <div
        v-if="parseError"
        class="border-t border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-4 py-2 font-mono text-[0.72rem] leading-6 text-[color:var(--studio-shell-error)]"
      >
        {{ parseError }}
      </div>
    </aside>

    <section class="min-h-0 w-full overflow-hidden p-0">
      <PgmlDiagramCanvas
        ref="canvasRef"
        :model="parsedModel"
      />
    </section>
  </div>
</template>
