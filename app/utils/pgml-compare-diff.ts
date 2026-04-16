export type PgmlCompareDiffLineKind = 'added' | 'context' | 'removed'

export type PgmlCompareDiffLine = {
  content: string
  key: string
  kind: PgmlCompareDiffLineKind
  prefix: '+' | '-' | ' '
}

export const getPgmlCompareDiffPrefixLabel = (
  kind: PgmlCompareDiffLineKind,
  baseLabel: string,
  targetLabel: string
) => {
  if (kind === 'removed') {
    return `Only in ${baseLabel}`
  }

  if (kind === 'added') {
    return `Only in ${targetLabel}`
  }

  return ''
}

const splitDiffLines = (value: string) => {
  return value.replaceAll('\r\n', '\n').split('\n')
}

const normalizeComparableLine = (value: string) => {
  return value.trimEnd().replace(/,$/, '')
}

const areComparableLinesEqual = (
  beforeLine: string,
  afterLine: string
) => {
  return beforeLine === afterLine || normalizeComparableLine(beforeLine) === normalizeComparableLine(afterLine)
}

const createLcsMatrix = (
  beforeLines: string[],
  afterLines: string[]
) => {
  const matrix = Array.from({ length: beforeLines.length + 1 }, () => {
    return Array.from({ length: afterLines.length + 1 }, () => 0)
  })

  for (let beforeIndex = beforeLines.length - 1; beforeIndex >= 0; beforeIndex -= 1) {
    for (let afterIndex = afterLines.length - 1; afterIndex >= 0; afterIndex -= 1) {
      matrix[beforeIndex]![afterIndex] = areComparableLinesEqual(beforeLines[beforeIndex] || '', afterLines[afterIndex] || '')
        ? (matrix[beforeIndex + 1]![afterIndex + 1] || 0) + 1
        : Math.max(
            matrix[beforeIndex + 1]![afterIndex] || 0,
            matrix[beforeIndex]![afterIndex + 1] || 0
          )
    }
  }

  return matrix
}

export const buildPgmlCompareDiffLines = (
  beforeValue: string,
  afterValue: string
) => {
  const beforeLines = splitDiffLines(beforeValue)
  const afterLines = splitDiffLines(afterValue)
  const lcsMatrix = createLcsMatrix(beforeLines, afterLines)
  const lines: PgmlCompareDiffLine[] = []
  let beforeIndex = 0
  let afterIndex = 0
  let lineIndex = 0

  const pushLine = (
    kind: PgmlCompareDiffLineKind,
    content: string
  ) => {
    lines.push({
      content,
      key: `compare-diff-line:${lineIndex}`,
      kind,
      prefix: kind === 'added' ? '+' : kind === 'removed' ? '-' : ' '
    })
    lineIndex += 1
  }

  while (beforeIndex < beforeLines.length && afterIndex < afterLines.length) {
    if (areComparableLinesEqual(beforeLines[beforeIndex] || '', afterLines[afterIndex] || '')) {
      pushLine('context', afterLines[afterIndex] || beforeLines[beforeIndex] || '')
      beforeIndex += 1
      afterIndex += 1
      continue
    }

    const removingKeepsLongerMatch = (lcsMatrix[beforeIndex + 1]?.[afterIndex] || 0)
      >= (lcsMatrix[beforeIndex]?.[afterIndex + 1] || 0)

    if (removingKeepsLongerMatch) {
      pushLine('removed', beforeLines[beforeIndex] || '')
      beforeIndex += 1
      continue
    }

    pushLine('added', afterLines[afterIndex] || '')
    afterIndex += 1
  }

  while (beforeIndex < beforeLines.length) {
    pushLine('removed', beforeLines[beforeIndex] || '')
    beforeIndex += 1
  }

  while (afterIndex < afterLines.length) {
    pushLine('added', afterLines[afterIndex] || '')
    afterIndex += 1
  }

  return lines
}
