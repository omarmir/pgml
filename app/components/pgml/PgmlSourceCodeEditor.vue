<script setup lang="ts">
import type { Ref } from 'vue'
import type { PgmlSourceRange } from '~/utils/pgml'
import { Compartment, EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { createPgmlCodeMirrorExtensions } from '~/utils/pgml-codemirror'
import { createSqlCodeMirrorExtensions } from '~/utils/sql-codemirror'
import { getPgmlSourceSelectionRange } from '~/utils/pgml'

type SourceEditorLanguageMode = 'pgml' | 'sql'

type PgmlEditorHostElement = HTMLDivElement & {
  __pgmlEditorView?: EditorView
}

const {
  languageMode = 'pgml',
  modelValue,
  placeholder = 'Paste PGML here...',
  readOnly = false
} = defineProps<{
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
const editableCompartment = new Compartment()
const languageCompartment = new Compartment()
const readOnlyCompartment = new Compartment()
let isApplyingExternalUpdate = false

const buildLanguageExtensions = () => {
  return languageMode === 'sql'
    ? createSqlCodeMirrorExtensions({
        placeholder
      })
    : createPgmlCodeMirrorExtensions({
        placeholder
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
    return
  }

  isApplyingExternalUpdate = true
  viewRef.value.dispatch({
    changes: {
      from: 0,
      to: currentValue.length,
      insert: value
    }
  })
  isApplyingExternalUpdate = false
}

onMounted(() => {
  if (!containerRef.value) {
    return
  }

  const view = new EditorView({
    parent: containerRef.value,
    state: EditorState.create({
      doc: modelValue,
      extensions: [
        editableCompartment.of(EditorView.editable.of(!readOnly)),
        languageCompartment.of(buildLanguageExtensions()),
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged || isApplyingExternalUpdate) {
            return
          }

          emit('update:modelValue', update.state.doc.toString())
        })
      ]
    })
  })

  containerRef.value.__pgmlEditorView = view
  view.dom.setAttribute('data-pgml-editor-surface', 'true')
  view.scrollDOM.setAttribute('data-pgml-editor-scroller', 'true')
  viewRef.value = view
})

watch(() => modelValue, (nextValue) => {
  setValue(nextValue)
})

watch(() => readOnly, (nextValue) => {
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

watch(() => [languageMode, placeholder], () => {
  if (!viewRef.value) {
    return
  }

  viewRef.value.dispatch({
    effects: languageCompartment.reconfigure(buildLanguageExtensions())
  })
})

onBeforeUnmount(() => {
  if (containerRef.value) {
    delete containerRef.value.__pgmlEditorView
  }

  if (viewRef.value) {
    viewRef.value.destroy()
    viewRef.value = null
  }
})

defineExpose({
  focusOffset,
  focusSourceRange,
  getScrollTop,
  getValue,
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
