import type { PgmlColumn, PgmlSourceRange } from '~/utils/pgml'

export type TableAttachmentKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence'

export type TableAttachmentFlag = {
  key: string
  label: string
  color: string
}

export type TableAttachment = {
  id: string
  kind: TableAttachmentKind
  title: string
  subtitle: string
  details: string[]
  tableId: string
  color: string
  flags: TableAttachmentFlag[]
  sourceRange?: PgmlSourceRange
}

export type TableRow = {
  kind: 'column'
  key: string
  tableId: string
  column: PgmlColumn
} | {
  kind: 'attachment'
  key: string
  tableId: string
  attachment: TableAttachment
}
