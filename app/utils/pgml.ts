export type PgmlColumn = {
  name: string
  type: string
  modifiers: string[]
  note: string | null
  reference: PgmlReference | null
}

export type PgmlTable = {
  name: string
  schema: string
  fullName: string
  groupName: string | null
  note: string | null
  columns: PgmlColumn[]
  indexes: PgmlIndex[]
  constraints: PgmlConstraint[]
}

export type PgmlIndex = {
  name: string
  tableName: string
  columns: string[]
  type: string
}

export type PgmlConstraint = {
  name: string
  tableName: string
  expression: string
}

export type PgmlReference = {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  relation: '>' | '<' | '-'
}

export type PgmlGroup = {
  name: string
  tableNames: string[]
  note: string | null
}

export type PgmlRoutine = {
  name: string
  signature: string
  details: string[]
}

export type PgmlTrigger = {
  name: string
  tableName: string
  details: string[]
}

export type PgmlSequence = {
  name: string
  details: string[]
}

export type PgmlCustomType = {
  kind: 'Enum' | 'Domain' | 'Composite'
  name: string
  details: string[]
}

export type PgmlSchemaModel = {
  tables: PgmlTable[]
  groups: PgmlGroup[]
  references: PgmlReference[]
  functions: PgmlRoutine[]
  procedures: PgmlRoutine[]
  triggers: PgmlTrigger[]
  sequences: PgmlSequence[]
  customTypes: PgmlCustomType[]
  schemas: string[]
}

type NamedBlock = {
  header: string
  body: string[]
}

const cleanName = (value: string) => value.replaceAll('"', '').trim()
const readMatch = (value: string | undefined) => value || ''

const parseBracketParts = (value: string) => {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

const parseTableName = (value: string) => {
  const sanitized = cleanName(value)
  const parts = sanitized.split('.')

  if (parts.length >= 2) {
    return {
      schema: readMatch(parts[0]),
      table: readMatch(parts[1])
    }
  }

  return {
    schema: 'public',
    table: sanitized
  }
}

const parseReferenceTarget = (value: string) => {
  const sanitized = cleanName(value)
  const parts = sanitized.split('.')

  if (parts.length === 3) {
    return {
      schema: readMatch(parts[0]),
      table: readMatch(parts[1]),
      column: readMatch(parts[2])
    }
  }

  if (parts.length === 2) {
    return {
      schema: 'public',
      table: readMatch(parts[0]),
      column: readMatch(parts[1])
    }
  }

  return {
    schema: 'public',
    table: sanitized,
    column: ''
  }
}

const collectBlocks = (source: string) => {
  const lines = source
    .replaceAll('\r\n', '\n')
    .split('\n')

  const topLevel: string[] = []
  const blocks: NamedBlock[] = []

  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] || ''
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('//')) {
      index += 1
      continue
    }

    if (line.endsWith('{')) {
      const header = line.slice(0, -1).trim()
      const body: string[] = []
      let depth = 1
      index += 1

      while (index < lines.length && depth > 0) {
        const nextLine = lines[index] || ''
        const nextTrimmed = nextLine.trim()

        if (nextTrimmed.endsWith('{')) {
          depth += 1
        }

        if (nextTrimmed === '}') {
          depth -= 1

          if (depth === 0) {
            index += 1
            break
          }
        }

        if (depth > 0) {
          body.push(nextLine)
        }

        index += 1
      }

      blocks.push({
        header,
        body
      })
      continue
    }

    topLevel.push(line)
    index += 1
  }

  return {
    topLevel,
    blocks
  }
}

