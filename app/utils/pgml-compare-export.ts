import type { PgmlCompareNoiseFilters } from './pgml'
import {
  getPgmlDiagramCompareEntityKindLabel,
  type PgmlDiagramCompareEntityKind,
  type PgmlDiagramCompareEntry
} from './pgml-diagram-compare'

export type PgmlCompareExportDetailViewMode = 'both' | 'snapshot' | 'structured'
export type PgmlCompareHtmlExportDetailViewMode = PgmlCompareExportDetailViewMode
export type PgmlCompareExportChangeFilterKind = 'added' | 'modified' | 'removed'

export type PgmlCompareExportInput = {
  baseLabel: string
  comparisonLabel: string
  contextEntries?: PgmlDiagramCompareEntry[]
  detailViewMode: PgmlCompareExportDetailViewMode
  entityKindFilters: PgmlDiagramCompareEntityKind[]
  entries: PgmlDiagramCompareEntry[]
  excludedLabels?: string[]
  excludedSummary?: string | null
  exportedAtLabel: string
  hiddenExcludedLabelCount?: number
  noiseFilters: PgmlCompareNoiseFilters
  relationshipSummary?: string
  searchQuery?: string
  targetLabel: string
  visibleChangeFilters: PgmlCompareExportChangeFilterKind[]
}

type PgmlCompareEntryGroup = {
  entries: PgmlDiagramCompareEntry[]
  id: string
  kind: PgmlDiagramCompareEntityKind
  label: string
}

const compareEntityKindOrder: PgmlDiagramCompareEntityKind[] = [
  'table',
  'group',
  'column',
  'index',
  'constraint',
  'reference',
  'custom-type',
  'function',
  'procedure',
  'trigger',
  'sequence',
  'layout'
]

const compareChangeKindLabelByValue: Readonly<Record<'added' | 'modified' | 'removed', string>> = Object.freeze({
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed'
})

const compareChangeKindColorByValue: Readonly<Record<'added' | 'modified' | 'removed', string>> = Object.freeze({
  added: '#166534',
  modified: '#b45309',
  removed: '#be123c'
})

const compareVisibleChangeFilterLabelByValue: Readonly<Record<PgmlCompareExportChangeFilterKind, string>> = Object.freeze({
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed'
})
const compareVisibleChangeFilterOrder: PgmlCompareExportChangeFilterKind[] = ['added', 'modified', 'removed']

const compareDetailViewLabelByValue: Readonly<Record<PgmlCompareExportDetailViewMode, string>> = Object.freeze({
  both: 'Structured and snapshot diffs',
  snapshot: 'Snapshot diff only',
  structured: 'Structured diff only'
})

const compareNoiseFilterLabelByKey: Readonly<Record<keyof PgmlCompareNoiseFilters, string>> = Object.freeze({
  hideDefaults: 'Hide defaults',
  hideExecutableNameOnly: 'Hide executable name only',
  hideStructuralNameOnly: 'Hide index/constraint name only',
  hideMetadata: 'Hide metadata',
  hideOrderOnly: 'Hide order only'
})

const escapeHtml = (value: unknown) => {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
}

const escapeMarkdown = (value: unknown) => {
  return String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll('`', '\\`')
    .replaceAll('*', '\\*')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]')
    .replaceAll('#', '\\#')
    .replaceAll('|', '\\|')
}

const renderHtmlTextValue = (value: string | null) => {
  if (value === null) {
    return '<span class="muted">—</span>'
  }

  return `<pre class="code-block">${escapeHtml(value)}</pre>`
}

const renderMarkdownTextValue = (value: string | null) => {
  if (value === null) {
    return 'null'
  }

  return `~~~text\n${value}\n~~~`
}

const markdownTrivialValueLiterals = new Set(['', '[]', '{}', 'null'])

const compactMarkdownValue = (value: string | null) => {
  if (value === null) {
    return 'null'
  }

  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return '""'
  }

  try {
    return JSON.stringify(JSON.parse(trimmedValue))
  } catch {
    return trimmedValue.includes('\n')
      ? trimmedValue
      : trimmedValue.replaceAll(/\s+/g, ' ')
  }
}

