import { getOrderedGroupTables, parsePgml } from './pgml'

type RetainedPgmlTableGroup = {
  name: string
  note: string | null
  tableNames: string[]
}

const normalizeImportSource = (value: string) => {
  return value.replaceAll('\r\n', '\n').trim()
}

const serializeRetainedGroupBlock = (group: RetainedPgmlTableGroup) => {
  const lines = [
    `TableGroup ${group.name} {`,
    ...group.tableNames.map(tableName => `  ${tableName}`)
  ]

  if (group.note && group.note.trim().length > 0) {
    lines.push(`  Note: ${group.note.trim()}`)
  }

  lines.push('}')

  return lines.join('\n')
}

const buildRetainedGroups = (input: {
  baseSource: string
  importedSource: string
}) => {
  const baseModel = parsePgml(input.baseSource)

  if (baseModel.groups.length === 0) {
    return []
  }

  const importedModel = parsePgml(input.importedSource)
  const importedTableIds = new Set(importedModel.tables.map(table => table.fullName))

  return baseModel.groups.reduce<RetainedPgmlTableGroup[]>((groups, group) => {
    const tableNames = getOrderedGroupTables(baseModel, group.name)
      .map(table => table.fullName)
      .filter(tableName => importedTableIds.has(tableName))

    if (tableNames.length === 0) {
      return groups
    }

    groups.push({
      name: group.name,
      note: group.note,
      tableNames
    })

    return groups
  }, [])
}

export const retainPgmlTableGroupsFromBaseSource = (input: {
  baseSource: string
  importedSource: string
}) => {
  const normalizedImportedSource = normalizeImportSource(input.importedSource)

  if (normalizedImportedSource.length === 0) {
    return input.importedSource
  }

  const retainedGroups = buildRetainedGroups({
    baseSource: input.baseSource,
    importedSource: normalizedImportedSource
  })

  if (retainedGroups.length === 0) {
    return input.importedSource
  }

  const retainedGroupNameByTableId = retainedGroups.reduce<Map<string, string>>((entries, group) => {
    group.tableNames.forEach((tableName) => {
      entries.set(tableName, group.name)
    })

    return entries
  }, new Map<string, string>())
  const importedModel = parsePgml(normalizedImportedSource)
  const sourceLines = normalizedImportedSource.split('\n')

  importedModel.tables.forEach((table) => {
    const retainedGroupName = retainedGroupNameByTableId.get(table.fullName)

    if (!retainedGroupName || !table.sourceRange) {
      return
    }

    const lineIndex = table.sourceRange.startLine - 1

    if (lineIndex < 0 || lineIndex >= sourceLines.length) {
      return
    }

    const currentLine = sourceLines[lineIndex] || ''
    const leadingWhitespace = currentLine.match(/^\s*/u)?.[0] || ''

    sourceLines[lineIndex] = `${leadingWhitespace}Table ${table.fullName} in ${retainedGroupName} {`
  })

  return [
    sourceLines.join('\n').trim(),
    retainedGroups.map(serializeRetainedGroupBlock).join('\n\n')
  ].filter(section => section.length > 0).join('\n\n').trim()
}
