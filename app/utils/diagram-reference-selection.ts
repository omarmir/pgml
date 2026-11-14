import type { DiagramGpuSelection } from './diagram-gpu-scene'
import type { PgmlReference } from './pgml'

export const isDiagramReferenceSelected = (
  reference: PgmlReference,
  selection: DiagramGpuSelection | null
) => {
  if (!selection) {
    return false
  }

  if (selection.kind === 'table' || selection.kind === 'attachment') {
    return reference.fromTable === selection.tableId
  }

  if (selection.kind !== 'column') {
    return false
  }

  const fromColumns = reference.fromColumns ? reference.fromColumns : [reference.fromColumn]
  const toColumns = reference.toColumns ? reference.toColumns : [reference.toColumn]

  return (reference.fromTable === selection.tableId && fromColumns.includes(selection.columnName))
    || (reference.toTable === selection.tableId && toColumns.includes(selection.columnName))
}
