import type { Completion, CompletionContext } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import type { Diagnostic as CodeMirrorDiagnostic } from '@codemirror/lint'
import type { StringStream } from '@codemirror/language'
import { autocompletion, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  HighlightStyle,
  StreamLanguage,
  bracketMatching,
  indentUnit,
  syntaxHighlighting
} from '@codemirror/language'
import { lintGutter, linter } from '@codemirror/lint'
import { EditorView, drawSelection, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { getPgmlCompletionItems, getPgmlDiagnostics } from './pgml-language'

type PgmlStreamState = {
  blockKind: string | null
  sourceDelimiter: string | null
}

export type PgmlCodeMirrorOptions = {
  placeholder?: string
}

const pgmlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--studio-shell-label)', fontWeight: '700' },
  { tag: tags.comment, color: 'var(--studio-shell-muted)', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: '#34d399' },
  { tag: [tags.number, tags.integer, tags.float], color: '#f59e0b' },
  { tag: [tags.bool, tags.atom], color: '#38bdf8' },
  { tag: tags.propertyName, color: '#fda4af' },
  { tag: [tags.typeName, tags.className], color: '#c084fc' },
  { tag: tags.operator, color: '#fb7185' },
  { tag: [tags.punctuation, tags.separator], color: 'rgba(226,232,240,0.65)' }
])

const pgmlEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--studio-shell-bg)',
    color: 'var(--studio-shell-text)',
    fontFamily: 'var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    fontSize: '0.84rem'
  },
  '.cm-scroller': {
    overflow: 'auto',
    lineHeight: '1.9',
    fontFamily: 'inherit'
  },
  '.cm-content': {
    minHeight: '100%',
    padding: '0.75rem 0.875rem 2rem',
    caretColor: 'var(--studio-shell-label)'
  },
  '.cm-line': {
    padding: '0 0.1rem'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--studio-shell-label)'
  },
  '.cm-gutters': {
    minHeight: '100%',
    borderRight: '1px solid var(--studio-shell-border)',
    backgroundColor: 'var(--studio-shell-bg)',
    color: 'var(--studio-shell-muted)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    color: 'var(--studio-shell-text)'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(148, 163, 184, 0.05)'
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(245, 158, 11, 0.22) !important'
  },
  '.cm-panels': {
    backgroundColor: 'var(--studio-control-bg)',
    color: 'var(--studio-shell-text)'
  },
  '.cm-tooltip': {
    borderRadius: '0',
    border: '1px solid var(--studio-shell-border)',
    backgroundColor: 'var(--studio-control-bg)',
    color: 'var(--studio-shell-text)',
    boxShadow: 'var(--studio-floating-shadow)'
  },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    color: 'var(--studio-shell-text)'
  },
  '.cm-completionLabel': {
    fontFamily: 'inherit'
  },
  '.cm-tooltip-lint ul': {
    margin: '0',
    padding: '0.35rem 0.45rem'
  },
  '.cm-lintRange-error': {
    backgroundColor: 'rgba(251, 113, 133, 0.18)'
  },
  '.cm-lintRange-warning': {
    backgroundColor: 'rgba(245, 158, 11, 0.14)'
  }
})