const parseTable = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Table\s+([^\s]+)(?:\s+in\s+(.+))?$/)

  if (!headerMatch) {
    return null
  }

  const tableName = readMatch(headerMatch[1])
  const groupLabel = readMatch(headerMatch[2])
  const nameTarget = parseTableName(tableName)
  const groupName = groupLabel ? cleanName(groupLabel) : null
  const columns: PgmlColumn[] = []
  const indexes: PgmlIndex[] = []
  const constraints: PgmlConstraint[] = []
  let note: string | null = null

  for (const line of block.body) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    if (trimmed.startsWith('Note:')) {
      note = trimmed.replace('Note:', '').trim()
      continue
    }

    const indexMatch = trimmed.match(/^Index\s+([^\s(]+)\s*\(([^)]*)\)(?:\s*\[([^\]]+)\])?$/)

    if (indexMatch) {
      const indexName = readMatch(indexMatch[1])
      const indexColumns = readMatch(indexMatch[2])
      const indexOptions = readMatch(indexMatch[3])
      const parts = indexOptions ? parseBracketParts(indexOptions) : []
      const typePart = parts.find(part => part.startsWith('type:'))

      indexes.push({
        name: cleanName(indexName),
        tableName: `${nameTarget.schema}.${nameTarget.table}`,
        columns: indexColumns.split(',').map(value => cleanName(value)),
        type: typePart ? typePart.replace('type:', '').trim() : 'btree'
      })
      continue
    }

    const constraintMatch = trimmed.match(/^Constraint\s+([^:]+):\s*(.+)$/)

    if (constraintMatch) {
      const constraintName = readMatch(constraintMatch[1])
      const constraintExpression = readMatch(constraintMatch[2])

      constraints.push({
        name: cleanName(constraintName),
        tableName: `${nameTarget.schema}.${nameTarget.table}`,
        expression: constraintExpression.trim()
      })
      continue
    }

    const columnMatch = trimmed.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/)

    if (!columnMatch) {
      continue
    }

    const columnName = readMatch(columnMatch[1])
    const columnType = readMatch(columnMatch[2])
    const columnOptions = readMatch(columnMatch[3])
    const modifiers = columnOptions ? parseBracketParts(columnOptions) : []
    const refPart = modifiers.find(part => part.startsWith('ref:'))
    const notePart = modifiers.find(part => part.startsWith('note:'))
    let reference: PgmlReference | null = null

    if (refPart) {
      const refMatch = refPart.match(/ref:\s*([<>-])\s*(.+)$/)

      if (refMatch) {
        const relation = readMatch(refMatch[1]) as '>' | '<' | '-'
        const refTarget = readMatch(refMatch[2])
        const target = parseReferenceTarget(refTarget)

        reference = {
          fromTable: `${nameTarget.schema}.${nameTarget.table}`,
          fromColumn: cleanName(columnName),
          toTable: `${target.schema}.${target.table}`,
          toColumn: target.column,
          relation
        }
      }
    }

    columns.push({
      name: cleanName(columnName),
      type: columnType.trim(),
      modifiers,
      note: notePart ? notePart.replace('note:', '').trim() : null,
      reference
    })
  }

  return {
    name: nameTarget.table,
    schema: nameTarget.schema,
    fullName: `${nameTarget.schema}.${nameTarget.table}`,
    groupName,
    note,
    columns,
    indexes,
    constraints
  } satisfies PgmlTable
}

const parseGroup = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^TableGroup\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  const groupName = cleanName(readMatch(headerMatch[1]))
  const tableNames: string[] = []
  let note: string | null = null

  for (const line of block.body) {
    const trimmed = line.trim()

    if (trimmed.startsWith('tables:')) {
      const listMatch = trimmed.match(/\[(.+)\]/)
      const list = listMatch ? readMatch(listMatch[1]).split(',') : []

      for (const entry of list) {
        tableNames.push(cleanName(entry))
      }
    }

    if (trimmed.startsWith('Note:')) {
      note = trimmed.replace('Note:', '').trim()
    }
  }

  return {
    name: groupName,
    tableNames,
    note
  } satisfies PgmlGroup
}

const parseRoutine = (block: NamedBlock, keyword: 'Function' | 'Procedure') => {
  const headerMatch = block.header.match(new RegExp(`^${keyword}\\s+(.+)$`))

  if (!headerMatch) {
    return null
  }

  const signature = readMatch(headerMatch[1]).trim()
  const routineName = readMatch(signature.split('(')[0])

  return {
    name: cleanName(routineName),
    signature,
    details: block.body
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } satisfies PgmlRoutine
}

const parseTrigger = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Trigger\s+([^\s]+)\s+on\s+([^\s]+)$/)

  if (!headerMatch) {
    return null
  }

  return {
    name: cleanName(readMatch(headerMatch[1])),
    tableName: cleanName(readMatch(headerMatch[2])),
    details: block.body
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } satisfies PgmlTrigger
}

const parseSequence = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Sequence\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  return {
    name: cleanName(readMatch(headerMatch[1])),
    details: block.body
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } satisfies PgmlSequence
}

const parseCustomType = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^(Enum|Domain|Composite)\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  return {
    kind: readMatch(headerMatch[1]) as 'Enum' | 'Domain' | 'Composite',
    name: cleanName(readMatch(headerMatch[2])),
    details: block.body
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } satisfies PgmlCustomType
}

const parseTopLevelReference = (line: string) => {
  const match = line.match(/^Ref:\s+([^\s]+)\s*([<>-])\s*([^\s]+)$/)

  if (!match) {
    return null
  }

  const fromTarget = parseReferenceTarget(readMatch(match[1]))
  const relation = readMatch(match[2]) as '>' | '<' | '-'
  const toTarget = parseReferenceTarget(readMatch(match[3]))

  return {
    fromTable: `${fromTarget.schema}.${fromTarget.table}`,
    fromColumn: readMatch(fromTarget.column),
    toTable: `${toTarget.schema}.${toTarget.table}`,
    toColumn: readMatch(toTarget.column),
    relation
  } satisfies PgmlReference
}