const isMarkdownInlineValue = (value: string) => {
  return !value.includes('\n') && value.length <= 180 && !value.includes('~~~')
}

const renderMarkdownCompactValue = (value: string | null) => {
  const compactValue = compactMarkdownValue(value)

  if (isMarkdownInlineValue(compactValue)) {
    return escapeMarkdown(compactValue)
  }

  return renderMarkdownTextValue(compactValue)
}

const isMarkdownTrivialValue = (value: string | null) => {
  return markdownTrivialValueLiterals.has(compactMarkdownValue(value))
}

const shouldIncludeMarkdownField = (
  entry: PgmlDiagramCompareEntry,
  field: PgmlDiagramCompareEntry['fields'][number]
) => {
  if (entry.changeKind === 'modified') {
    return true
  }

  const relevantValue = entry.changeKind === 'added' ? field.after : field.before

  if (isMarkdownTrivialValue(relevantValue)) {
    return false
  }

  return field.label !== 'name' && field.label !== 'schema'
}

const renderMarkdownFieldDiff = (
  entry: PgmlDiagramCompareEntry,
  field: PgmlDiagramCompareEntry['fields'][number]
) => {
  const beforeCompactValue = compactMarkdownValue(field.before)
  const afterCompactValue = compactMarkdownValue(field.after)
  const beforeValue = renderMarkdownCompactValue(field.before)
  const afterValue = renderMarkdownCompactValue(field.after)

  if (entry.changeKind === 'added') {
    return `  - ${escapeMarkdown(field.label)}: ${afterValue}`
  }

  if (entry.changeKind === 'removed') {
    return `  - ${escapeMarkdown(field.label)}: ${beforeValue}`
  }

  if (isMarkdownInlineValue(beforeCompactValue) && isMarkdownInlineValue(afterCompactValue)) {
    return `  - ${escapeMarkdown(field.label)}: ${beforeValue} -> ${afterValue}`
  }

  return [
    `  - ${escapeMarkdown(field.label)}:`,
    `    before: ${beforeValue}`,
    `    after: ${afterValue}`
  ].join('\n')
}

const buildEntityKindSectionId = (kind: PgmlDiagramCompareEntityKind) => {
  return `kind-${kind}`
}

const buildVisibleNoiseFilterLabels = (noiseFilters: PgmlCompareNoiseFilters) => {
  return Object.entries(noiseFilters).flatMap(([key, isEnabled]) => {
    if (!isEnabled) {
      return []
    }

    return [compareNoiseFilterLabelByKey[key as keyof PgmlCompareNoiseFilters]]
  })
}

const buildVisibleChangeFilterLabel = (visibleChangeFilters: PgmlCompareExportChangeFilterKind[]) => {
  const orderedFilters = compareVisibleChangeFilterOrder.filter(filter => visibleChangeFilters.includes(filter))

  if (orderedFilters.length === 0) {
    return 'All visible changes'
  }

  if (orderedFilters.length === 1) {
    const selectedFilter = orderedFilters[0]

    return selectedFilter ? `${compareVisibleChangeFilterLabelByValue[selectedFilter]} only` : 'All visible changes'
  }

  return orderedFilters.map(filter => compareVisibleChangeFilterLabelByValue[filter]).join(' + ')
}

const buildEntityKindSections = (entries: PgmlDiagramCompareEntry[]) => {
  return compareEntityKindOrder.flatMap((entityKind) => {
    const kindEntries = entries
      .filter(entry => entry.entityKind === entityKind)
      .sort((left, right) => left.label.localeCompare(right.label))

    if (kindEntries.length === 0) {
      return []
    }

    return [{
      entries: kindEntries,
      id: buildEntityKindSectionId(entityKind),
      kind: entityKind,
      label: getPgmlDiagramCompareEntityKindLabel(entityKind)
    }] satisfies PgmlCompareEntryGroup[]
  })
}

