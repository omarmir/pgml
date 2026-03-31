<script setup lang="ts">
import type { Ref, ShallowRef } from 'vue'
import type { PgmlSourceRange } from '~/utils/pgml'
import type { PgmlDocumentAnalysis, PgmlLanguageDiagnostic } from '~/utils/pgml-language'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import {
  createPgmlCodeMirrorDiagnosticsExtensions,
  createPgmlCodeMirrorExtensions
} from '~/utils/pgml-codemirror'
import { createSqlCodeMirrorExtensions } from '~/utils/sql-codemirror'
import { getPgmlSourceSelectionRange } from '~/utils/pgml'
import { analyzePgmlDocument } from '~/utils/pgml-language'

type SourceEditorLanguageMode = 'pgml' | 'pgml-snippet' | 'sql'

type PgmlEditorHostElement = HTMLDivElement & {
  __pgmlEditorView?: EditorView
}

const {
  activateCompletionOnTyping = true,
  commitDebounceMs = 0,
  diagnosticsDelayMs = 150,
  externalDiagnostics = null,
  languageMode = 'pgml',
  modelValue,
  placeholder = 'Paste PGML here...',
  readOnly = false
} = defineProps<{
  activateCompletionOnTyping?: boolean
  commitDebounceMs?: number
  diagnosticsDelayMs?: number
  externalDiagnostics?: PgmlLanguageDiagnostic[] | null
  languageMode?: SourceEditorLanguageMode
  modelValue: string
  placeholder?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef: Ref<PgmlEditorHostElement | null> = ref(null)
const viewRef: Ref<EditorView | null> = ref(null)
const isAutomationEnvironment: Ref<boolean> = ref(false)
const completionAnalysis: ShallowRef<PgmlDocumentAnalysis | null> = shallowRef(null)
const editableCompartment = new Compartment()
const diagnosticsCompartment = new Compartment()
const languageCompartment = new Compartment()
const readOnlyCompartment = new Compartment()
let isApplyingExternalUpdate = false
let pendingCommitTimeout: ReturnType<typeof setTimeout> | null = null
let pendingCompletionAnalysisIdleHandle: number | null = null
let pendingCompletionAnalysisTimeout: ReturnType<typeof setTimeout> | null = null
let completionAnalysisRevision = 0
let pendingCommitScheduled = false
const effectiveCommitDebounceMs = computed(() => {
  return isAutomationEnvironment.value ? 0 : commitDebounceMs
})
const effectiveCompletionAnalysisDelayMs = computed(() => {
  if (isAutomationEnvironment.value) {
    return 0
  }

  if (effectiveCommitDebounceMs.value > 0) {
    return Math.max(40, Math.min(120, effectiveCommitDebounceMs.value))
  }

  return 60
})

const clearPendingCommit = () => {
  if (pendingCommitTimeout) {
    clearTimeout(pendingCommitTimeout)
    pendingCommitTimeout = null
  }

  pendingCommitScheduled = false
}

const clearPendingCompletionAnalysis = () => {
  if (pendingCompletionAnalysisTimeout) {
    clearTimeout(pendingCompletionAnalysisTimeout)
    pendingCompletionAnalysisTimeout = null
  }

  if (pendingCompletionAnalysisIdleHandle !== null && import.meta.client && 'cancelIdleCallback' in window) {
    window.cancelIdleCallback(pendingCompletionAnalysisIdleHandle)
    pendingCompletionAnalysisIdleHandle = null
  }
}

const emitCommittedValue = (value: string) => {
  clearPendingCommit()

  if (value === modelValue) {
    return
  }

  emit('update:modelValue', value)
}

const flushPendingChanges = async () => {
  if (pendingCommitScheduled) {
    emitCommittedValue(getValue())
    await nextTick()
    return
  }

  const currentValue = getValue()

  if (currentValue === modelValue) {
    return
  }

  emit('update:modelValue', currentValue)
  await nextTick()
}

const hasPendingChanges = () => {
  return pendingCommitScheduled || getValue() !== modelValue
}

const runCompletionAnalysis = (revision: number) => {
  pendingCompletionAnalysisIdleHandle = null
  pendingCompletionAnalysisTimeout = null

  if (revision !== completionAnalysisRevision || languageMode === 'sql') {
    if (languageMode === 'sql') {
      completionAnalysis.value = null
    }

    return
  }

  const view = viewRef.value

  if (!view) {
    return
  }

  completionAnalysis.value = analyzePgmlDocument(view.state.doc.toString())
}

const queueCompletionAnalysisExecution = (revision: number) => {
  if (import.meta.client && 'requestIdleCallback' in window) {
    pendingCompletionAnalysisIdleHandle = window.requestIdleCallback(() => {
      runCompletionAnalysis(revision)
    }, {
      timeout: 180
    })
    return
  }

  pendingCompletionAnalysisTimeout = setTimeout(() => {
    pendingCompletionAnalysisTimeout = null
    runCompletionAnalysis(revision)
  }, 0)
}

const scheduleCompletionAnalysis = (options: {
  immediate?: boolean
} = {}) => {
  clearPendingCompletionAnalysis()

  if (languageMode === 'sql') {
    completionAnalysis.value = null
    return
  }

  const nextRevision = completionAnalysisRevision + 1

  completionAnalysisRevision = nextRevision

  if (options.immediate || effectiveCompletionAnalysisDelayMs.value <= 0) {
    queueCompletionAnalysisExecution(nextRevision)
    return
  }

  pendingCompletionAnalysisTimeout = setTimeout(() => {
    pendingCompletionAnalysisTimeout = null
    queueCompletionAnalysisExecution(nextRevision)
  }, effectiveCompletionAnalysisDelayMs.value)
}

const queueValueCommit = () => {
  if (readOnly) {
    return
  }

  pendingCommitScheduled = true

  if (effectiveCommitDebounceMs.value <= 0) {
    emitCommittedValue(getValue())
    return
  }

  if (pendingCommitTimeout) {
    clearTimeout(pendingCommitTimeout)
  }

  pendingCommitTimeout = setTimeout(() => {
    if (!pendingCommitScheduled) {
      return
    }

    emitCommittedValue(getValue())
  }, effectiveCommitDebounceMs.value)
}

const buildLanguageExtensions = () => {
  return languageMode === 'sql'
    ? createSqlCodeMirrorExtensions({
        placeholder
      })
    : createPgmlCodeMirrorExtensions({
        activateCompletionOnTyping,
        enableDiagnostics: false,
        getCompletionAnalysis: () => completionAnalysis.value,
        placeholder
      })
}

const buildDiagnosticsExtensions = () => {
  if (languageMode !== 'pgml') {
    return []
  }

  return createPgmlCodeMirrorDiagnosticsExtensions({
    externalDiagnostics,
    linterDelayMs: diagnosticsDelayMs
  })
}

const focusOffset = (from: number, to?: number) => {
  if (!viewRef.value) {
    return
  }

  const end = typeof to === 'number' ? to : from
  const selection = EditorSelection.range(from, end)

  viewRef.value.dispatch({
    selection,
    effects: EditorView.scrollIntoView(from, {
      y: 'center'
    })
  })
  viewRef.value.focus()
}

const focusSourceRange = (sourceRange: PgmlSourceRange) => {
  if (!viewRef.value) {
    return
  }

  const currentSource = viewRef.value.state.doc.toString()
  const selectionRange = getPgmlSourceSelectionRange(currentSource, sourceRange)

  if (!selectionRange) {
    return
  }

  focusOffset(selectionRange.start, selectionRange.end)
}

const getValue = () => {
  if (!viewRef.value) {
    return modelValue
  }

  return viewRef.value.state.doc.toString()
}

const getScrollTop = () => {
  if (!viewRef.value) {
    return 0
  }

  return viewRef.value.scrollDOM.scrollTop
}

const setScrollTop = (scrollTop: number) => {
  if (!viewRef.value) {
    return
  }

  viewRef.value.scrollDOM.scrollTop = scrollTop
}

const setValue = (value: string) => {
  if (!viewRef.value) {
    return
  }

  const currentValue = viewRef.value.state.doc.toString()

  if (currentValue === value) {
    if (pendingCommitScheduled && value === modelValue) {
      clearPendingCommit()
    }

    return
  }

  clearPendingCommit()
  isApplyingExternalUpdate = true
  viewRef.value.dispatch({
    changes: {
      from: 0,
      to: currentValue.length,
      insert: value
    }
  })
  isApplyingExternalUpdate = false
  scheduleCompletionAnalysis({
    immediate: true
  })
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }

  if (import.meta.client) {
    isAutomationEnvironment.value = navigator.webdriver
  }

  const view = new EditorView({
    parent: containerRef.value,
    state: EditorState.create({
      doc: modelValue,
      extensions: [
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        languageCompartment.of(buildLanguageExtensions()),
        diagnosticsCompartment.of(buildDiagnosticsExtensions()),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.domEventHandlers({
          blur: () => {
            void flushPendingChanges()
            return false
          }
        }),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalUpdate) {
            return
          }

          scheduleCompletionAnalysis()
          queueValueCommit()
        })
      ]
    })
  })

  containerRef.value.__pgmlEditorView = view
  view.dom.setAttribute('data-pgml-editor-surface', 'true')
  view.scrollDOM.setAttribute('data-pgml-editor-scroller', 'true')
  viewRef.value = view
  scheduleCompletionAnalysis({
    immediate: true
  })
})

