<script setup lang="ts">
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import { parsePgml, pgmlExample } from '~/utils/pgml'

const source: Ref<string> = ref(pgmlExample)
const lineNumberRef: Ref<HTMLDivElement | null> = ref(null)
const textareaRef: Ref<HTMLTextAreaElement | null> = ref(null)
type StudioTheme = 'dark' | 'light'

const studioThemeStorageKey = 'pgml-studio-theme'
const studioTheme: Ref<StudioTheme> = useState('studio-theme', () => 'dark')

const studioThemeTokens: Record<StudioTheme, Record<string, string>> = {
  dark: {
    '--studio-shell-bg': '#0a151d',
    '--studio-shell-border': 'rgba(255, 255, 255, 0.08)',
    '--studio-shell-text': '#e2edf3',
    '--studio-shell-muted': 'rgba(148, 163, 184, 0.88)',
    '--studio-shell-label': '#67e8f9',
    '--studio-shell-error': '#fda4af',
    '--studio-scroll-track': 'rgba(255, 255, 255, 0.03)',
    '--studio-scroll-track-border': 'rgba(255, 255, 255, 0.06)',
    '--studio-scroll-thumb-start': 'rgba(121, 227, 234, 0.58)',
    '--studio-scroll-thumb-end': 'rgba(139, 92, 246, 0.52)',
    '--studio-scroll-thumb-border': 'rgba(7, 17, 25, 0.92)',
    '--studio-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--studio-canvas-bg': '#07131b',
    '--studio-canvas-dot': 'rgba(255, 255, 255, 0.05)',
    '--studio-control-bg': 'rgba(8, 20, 29, 0.94)',
    '--studio-control-border': 'rgba(255, 255, 255, 0.08)',
    '--studio-input-bg': 'rgba(255, 255, 255, 0.05)',
    '--studio-rail': 'rgba(255, 255, 255, 0.1)',
    '--studio-ring': 'rgba(255, 255, 255, 0.22)',
    '--studio-node-surface-top': 'rgba(8, 20, 29, 0.98)',
    '--studio-node-surface-bottom': 'rgba(8, 20, 29, 0.98)',
    '--studio-group-surface': 'rgba(255, 255, 255, 0.018)',
    '--studio-group-surface-soft': 'rgba(255, 255, 255, 0.03)',
    '--studio-table-surface': 'rgba(8, 20, 29, 0.92)',
    '--studio-row-surface': '#07131b',
    '--studio-divider': 'rgba(255, 255, 255, 0.06)',
    '--studio-subtle': 'rgba(255, 255, 255, 0.03)',
    '--studio-node-border-neutral': 'rgba(255, 255, 255, 0.2)',
    '--studio-node-accent-mix': 'white',
    '--studio-floating-shadow': '0 20px 40px rgba(0, 0, 0, 0.28)'
  },
  light: {
    '--studio-shell-bg': '#f4f1ea',
    '--studio-shell-border': 'rgba(15, 23, 42, 0.1)',
    '--studio-shell-text': '#17212b',
    '--studio-shell-muted': 'rgba(71, 85, 105, 0.88)',
    '--studio-shell-label': '#0f766e',
    '--studio-shell-error': '#b91c1c',
    '--studio-scroll-track': 'rgba(15, 23, 42, 0.05)',
    '--studio-scroll-track-border': 'rgba(15, 23, 42, 0.08)',
    '--studio-scroll-thumb-start': 'rgba(14, 165, 233, 0.45)',
    '--studio-scroll-thumb-end': 'rgba(245, 158, 11, 0.5)',
    '--studio-scroll-thumb-border': 'rgba(244, 241, 234, 0.96)',
    '--studio-surface-hover': 'rgba(15, 23, 42, 0.06)',
    '--studio-canvas-bg': '#f8fafc',
    '--studio-canvas-dot': 'rgba(37, 99, 235, 0.08)',
    '--studio-control-bg': 'rgba(255, 255, 255, 0.92)',
    '--studio-control-border': 'rgba(15, 23, 42, 0.1)',
    '--studio-input-bg': 'rgba(255, 255, 255, 0.86)',
    '--studio-rail': 'rgba(15, 23, 42, 0.12)',
    '--studio-ring': 'rgba(37, 99, 235, 0.2)',
    '--studio-node-surface-top': 'rgba(255, 255, 255, 0.96)',
    '--studio-node-surface-bottom': 'rgba(248, 250, 252, 0.98)',
    '--studio-group-surface': 'rgba(255, 255, 255, 0.82)',
    '--studio-group-surface-soft': 'rgba(255, 255, 255, 0.78)',
    '--studio-table-surface': 'rgba(255, 255, 255, 0.94)',
    '--studio-row-surface': 'rgba(250, 251, 252, 0.98)',
    '--studio-divider': 'rgba(15, 23, 42, 0.08)',
    '--studio-subtle': 'rgba(15, 23, 42, 0.04)',
    '--studio-node-border-neutral': 'rgba(15, 23, 42, 0.14)',
    '--studio-node-accent-mix': 'black',
    '--studio-floating-shadow': '0 22px 44px rgba(148, 163, 184, 0.24)'
  }
}

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
const studioThemeStyles = computed(() => studioThemeTokens[studioTheme.value])
const studioThemeIcon = computed(() => {
  return studioTheme.value === 'dark'
    ? 'i-lucide-sun-medium'
    : 'i-lucide-moon-star'
})
const studioThemeLabel = computed(() => {
  return studioTheme.value === 'dark'
    ? 'Switch to light mode'
    : 'Switch to dark mode'
})
const lineNumbers = computed(() => {
  return Array.from({ length: Math.max(source.value.split('\n').length, 1) }, (_, index) => index + 1)
})

const loadExample = () => {
  source.value = pgmlExample
}

const clearSchema = () => {
  source.value = ''
}

const toggleStudioTheme = () => {
  studioTheme.value = studioTheme.value === 'dark' ? 'light' : 'dark'
}

const syncLineNumberScroll = () => {
  if (!lineNumberRef.value || !textareaRef.value) {
    return
  }

  lineNumberRef.value.scrollTop = textareaRef.value.scrollTop
}

onMounted(() => {
  const savedTheme = window.localStorage.getItem(studioThemeStorageKey)

  if (savedTheme === 'dark' || savedTheme === 'light') {
    studioTheme.value = savedTheme
  }
})

watch(studioTheme, (value) => {
  if (import.meta.client) {
    window.localStorage.setItem(studioThemeStorageKey, value)
  }
})
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    :style="studioThemeStyles"
    class="grid h-screen min-h-0 w-full grid-cols-[320px_minmax(0,1fr)] gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] max-[1100px]:h-auto max-[1100px]:grid-cols-1"
  >
    <aside class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] pr-0 max-[1100px]:border-r-0">
      <div class="flex h-full min-h-0 flex-col bg-[color:var(--studio-shell-bg)]">
        <div class="flex items-center justify-between gap-2 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-3 py-2">
          <span class="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">PGML</span>

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
            class="pgml-editor-scroll h-full min-h-0 w-full resize-none overflow-y-auto border-none bg-[color:var(--studio-shell-bg)] px-3.5 py-3 font-mono text-[0.84rem] leading-[1.9] text-[color:var(--studio-shell-text)] caret-[color:var(--studio-shell-label)] outline-none placeholder:text-[color:var(--studio-shell-muted)]"
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
      <PgmlDiagramCanvas :model="parsedModel" />
    </section>
  </div>
</template>