const buildVisibleEntityKindFilters = (entityKindFilters: PgmlDiagramCompareEntityKind[]) => {
  return entityKindFilters.map((entityKind) => {
    return getPgmlDiagramCompareEntityKindLabel(entityKind)
  })
}

const buildSelectedContextLabels = (contextEntries: PgmlDiagramCompareEntry[] | undefined) => {
  return Array.from(new Set((contextEntries || []).map(entry => entry.label))).sort((left, right) => {
    return left.localeCompare(right)
  })
}

const renderHtmlMetaRow = (label: string, value: string) => {
  return `<div class="meta-row">
    <dt>${escapeHtml(label)}</dt>
    <dd>${value}</dd>
  </div>`
}

const renderHtmlEntry = (
  entry: PgmlDiagramCompareEntry,
  detailViewMode: PgmlCompareExportDetailViewMode
) => {
  const showFieldDiffs = detailViewMode !== 'snapshot'
  const showSnapshotDiff = detailViewMode !== 'structured'
  const changeLabel = compareChangeKindLabelByValue[entry.changeKind]
  const changeColor = compareChangeKindColorByValue[entry.changeKind]
  const scopeLabel = entry.scopeKind === 'table'
    ? `Table scope: ${entry.scopeLabel}`
    : entry.scopeLabel
  const changedFieldsLabel = entry.changedFields.length > 0
    ? escapeHtml(entry.changedFields.join(', '))
    : '<span class="muted">None</span>'

  return `<article class="entry">
    <header class="entry-header">
      <div class="entry-title-row">
        <span class="change-label" style="color:${changeColor};">${escapeHtml(changeLabel)}</span>
        <h3>${escapeHtml(entry.label)}</h3>
      </div>
      <p class="entry-description">${escapeHtml(entry.description)}</p>
    </header>

    <dl class="meta-list">
      ${renderHtmlMetaRow('Scope', escapeHtml(scopeLabel))}
      ${renderHtmlMetaRow('Changed fields', changedFieldsLabel)}
      ${renderHtmlMetaRow('Changed field count', escapeHtml(String(entry.changedFields.length)))}
    </dl>

    ${showFieldDiffs && entry.fields.length > 0
      ? `<section class="entry-section">
      <h4>Structured diff</h4>
      <table class="field-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          ${entry.fields.map((field) => {
            return `<tr>
              <td>${escapeHtml(field.label)}</td>
              <td>${renderHtmlTextValue(field.before)}</td>
              <td>${renderHtmlTextValue(field.after)}</td>
            </tr>`
          }).join('')}
        </tbody>
      </table>
    </section>`
      : ''}

    ${showSnapshotDiff
      ? `<section class="entry-section">
      <h4>Snapshot diff</h4>
      <div class="snapshot-columns">
        <section>
          <h5>Before</h5>
          ${renderHtmlTextValue(entry.beforeSnapshot)}
        </section>
        <section>
          <h5>After</h5>
          ${renderHtmlTextValue(entry.afterSnapshot)}
        </section>
      </div>
    </section>`
      : ''}
  </article>`
}

const renderMarkdownEntry = (
  entry: PgmlDiagramCompareEntry,
  detailViewMode: PgmlCompareExportDetailViewMode
) => {
  const showFieldDiffs = detailViewMode !== 'snapshot'
  const showSnapshotDiff = detailViewMode !== 'structured'
  const visibleFields = entry.fields.filter(field => shouldIncludeMarkdownField(entry, field))
  const lines = [`- ${escapeMarkdown(compareChangeKindLabelByValue[entry.changeKind])} ${escapeMarkdown(entry.label)}`]

  if (entry.changeKind === 'modified' && entry.changedFields.length > 0) {
    lines.push(`  - fields: ${escapeMarkdown(entry.changedFields.join(', '))}`)
  }

  if (showFieldDiffs && visibleFields.length > 0) {
    visibleFields.forEach((field) => {
      lines.push(renderMarkdownFieldDiff(entry, field))
    })
  }

  if (showFieldDiffs && visibleFields.length === 0 && entry.changeKind !== 'modified') {
    lines.push('  - details: omitted trivial empty fields')
  }

  if (showSnapshotDiff && (entry.beforeSnapshot !== null || entry.afterSnapshot !== null)) {
    lines.push('  - snapshot:')

    if (entry.beforeSnapshot !== null) {
      lines.push(
        '    - before:',
        renderMarkdownTextValue(compactMarkdownValue(entry.beforeSnapshot))
      )
    }

    if (entry.afterSnapshot !== null) {
      lines.push(
        '    - after:',
        renderMarkdownTextValue(compactMarkdownValue(entry.afterSnapshot))
      )
    }
  }

  return lines.join('\n')
}

