export type SqlQuoteMode = { kind: 'normal' | 'single-quoted' | 'double-quoted' }
  | { kind: 'dollar-quoted', delimiter: string }

export type SqlStatementMode = SqlQuoteMode
  | { kind: 'line-comment' }
  | { kind: 'block-comment', depth: number }

export const splitTopLevelSqlList = (value: string) => {
  const entries: string[] = []
  let current = ''
  let curlyDepth = 0
  let squareDepth = 0
  let roundDepth = 0
  let mode: SqlQuoteMode = { kind: 'normal' }

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (mode.kind === 'dollar-quoted') {
      if (value.startsWith(mode.delimiter, index)) {
        current += mode.delimiter
        index += mode.delimiter.length - 1
        mode = { kind: 'normal' }
        continue
      }

      current += character
      continue
    }

    if (mode.kind === 'single-quoted') {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'double-quoted') {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      current += character
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      current += character
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        mode = { kind: 'dollar-quoted', delimiter: match[0] }
        current += mode.delimiter
        index += mode.delimiter.length - 1
        continue
      }
    }

    if (character === '(') {
      roundDepth += 1
      current += character
      continue
    }

    if (character === ')') {
      roundDepth = Math.max(0, roundDepth - 1)
      current += character
      continue
    }

    if (character === '[') {
      squareDepth += 1
      current += character
      continue
    }

    if (character === ']') {
      squareDepth = Math.max(0, squareDepth - 1)
      current += character
      continue
    }

    if (character === '{') {
      curlyDepth += 1
      current += character
      continue
    }

    if (character === '}') {
      curlyDepth = Math.max(0, curlyDepth - 1)
      current += character
      continue
    }

    if (character === ',' && roundDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
      const entry = current.trim()

      if (entry.length > 0) {
        entries.push(entry)
      }

      current = ''
      continue
    }

    current += character
  }

  const trailingEntry = current.trim()

  if (trailingEntry.length > 0) {
    entries.push(trailingEntry)
  }

  return entries
}

export const readBalancedSection = (
  value: string,
  startIndex: number,
  delimiters: {
    close: string
    open: string
  } = {
    close: ')',
    open: '('
  }
) => {
  let current = ''
  let depth = 0
  let mode: SqlQuoteMode = { kind: 'normal' }

  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (mode.kind === 'dollar-quoted') {
      if (value.startsWith(mode.delimiter, index)) {
        current += mode.delimiter
        index += mode.delimiter.length - 1
        mode = { kind: 'normal' }
        continue
      }

      current += character
      continue
    }

    if (mode.kind === 'single-quoted') {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'double-quoted') {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      current += character
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      current += character
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        mode = { kind: 'dollar-quoted', delimiter: match[0] }
        current += mode.delimiter
        index += mode.delimiter.length - 1
        continue
      }
    }

    if (character === delimiters.open) {
      depth += 1

      if (depth > 1) {
        current += character
      }

      continue
    }

    if (character === delimiters.close) {
      depth -= 1

      if (depth === 0) {
        return {
          content: current,
          endIndex: index
        }
      }

      current += character
      continue
    }

    if (depth > 0) {
      current += character
    }
  }

  return null
}
