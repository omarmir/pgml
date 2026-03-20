import type { Ref } from 'vue'
import type { PgmlSourceRange } from '~/utils/pgml'

export type PgmlSourceEditorHandle = {
  focusOffset: (from: number, to?: number) => void
  focusSourceRange: (sourceRange: PgmlSourceRange) => void
  getScrollTop: () => number
  getValue: () => string
  setScrollTop: (scrollTop: number) => void
}

export const usePgmlSourceEditor = () => {
  const editorRef: Ref<PgmlSourceEditorHandle | null> = ref(null)

  const focusEditorSourceRange = (sourceRange: PgmlSourceRange) => {
    if (!editorRef.value) {
      return
    }

    editorRef.value.focusSourceRange(sourceRange)
  }

  return {
    editorRef,
    focusEditorSourceRange
  }
}