export const parsePgml = (source: string) => {
  const { topLevel, blocks } = collectBlocks(source)
  const tables: PgmlTable[] = []
  const groups: PgmlGroup[] = []
  const functions: PgmlRoutine[] = []
  const procedures: PgmlRoutine[] = []
  const triggers: PgmlTrigger[] = []
  const sequences: PgmlSequence[] = []
  const customTypes: PgmlCustomType[] = []
  const references: PgmlReference[] = []

  for (const line of topLevel) {
    const reference = parseTopLevelReference(line)

    if (reference) {
      references.push(reference)
    }
  }

  for (const block of blocks) {
    const table = parseTable(block)

    if (table) {
      tables.push(table)
      continue
    }

    const group = parseGroup(block)

    if (group) {
      groups.push(group)
      continue
    }

    const pgFunction = parseRoutine(block, 'Function')

    if (pgFunction) {
      functions.push(pgFunction)
      continue
    }

    const procedure = parseRoutine(block, 'Procedure')

    if (procedure) {
      procedures.push(procedure)
      continue
    }

    const trigger = parseTrigger(block)

    if (trigger) {
      triggers.push(trigger)
      continue
    }

    const sequence = parseSequence(block)

    if (sequence) {
      sequences.push(sequence)
      continue
    }

    const customType = parseCustomType(block)

    if (customType) {
      customTypes.push(customType)
    }
  }

  for (const table of tables) {
    for (const column of table.columns) {
      if (column.reference) {
        references.push(column.reference)
      }
    }
  }

  const groupByTableName = new Map<string, string>()

  for (const group of groups) {
    for (const name of group.tableNames) {
      groupByTableName.set(name, group.name)
      groupByTableName.set(`public.${name}`, group.name)
    }
  }

  const normalizedTables = tables.map((table) => {
    const tableGroupName = table.groupName
      || groupByTableName.get(table.name)
      || groupByTableName.get(table.fullName)
      || null

    return {
      ...table,
      groupName: tableGroupName
    }
  })

  const schemaSet = new Set<string>()

  for (const table of normalizedTables) {
    schemaSet.add(table.schema)
  }

  return {
    tables: normalizedTables,
    groups,
    references,
    functions,
    procedures,
    triggers,
    sequences,
    customTypes,
    schemas: Array.from(schemaSet)
  } satisfies PgmlSchemaModel
}

export const pgmlExample = `TableGroup Core {
  tables: [tenants, users, roles]
  Note: Shared identity and account ownership
}

TableGroup Commerce {
  tables: [products, orders, order_items]
  Note: Buying flow and inventory edges
}

Enum role_kind {
  owner
  analyst
  operator
}

Domain email_address {
  base: text
  check: VALUE ~* '^[^@]+@[^@]+\\\\.[^@]+$'
}

Sequence order_number_seq {
  start: 1200
  increment: 1
}

Table public.tenants in Core {
  id uuid [pk]
  name text [not null]
  slug text [unique, not null]
  created_at timestamptz [default: now()]
  Index idx_tenants_slug (slug) [type: btree]
}

Table public.roles in Core {
  id uuid [pk]
  key role_kind [unique, not null]
  label text [not null]
}

Table public.users in Core {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  role_id uuid [not null, ref: > public.roles.id]
  email email_address [unique, not null]
  display_name text [not null]
  created_at timestamptz [default: now()]
  Constraint chk_users_email: email <> ''
}

Table public.products in Commerce {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  sku text [unique, not null]
  title text [not null]
  search tsvector [note: generated for full text search]
  price_cents integer [not null]
  Index idx_products_search (search) [type: gin]
}

Table public.orders in Commerce {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  order_number bigint [not null, unique, default: nextval('order_number_seq')]
  customer_id uuid [ref: > public.users.id]
  status text [not null]
  submitted_at timestamptz
  total_cents integer [not null]
  Constraint chk_orders_total: total_cents >= 0
}

Table public.order_items in Commerce {
  id uuid [pk]
  order_id uuid [not null, ref: > public.orders.id]
  product_id uuid [not null, ref: > public.products.id]
  quantity integer [not null]
  unit_price_cents integer [not null]
}

Function recalc_order_total(order_uuid uuid) returns void {
  language: plpgsql
  volatility: volatile
}

Procedure archive_orders(retention_days integer) {
  language: plpgsql
}

Trigger trg_orders_audit on public.orders {
  timing: after
  events: [insert, update]
  execute: audit_order_changes()
}

Ref: public.orders.customer_id > public.users.id
`
