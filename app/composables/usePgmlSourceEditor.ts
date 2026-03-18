import type { Ref } from 'vue'
import type { PgmlSourceRange } from '~/utils/pgml'
import { getPgmlSourceScrollTop, getPgmlSourceSelectionRange } from '~/utils/pgml'

export const usePgmlSourceEditor = (source: Ref<string>) => {
  const lineNumberRef: Ref<HTMLDivElement | null> = ref(null)
  const textareaRef: Ref<HTMLTextAreaElement | null> = ref(null)

  const lineNumbers = computed(() => {
    return Array.from({ length: Math.max(source.value.split('\n').length, 1) }, (_, index) => index + 1)
  })

  const syncLineNumberScroll = () => {
    if (!lineNumberRef.value || !textareaRef.value) {
      return
    }

    lineNumberRef.value.scrollTop = textareaRef.value.scrollTop
  }

  const focusEditorSourceRange = (sourceRange: PgmlSourceRange) => {
    if (!textareaRef.value) {
      return
    }

    const selectionRange = getPgmlSourceSelectionRange(source.value, sourceRange)

    if (!selectionRange) {
      return
    }

    const textarea = textareaRef.value
    const parsedLineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight)
    const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : 24
    const targetScrollTop = getPgmlSourceScrollTop(sourceRange, lineHeight, 1)

    textarea.focus()
    textarea.setSelectionRange(selectionRange.start, selectionRange.end)
    textarea.scrollTop = targetScrollTop
    syncLineNumberScroll()
    window.requestAnimationFrame(() => {
      textarea.scrollTop = targetScrollTop
      syncLineNumberScroll()
    })
  }

  return {
    focusEditorSourceRange,
    lineNumberRef,
    lineNumbers,
    syncLineNumberScroll,
    textareaRef
  }
}
