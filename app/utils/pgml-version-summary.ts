import type { PgmlSchemaDiff } from './pgml-diff'

export type PgmlVersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

export const buildPgmlVersionDiffSections = (diff: PgmlSchemaDiff) => {
  const sectionEntries = [
    {
      items: diff.tables,
      label: 'Tables'
    },
    {
      items: diff.columns,
      label: 'Columns'
    },
    {
      items: diff.references,
      label: 'References'
    },
    {
      items: diff.indexes,
      label: 'Indexes'
    },
    {
      items: diff.constraints,
      label: 'Constraints'
    },
    {
      items: diff.groups,
      label: 'Groups'
    },
    {
      items: [
        ...diff.functions,
        ...diff.procedures,
        ...diff.triggers,
        ...diff.sequences
      ],
      label: 'Routines'
    },
    {
      items: diff.customTypes,
      label: 'Types'
    }
  ]

  return sectionEntries.reduce<PgmlVersionDiffSection[]>((sections, entry) => {
    if (entry.items.length === 0) {
      return sections
    }

    sections.push({
      count: entry.items.length,
      items: entry.items.map((item) => {
        return {
          id: item.id,
          kind: item.kind,
          label: item.label
        }
      }),
      label: entry.label
    })

    return sections
  }, [])
}