watch(() => modelValue, (nextValue) => {
  setValue(nextValue)
})

watch(() => readOnly, (nextValue) => {
  if (nextValue) {
    void flushPendingChanges()
  }

  if (!viewRef.value) {
    return
  }

  viewRef.value.dispatch({
    effects: [
      editableCompartment.reconfigure(EditorView.editable.of(!nextValue)),
      readOnlyCompartment.reconfigure(EditorState.readOnly.of(nextValue))
    ]
  })
})

watch(() => [
  activateCompletionOnTyping,
  languageMode,
  placeholder
], () => {
  if (!viewRef.value) {
    return
  }

  viewRef.value.dispatch({
    effects: languageCompartment.reconfigure(buildLanguageExtensions())
  })

  scheduleCompletionAnalysis({
    immediate: true
  })
})

watch(() => [
  diagnosticsDelayMs,
  externalDiagnostics,
  languageMode
], () => {
  if (!viewRef.value) {
    return
  }

  viewRef.value.dispatch({
    effects: diagnosticsCompartment.reconfigure(buildDiagnosticsExtensions())
  })
})

onBeforeUnmount(() => {
  clearPendingCommit()
  clearPendingCompletionAnalysis()

  if (containerRef.value) {
    delete containerRef.value.__pgmlEditorView
  }

  if (viewRef.value) {
    viewRef.value.destroy()
    viewRef.value = null
  }
})

defineExpose({
  flushPendingChanges,
  focusOffset,
  focusSourceRange,
  getScrollTop,
  getValue,
  hasPendingChanges,
  setScrollTop
})
</script>

<template>
  <div
    ref="containerRef"
    data-pgml-editor="true"
    :data-pgml-editor-language="languageMode"
    class="h-full min-h-0 w-full overflow-hidden bg-[color:var(--studio-shell-bg)]"
  />
</template>
