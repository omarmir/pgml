import type { Ref } from 'vue'
import type { PgmlSourceRange } from '~/utils/pgml'
import type { PgmlLanguageDiagnostic } from '~/utils/pgml-language'

export type PgmlSourceEditorHandle = {
  flushPendingChanges: () => Promise<void>
  focusOffset: (from: number, to?: number) => void
  focusSourceRange: (sourceRange: PgmlSourceRange) => void
  getScrollTop: () => number
  getValue: () => string
  hasPendingChanges: () => boolean
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

  const focusEditorDiagnostic = (diagnostic: Pick<PgmlLanguageDiagnostic, 'from' | 'to'>) => {
    if (!editorRef.value) {
      return
    }

    editorRef.value.focusOffset(diagnostic.from, diagnostic.to)
  }

  return {
    editorRef,
    focusEditorDiagnostic,
    focusEditorSourceRange
  }
}
