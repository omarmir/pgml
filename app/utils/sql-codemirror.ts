import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, indentUnit } from '@codemirror/language'
import { sql } from '@codemirror/lang-sql'
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder
} from '@codemirror/view'
import { studioCodeMirrorTheme } from './pgml-codemirror'

export type SqlCodeMirrorOptions = {
  placeholder?: string
}

export const createSqlCodeMirrorExtensions = (options: SqlCodeMirrorOptions = {}) => {
  const placeholderText = typeof options.placeholder === 'string' && options.placeholder.length > 0
    ? options.placeholder
    : 'Edit SQL here...'

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    lineNumbers(),
    bracketMatching(),
    closeBrackets(),
    EditorState.tabSize.of(2),
    indentUnit.of('  '),
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...closeBracketsKeymap
    ]),
    sql(),
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: true
    }),
    placeholder(placeholderText),
    studioCodeMirrorTheme,
    EditorView.contentAttributes.of({
      'spellcheck': 'false',
      'aria-label': 'SQL editor',
      'data-pgml-editor-content': 'true'
    })
  ]

  return extensions
}