const findSourceDelimiter = (lineText: string) => {
  const match = lineText.match(/(?:source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/)

  if (!match) {
    return null
  }

  const delimiter = match[1]
  const remainder = match[2]

  if (!delimiter) {
    return null
  }

  if (typeof remainder === 'string' && remainder.includes(delimiter)) {
    return ''
  }

  return delimiter
}

const consumeTokenWhile = (stream: StringStream, pattern: RegExp) => {
  while (!stream.eol() && pattern.test(stream.peek() || '')) {
    stream.next()
  }
}

const pgmlStreamParser = StreamLanguage.define<PgmlStreamState>({
  startState: () => ({
    blockKind: null,
    sourceDelimiter: null
  }),

  copyState: state => ({
    blockKind: state.blockKind,
    sourceDelimiter: state.sourceDelimiter
  }),

  token: (stream, state) => {
    if (stream.sol()) {
      const delimiter = findSourceDelimiter(stream.string.trim())

      if (stream.string.trim().endsWith('{')) {
        const keyword = stream.string.trim().slice(0, -1).trim().split(/\s+/)[0]
        state.blockKind = keyword || state.blockKind
      }
      if (delimiter !== null && delimiter.length > 0) {
        state.sourceDelimiter = delimiter
      }
      if (state.sourceDelimiter && stream.string.includes(state.sourceDelimiter) && !stream.string.trim().startsWith('source:') && !stream.string.trim().startsWith('definition:')) {
        stream.skipToEnd()
        state.sourceDelimiter = null
        return 'string'
      }
    }

    if (state.sourceDelimiter) {
      stream.skipToEnd()
      return 'string'
    }

    if (stream.match(/\s+/)) {
      return null
    }

    if (stream.match(/\/\/.*/)) {
      return 'comment'
    }

    if (stream.match(/#(?:[\da-f]{3}|[\da-f]{6})/i)) {
      return 'atom'
    }

    if (stream.match(/"(?:[^"\\]|\\.)*"/) || stream.match(/'(?:[^'\\]|\\.)*'/)) {
      return 'string'
    }

    if (stream.match(/\$(?:[A-Za-z0-9_]+)?\$/)) {
      return 'string'
    }

    if (stream.match(/\b(?:TableGroup|Table|Enum|Domain|Composite|Function|Procedure|Trigger|Sequence|Properties|Ref:)\b/)) {
      return 'keyword'
    }

    if (stream.match(/\b(?:docs|affects|source|definition|Note|Index|Constraint)\b(?=\s|:|\(|\{)/)) {
      return 'keyword'
    }

    if (stream.match(/\b(?:pk|unique|not|null|default|note|ref|language|volatility|security|timing|events|level|function|arguments|as|start|increment|min|max|cache|cycle|owned_by|summary|writes|sets|depends_on|reads|calls|uses|visible|collapsed|table_columns|width|height|color|x|y)\b(?=\s|:|\])/)) {
      return 'propertyName'
    }

    if (stream.match(/\b(?:true|false)\b/)) {
      return 'atom'
    }

    if (stream.match(/[<>-]/)) {
      return 'operator'
    }

    if (stream.match(/[:[\]{}(),.]/)) {
      return 'punctuation'
    }

    if (stream.match(/-?\d+(?:\.\d+)?/)) {
      return 'number'
    }

    if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
      if (state.blockKind === 'Enum' || state.blockKind === 'Domain' || state.blockKind === 'Composite') {
        return 'typeName'
      }

      return 'variableName'
    }

    consumeTokenWhile(stream, /[^\s]/)

    return null
  }
})

const pgmlCompletionSource = (context: CompletionContext) => {
  const source = context.state.doc.toString()
  const items = getPgmlCompletionItems(source, context.pos)

  if (items.length === 0) {
    if (context.explicit) {
      return {
        from: context.pos,
        options: [] satisfies Completion[]
      }
    }

    return null
  }

  const from = items[0] ? items[0].from : context.pos
  const to = items[0] ? items[0].to : context.pos

  return {
    from,
    to,
    options: items.map((item) => {
      return {
        label: item.label,
        detail: item.detail,
        type: item.kind,
        apply: item.apply
      } satisfies Completion
    })
  }
}

const createCodeMirrorDiagnostics = (source: string) => {
  return getPgmlDiagnostics(source).map((diagnostic) => {
    return {
      from: diagnostic.from,
      to: diagnostic.to,
      severity: diagnostic.severity,
      message: diagnostic.message,
      source: diagnostic.code
    } satisfies CodeMirrorDiagnostic
  })
}

export const createPgmlCodeMirrorExtensions = (options: PgmlCodeMirrorOptions = {}) => {
  const placeholderText = typeof options.placeholder === 'string' && options.placeholder.length > 0
    ? options.placeholder
    : 'Paste PGML here...'

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    lineNumbers(),
    bracketMatching(),
    indentUnit.of('  '),
    keymap.of([
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap
    ]),
    pgmlStreamParser,
    syntaxHighlighting(pgmlHighlightStyle),
    autocompletion({
      activateOnTyping: true,
      defaultKeymap: true,
      override: [pgmlCompletionSource]
    }),
    linter((view) => {
      return createCodeMirrorDiagnostics(view.state.doc.toString())
    }, {
      delay: 150
    }),
    lintGutter(),
    placeholder(placeholderText),
    pgmlEditorTheme,
    EditorView.contentAttributes.of({
      'spellcheck': 'false',
      'aria-label': 'PGML editor',
      'data-pgml-editor-content': 'true'
    })
  ]

  return extensions
}
