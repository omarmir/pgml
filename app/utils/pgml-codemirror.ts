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
  // The current innermost block drives contextual styling such as column type
  // highlighting inside tables and composites.
  blockKind: string | null
  // StreamLanguage only sees one token at a time, so block nesting is tracked
  // manually to keep token decisions aligned with nested PGML blocks.
  blockStack: string[]
  // Table-like rows need different styling for identifier vs type positions.
  lineIdentifierIndex: number
  lineAllowsColumnTypeHighlight: boolean
  lineIsBlockDeclaration: boolean
  lastNamedTokenType: string | null
  // Property-aware tokens such as `base`, `based_on`, and `parent` influence
  // how the next identifier should be colored.
  lastPropertyName: string | null
  sourceDelimiter: string | null
}

export type PgmlCodeMirrorOptions = {
  placeholder?: string
}

const pgmlBlockKeywordPattern = /\b(?:VersionSet|Workspace|Version|Snapshot|TableGroup|Table|Enum|Domain|Composite|Function|Procedure|Trigger|Sequence|Properties|Ref:)\b/
const pgmlNestedKeywordPattern = /\b(?:docs|affects|source|definition|Note|Index|Constraint)\b(?=\s|:|\(|\{)/
const pgmlPropertyKeywordPattern = /\b(?:pk|unique|not|null|default|note|ref|language|volatility|security|timing|events|level|function|arguments|as|base|start|increment|min|max|cache|cycle|owned_by|summary|writes|sets|depends_on|reads|calls|uses|visible|collapsed|masonry|table_columns|table_width_scale|width|height|color|x|y|name|role|parent|created_at|based_on|updated_at)\b(?=\s|:|\])/
const pgmlAtomPattern = /\b(?:true|false|design|implementation)\b/

const pgmlHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--studio-shell-label)', fontWeight: '700' },
  { tag: tags.comment, color: 'var(--studio-shell-muted)', fontStyle: 'italic' },
  { tag: [tags.string, tags.special(tags.string)], color: 'color-mix(in srgb, #15803d 72%, var(--studio-shell-text) 28%)' },
  { tag: [tags.number, tags.integer, tags.float], color: '#f59e0b' },
  { tag: [tags.bool, tags.atom], color: '#38bdf8' },
  { tag: tags.propertyName, color: '#fda4af' },
  { tag: tags.typeName, color: '#c084fc' },
  { tag: tags.className, color: 'color-mix(in srgb, var(--studio-shell-text) 52%, var(--studio-shell-label) 48%)', fontWeight: '500' },
  { tag: tags.operator, color: '#fb7185' },
  { tag: [tags.punctuation, tags.separator], color: 'var(--studio-editor-punctuation)' }
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
  '.cm-matchingBracket': {
    color: 'var(--studio-shell-text)',
    backgroundColor: 'color-mix(in srgb, var(--studio-shell-label) 12%, transparent)',
    outline: '1px solid color-mix(in srgb, var(--studio-shell-label) 24%, transparent)'
  },
  '.cm-nonmatchingBracket': {
    color: 'var(--studio-shell-error)'
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

const createTestStringStream = (lineText: string) => {
  let position = 0
  const stream: Pick<StringStream, 'current' | 'eol' | 'match' | 'next' | 'peek' | 'skipToEnd' | 'sol' | 'start' | 'string' | 'pos'> = {
    string: lineText,
    pos: 0,
    start: 0,
    sol: () => position === 0,
    eol: () => position >= lineText.length,
    peek: () => lineText[position],
    next: () => {
      const value = lineText[position]

      position += 1
      stream.pos = position

      return value
    },
    skipToEnd: () => {
      position = lineText.length
      stream.pos = position
    },
    match: (pattern: string | RegExp) => {
      const remainder = lineText.slice(position)
      stream.start = position

      if (typeof pattern === 'string') {
        if (!remainder.startsWith(pattern)) {
          return false
        }

        position += pattern.length
        stream.pos = position

        return [pattern]
      }

      const regex = new RegExp(pattern.source, pattern.flags.replace('g', '').replace('y', ''))
      const match = regex.exec(remainder)

      if (!match || match.index !== 0) {
        return false
      }

      position += match[0].length
      stream.pos = position

      return match
    },
    current: (): string => lineText.slice(stream.start, position)
  }

  return stream
}

const allowsColumnTypeHighlight = (blockKind: string | null) => {
  return blockKind === 'Table' || blockKind === 'Composite'
}

const isVersionReferenceProperty = (propertyName: string | null) => {
  return propertyName === 'parent' || propertyName === 'based_on'
}

const getBlockKeyword = (lineText: string) => {
  const trimmedLine = lineText.trim()

  if (!trimmedLine.endsWith('{')) {
    return null
  }

  const keyword = trimmedLine.slice(0, -1).trim().split(/\s+/)[0]

  return keyword || null
}

const syncPgmlLineState = (lineText: string, state: PgmlStreamState) => {
  const trimmedLine = lineText.trimStart()
  let closingIndex = 0

  // Closing braces on the current line end blocks before any new tokens on the
  // same line are considered, which keeps `}` + sibling block headers aligned.
  while (trimmedLine[closingIndex] === '}') {
    state.blockStack.pop()
    closingIndex += 1
  }

  state.blockKind = state.blockStack[state.blockStack.length - 1] || null
  state.lineIdentifierIndex = 0
  state.lineAllowsColumnTypeHighlight = allowsColumnTypeHighlight(state.blockKind)
  state.lineIsBlockDeclaration = false
  state.lastNamedTokenType = null
  state.lastPropertyName = null

  const openingBlockKeyword = getBlockKeyword(lineText)

  if (openingBlockKeyword) {
    state.blockStack.push(openingBlockKeyword)
    state.blockKind = openingBlockKeyword
    state.lineAllowsColumnTypeHighlight = false
    state.lineIsBlockDeclaration = true
  }
}

const readPgmlToken = (stream: StringStream, state: PgmlStreamState) => {
  if (stream.sol()) {
    syncPgmlLineState(stream.string, state)

    const delimiter = findSourceDelimiter(stream.string.trim())

    if (delimiter !== null && delimiter.length > 0) {
      state.sourceDelimiter = delimiter
    }

    // Source blocks are treated as opaque string content until their matching
    // delimiter closes, so SQL bodies do not confuse the PGML tokenizer.
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

  if (stream.match(/#(?:[\da-f]{6}|[\da-f]{3})/i)) {
    return 'atom'
  }

  if (stream.match(/"(?:[^"\\]|\\.)*"/) || stream.match(/'(?:[^'\\]|\\.)*'/)) {
    return 'string'
  }

  if (stream.match(/\$(?:[A-Za-z0-9_]+)?\$/)) {
    return 'string'
  }

  if (stream.match(pgmlBlockKeywordPattern)) {
    state.lineAllowsColumnTypeHighlight = false
    state.lastNamedTokenType = 'keyword'
    state.lastPropertyName = null
    return 'keyword'
  }

  if (stream.match(pgmlNestedKeywordPattern)) {
    state.lineAllowsColumnTypeHighlight = false
    state.lastNamedTokenType = 'keyword'
    state.lastPropertyName = null
    return 'keyword'
  }

  if (stream.match(pgmlPropertyKeywordPattern)) {
    state.lastNamedTokenType = 'propertyName'
    state.lastPropertyName = stream.current()
    return 'propertyName'
  }

  if (stream.match(pgmlAtomPattern)) {
    return 'atom'
  }

  if (stream.match(/[<>-]/)) {
    state.lastNamedTokenType = null
    return 'operator'
  }

  if (stream.match(/[:[\]{}(),.]/)) {
    state.lastNamedTokenType = null
    return 'punctuation'
  }

  if (stream.match(/-?\d+(?:\.\d+)?/)) {
    state.lastNamedTokenType = 'number'
    return 'number'
  }

  if (stream.match(/[A-Za-z_][A-Za-z0-9_]*/)) {
    if (state.lineAllowsColumnTypeHighlight && state.lineIdentifierIndex === 0) {
      state.lineIdentifierIndex += 1
      state.lastNamedTokenType = 'variableName'
      state.lastPropertyName = null
      return 'variableName'
    }

    if (state.lineAllowsColumnTypeHighlight && state.lineIdentifierIndex === 1) {
      state.lineIdentifierIndex += 1
      state.lastNamedTokenType = 'className'
      state.lastPropertyName = null
      return 'className'
    }

    if (state.lineIsBlockDeclaration && (state.blockKind === 'Enum' || state.blockKind === 'Domain')) {
      state.lastNamedTokenType = 'typeName'
      state.lastPropertyName = null
      return 'typeName'
    }

    if (state.blockKind === 'Domain' && state.lastPropertyName === 'base') {
      state.lastNamedTokenType = 'className'
      state.lastPropertyName = null
      return 'className'
    }

    if (isVersionReferenceProperty(state.lastPropertyName)) {
      state.lastNamedTokenType = 'typeName'
      state.lastPropertyName = null
      return 'typeName'
    }

    state.lastNamedTokenType = 'variableName'
    state.lastPropertyName = null
    return 'variableName'
  }

  consumeTokenWhile(stream, /[^\s]/)

  return null
}

export const tokenizePgmlSource = (source: string) => {
  const state: PgmlStreamState = {
    blockKind: null,
    blockStack: [],
    lineIdentifierIndex: 0,
    lineAllowsColumnTypeHighlight: false,
    lineIsBlockDeclaration: false,
    lastNamedTokenType: null,
    lastPropertyName: null,
    sourceDelimiter: null
  }

  return source.split('\n').flatMap((lineText) => {
    const stream = createTestStringStream(lineText)
    const lineTokens: Array<{ value: string, type: string | null }> = []

    while (!stream.eol()) {
      const tokenStart = stream.pos
      const tokenType = readPgmlToken(stream as StringStream, state)
      const value = lineText.slice(tokenStart, stream.pos)

      if (value.length > 0) {
        lineTokens.push({
          value,
          type: tokenType
        })
      }
    }

    return lineTokens
  })
}

const pgmlStreamParser = StreamLanguage.define<PgmlStreamState>({
  startState: () => ({
    blockKind: null,
    blockStack: [],
    lineIdentifierIndex: 0,
    lineAllowsColumnTypeHighlight: false,
    lineIsBlockDeclaration: false,
    lastNamedTokenType: null,
    lastPropertyName: null,
    sourceDelimiter: null
  }),

  copyState: state => ({
    blockKind: state.blockKind,
    blockStack: [...state.blockStack],
    lineIdentifierIndex: state.lineIdentifierIndex,
    lineAllowsColumnTypeHighlight: state.lineAllowsColumnTypeHighlight,
    lineIsBlockDeclaration: state.lineIsBlockDeclaration,
    lastNamedTokenType: state.lastNamedTokenType,
    lastPropertyName: state.lastPropertyName,
    sourceDelimiter: state.sourceDelimiter
  }),

  token: (stream, state) => readPgmlToken(stream, state)
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
