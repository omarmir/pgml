type SqlScanMode = { kind: 'normal' | 'single-quoted' | 'double-quoted' | 'line-comment' }
  | { kind: 'dollar-quoted', delimiter: string }
  | { kind: 'block-comment', depth: number }

export const normalizeWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

export const normalizeSqlIdentifier = (value: string) => {
  return value.trim().replaceAll('"', '')
}

export const normalizeExecutableSqlText = (value: string | null | undefined): string | null => {
  if (!value || value.trim().length === 0) {
    return null
  }

  let normalized = ''
  let mode: SqlScanMode = { kind: 'normal' }
  let pendingWhitespace = false

  const appendToken = (token: string) => {
    if (pendingWhitespace && normalized.length > 0) {
      normalized += ' '
    }

    normalized += token
    pendingWhitespace = false
  }

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (mode.kind === 'line-comment') {
      if (character === '\n') {
        mode = { kind: 'normal' }
        pendingWhitespace = normalized.length > 0
      }

      continue
    }

    if (mode.kind === 'block-comment') {
      if (character === '/' && nextCharacter === '*') {
        mode.depth += 1
        index += 1
      } else if (character === '*' && nextCharacter === '/') {
        mode.depth -= 1

        if (mode.depth === 0) {
          mode = { kind: 'normal' }
        }
        index += 1
      }

      continue
    }

    if (mode.kind === 'dollar-quoted') {
      const endIndex = value.indexOf(mode.delimiter, index)

      if (endIndex < 0) {
        const innerValue = value.slice(index)
        appendToken(`$body$${normalizeExecutableSqlText(innerValue) || ''}$body$`)
        break
      }

      const innerValue = value.slice(index, endIndex)
      appendToken(`$body$${normalizeExecutableSqlText(innerValue) || ''}$body$`)
      index = endIndex + mode.delimiter.length - 1
      mode = { kind: 'normal' }
      continue
    }

    if (mode.kind === 'single-quoted') {
      appendToken(character)

      if (character === '\'' && nextCharacter === '\'') {
        appendToken(nextCharacter)
        index += 1
        continue
      }

      if (character === '\'') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'double-quoted') {
      appendToken(character)

      if (character === '"' && nextCharacter === '"') {
        appendToken(nextCharacter)
        index += 1
        continue
      }

      if (character === '"') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (character === '-' && nextCharacter === '-') {
      mode = { kind: 'line-comment' }
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      mode = { kind: 'block-comment', depth: 1 }
      index += 1
      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      appendToken(character)
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      appendToken(character)
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        mode = { kind: 'dollar-quoted', delimiter: match[0] }
        index += mode.delimiter.length - 1
        continue
      }
    }

    if (/\s/u.test(character)) {
      pendingWhitespace = normalized.length > 0
      continue
    }

    appendToken(character.toLowerCase())
  }

  return normalized.trim()
}
