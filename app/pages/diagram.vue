<script setup lang="ts">
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import { parsePgml, pgmlExample } from '~/utils/pgml'

const source: Ref<string> = ref(pgmlExample)
const lineNumberRef: Ref<HTMLDivElement | null> = ref(null)
const textareaRef: Ref<HTMLTextAreaElement | null> = ref(null)

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

const syncLineNumberScroll = () => {
  if (!lineNumberRef.value || !textareaRef.value) {
    return
  }

  lineNumberRef.value.scrollTop = textareaRef.value.scrollTop
}
</script>

<template>
  <div class="grid h-screen min-h-0 w-full grid-cols-[320px_minmax(0,1fr)] gap-0 overflow-hidden max-[1100px]:h-auto max-[1100px]:grid-cols-1">
    <aside class="min-h-0 overflow-hidden border-r border-white/8 pr-0 max-[1100px]:border-r-0">
      <div class="flex h-full min-h-0 flex-col bg-transparent">
        <div class="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
          <span class="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-cyan-300">PGML</span>

          <div class="flex items-center gap-1">
            <UButton
              icon="i-lucide-flask-conical"
              color="neutral"
              variant="ghost"
              class="rounded-none"
              aria-label="Load example"
              @click="loadExample"
            />
            <UButton
              icon="i-lucide-eraser"
              color="neutral"
              variant="ghost"
              class="rounded-none"
              aria-label="Clear schema"
              @click="clearSchema"
            />
          </div>
        </div>

        <div class="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] overflow-hidden">
          <div
            ref="lineNumberRef"
            class="min-h-0 overflow-hidden border-r border-white/8 bg-transparent py-3 text-center font-mono text-[0.78rem] leading-[1.9] text-slate-400/90"
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
            class="pgml-editor-scroll h-full min-h-0 w-full resize-none overflow-y-auto border-none bg-transparent px-3.5 py-3 font-mono text-[0.84rem] leading-[1.9] text-slate-100 outline-none"
            spellcheck="false"
            placeholder="Paste PGML here..."
            @scroll="syncLineNumberScroll"
          />
        </div>
      </div>

      <div
        v-if="parseError"
        class="border-t border-white/8 px-4 py-2 font-mono text-[0.72rem] leading-6 text-rose-300"
      >
        {{ parseError }}
      </div>
    </aside>

    <section class="min-h-0 w-full overflow-hidden p-0">
      <PgmlDiagramCanvas :model="parsedModel" />
    </section>
  </div>
</template>