const buildHtmlSummary = (input: PgmlCompareExportInput) => {
  const groupedSections = buildEntityKindSections(input.entries)
  const visibleNoiseFilters = buildVisibleNoiseFilterLabels(input.noiseFilters)
  const visibleEntityKindFilters = buildVisibleEntityKindFilters(input.entityKindFilters)
  const selectedContextLabels = buildSelectedContextLabels(input.contextEntries)

  return {
    groupedSections,
    selectedContextLabels,
    visibleEntityKindFilters,
    visibleNoiseFilters
  }
}

export const buildPgmlCompareHtmlExport = (input: PgmlCompareExportInput) => {
  const {
    groupedSections,
    selectedContextLabels,
    visibleEntityKindFilters,
    visibleNoiseFilters
  } = buildHtmlSummary(input)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(`${input.comparisonLabel} · ${input.baseLabel} to ${input.targetLabel}`)}</title>
    <style>
      :root {
        color-scheme: light;
        --page-bg: #fcfbf7;
        --line: #d8d1c6;
        --line-strong: #b6ae9f;
        --text: #1a1a1a;
        --muted: #666052;
        --heading: #111111;
        --surface: #f7f4ee;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--page-bg);
      }

      body {
        margin: 0;
        background: var(--page-bg);
        color: var(--text);
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        line-height: 1.55;
      }

      .page {
        width: min(1080px, calc(100% - 36px));
        margin: 0 auto;
        padding: 28px 0 48px;
      }

      h1,
      h2,
      h3,
      h4,
      h5,
      p,
      dl,
      dd {
        margin: 0;
      }

      .document-header {
        display: grid;
        gap: 10px;
        padding-bottom: 18px;
        border-bottom: 2px solid var(--line-strong);
      }

      .document-kicker,
      .section-kicker,
      .change-label,
      .toc-label {
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .document-kicker,
      .section-kicker,
      .toc-label {
        color: var(--muted);
      }

      h1 {
        color: var(--heading);
        font-family: Charter, "Iowan Old Style", "Palatino Linotype", serif;
        font-size: clamp(28px, 4vw, 38px);
        line-height: 1.05;
      }

      .document-subtitle,
      .document-summary {
        max-width: 76ch;
      }

      .summary-grid,
      .kind-section,
      .empty-state,
      .toc {
        border-top: 1px solid var(--line);
        padding-top: 16px;
        margin-top: 18px;
      }

      .summary-grid {
        display: grid;
        gap: 18px;
      }

      .summary-block {
        display: grid;
        gap: 10px;
      }

      .summary-block h2,
      .kind-header h2 {
        color: var(--heading);
        font-size: 18px;
      }

      .meta-list {
        display: grid;
        gap: 8px;
      }

      .meta-row {
        display: grid;
        gap: 4px;
      }

      .meta-row dt {
        color: var(--muted);
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta-row dd {
        min-width: 0;
      }

      .muted {
        color: var(--muted);
      }

      .toc {
        display: grid;
        gap: 10px;
      }

      .toc-list {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 14px;
        padding: 0;
        margin: 0;
        list-style: none;
      }

      .toc-list a {
        color: inherit;
        text-decoration: none;
        border-bottom: 1px solid var(--line-strong);
      }

      .kind-header {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 12px;
      }

      .kind-count {
        color: var(--muted);
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        font-size: 12px;
      }

      .entry {
        display: grid;
        gap: 14px;
        padding-top: 16px;
        margin-top: 16px;
        border-top: 1px solid var(--line);
      }

      .entry-title-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 10px;
      }

      .entry-title-row h3 {
        color: var(--heading);
        font-size: 18px;
      }

      .entry-description {
        margin-top: 8px;
      }

      .entry-section {
        display: grid;
        gap: 10px;
      }

      .entry-section h4,
      .snapshot-columns h5 {
        color: var(--heading);
        font-size: 12px;
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .field-table {
        width: 100%;
        border-collapse: collapse;
      }

      .field-table th,
      .field-table td {
        padding: 8px 10px;
        border: 1px solid var(--line);
        vertical-align: top;
        text-align: left;
      }

      .field-table th {
        background: var(--surface);
        color: var(--heading);
        font-size: 12px;
      }

      .snapshot-columns {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      }

      .snapshot-columns section {
        display: grid;
        gap: 8px;
      }

      .code-block {
        padding: 8px 10px;
        border: 1px solid var(--line);
        background: var(--surface);
        white-space: pre-wrap;
        word-break: break-word;
        font-family: "SFMono-Regular", "Cascadia Code", "Liberation Mono", monospace;
        font-size: 12px;
        line-height: 1.55;
      }

      @media (min-width: 900px) {
        .summary-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 24px;
        }
      }

      @media (max-width: 720px) {
        .page {
          width: min(100%, calc(100% - 20px));
          padding-top: 20px;
          padding-bottom: 28px;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <header class="document-header">
        <div class="document-kicker">PGML Compare Export</div>
        <h1>${escapeHtml(input.comparisonLabel)}</h1>
        <p class="document-subtitle">${escapeHtml(`${input.baseLabel} to ${input.targetLabel}`)}</p>
        ${input.relationshipSummary && input.relationshipSummary.trim().length > 0 ? `<p class="document-summary">${escapeHtml(input.relationshipSummary)}</p>` : ''}
      </header>

      <section class="summary-grid">
        <section class="summary-block">
          <div class="section-kicker">Scope</div>
          <h2>Current compare state</h2>
          <dl class="meta-list">
            ${renderHtmlMetaRow('Exported', escapeHtml(input.exportedAtLabel))}
            ${renderHtmlMetaRow('Visible change filter', escapeHtml(buildVisibleChangeFilterLabel(input.visibleChangeFilters)))}
            ${renderHtmlMetaRow('Detail view', escapeHtml(compareDetailViewLabelByValue[input.detailViewMode]))}
            ${renderHtmlMetaRow('Visible entries', escapeHtml(`${input.entries.length}`))}
          </dl>
        </section>

        <section class="summary-block">
          <div class="section-kicker">Filters</div>
          <h2>Active filters</h2>
          <dl class="meta-list">
            ${renderHtmlMetaRow('Search', input.searchQuery && input.searchQuery.trim().length > 0 ? escapeHtml(input.searchQuery.trim()) : '<span class="muted">None</span>')}
            ${renderHtmlMetaRow('Entity kinds', visibleEntityKindFilters.length > 0 ? escapeHtml(visibleEntityKindFilters.join(', ')) : '<span class="muted">All entity kinds</span>')}
            ${renderHtmlMetaRow('Noise filters', visibleNoiseFilters.length > 0 ? escapeHtml(visibleNoiseFilters.join(', ')) : '<span class="muted">None hidden</span>')}
          </dl>
        </section>

        <section class="summary-block">
          <div class="section-kicker">Selection</div>
          <h2>Visible scope</h2>
          <dl class="meta-list">
            ${renderHtmlMetaRow('Exclusions', input.excludedSummary ? escapeHtml(input.excludedSummary) : '<span class="muted">No compare exclusions</span>')}
            ${renderHtmlMetaRow('Selected on diagram', selectedContextLabels.length > 0 ? escapeHtml(selectedContextLabels.join(', ')) : '<span class="muted">None</span>')}
          </dl>
        </section>
      </section>

      ${groupedSections.length > 0
        ? `<nav class="toc" aria-label="Entity kinds">
        <div class="toc-label">Entity kinds</div>
        <ul class="toc-list">
          ${groupedSections.map((section) => {
            return `<li><a href="#${escapeHtml(section.id)}">${escapeHtml(`${section.label} (${section.entries.length})`)}</a></li>`
          }).join('')}
        </ul>
      </nav>`
        : ''}

      ${groupedSections.length === 0
        ? `<section class="empty-state">
        <div class="section-kicker">Visible results</div>
        <h2>No visible compare entries</h2>
        <p class="muted">The current compare state does not surface any entries after exclusions and active filters are applied.</p>
      </section>`
        : groupedSections.map((section) => {
            return `<section id="${escapeHtml(section.id)}" class="kind-section">
          <header class="kind-header">
            <h2>${escapeHtml(section.label)}</h2>
            <div class="kind-count">${escapeHtml(`${section.entries.length} visible`)}</div>
          </header>
          ${section.entries.map(entry => renderHtmlEntry(entry, input.detailViewMode)).join('')}
        </section>`
          }).join('')}
    </main>
  </body>
</html>`
}

export const buildPgmlCompareMarkdownExport = (input: PgmlCompareExportInput) => {
  const groupedSections = buildEntityKindSections(input.entries)
  const visibleNoiseFilters = buildVisibleNoiseFilterLabels(input.noiseFilters)
  const visibleEntityKindFilters = buildVisibleEntityKindFilters(input.entityKindFilters)
  const selectedContextLabels = buildSelectedContextLabels(input.contextEntries)
  const lines = [
    '# PGML Compare',
    '',
    'Filtered PGML schema comparison export. Includes only currently visible compare entries after active filters, exclusions, and noise settings.',
    '',
    '## Context',
    '',
    `- comparison: ${escapeMarkdown(input.comparisonLabel)}`,
    `- base: ${escapeMarkdown(input.baseLabel)}`,
    `- target: ${escapeMarkdown(input.targetLabel)}`,
    `- change filter: ${escapeMarkdown(buildVisibleChangeFilterLabel(input.visibleChangeFilters))}`,
    `- detail view: ${escapeMarkdown(compareDetailViewLabelByValue[input.detailViewMode])}`,
    `- visible entries: ${input.entries.length}`,
    `- entity kinds: ${visibleEntityKindFilters.length > 0 ? escapeMarkdown(visibleEntityKindFilters.join(', ')) : 'All entity kinds'}`,
    `- search: ${input.searchQuery && input.searchQuery.trim().length > 0 ? escapeMarkdown(input.searchQuery.trim()) : 'None'}`,
    `- noise filters: ${visibleNoiseFilters.length > 0 ? escapeMarkdown(visibleNoiseFilters.join(', ')) : 'None hidden'}`,
    `- exclusions: ${input.excludedSummary ? escapeMarkdown(input.excludedSummary) : 'No compare exclusions'}`,
    `- selected on diagram: ${selectedContextLabels.length > 0 ? escapeMarkdown(selectedContextLabels.join(', ')) : 'None'}`,
    `- exported: ${escapeMarkdown(input.exportedAtLabel)}`
  ]

  if (input.relationshipSummary && input.relationshipSummary.trim().length > 0) {
    lines.push(`- relationship: ${escapeMarkdown(input.relationshipSummary.trim())}`)
  }

  if (groupedSections.length === 0) {
    lines.push(
      '',
      '## Changes',
      '',
      'No visible compare entries.',
      '',
      'The current compare state does not surface any entries after exclusions and active filters are applied.'
    )

    return `${lines.join('\n')}\n`
  }

  lines.push('', '## Changes')

  groupedSections.forEach((section) => {
    lines.push(
      '',
      `### ${escapeMarkdown(section.label)} (${section.entries.length})`
    )

    section.entries.forEach((entry, index) => {
      lines.push(renderMarkdownEntry(entry, input.detailViewMode))

      if (index < section.entries.length - 1) {
        lines.push('')
      }
    })
  })

  return `${lines.join('\n')}\n`
}
