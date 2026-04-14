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
  let blockCommentDepth = 0
  let doubleQuoted = false
  let inLineComment = false
  let singleQuoted = false
  let pendingWhitespace = false
  let dollarQuoted: string | null = null

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

    if (inLineComment) {
      if (character === '\n') {
        inLineComment = false
        pendingWhitespace = normalized.length > 0
      }

      continue
    }

    if (blockCommentDepth > 0) {
      if (character === '/' && nextCharacter === '*') {
        blockCommentDepth += 1
        index += 1
      } else if (character === '*' && nextCharacter === '/') {
        blockCommentDepth -= 1
        index += 1
      }

      continue
    }

    if (dollarQuoted) {
      const endIndex = value.indexOf(dollarQuoted, index)

      if (endIndex < 0) {
        const innerValue = value.slice(index)
        appendToken(`$body$${normalizeExecutableSqlText(innerValue) || ''}$body$`)
        break
      }

      const innerValue = value.slice(index, endIndex)
      appendToken(`$body$${normalizeExecutableSqlText(innerValue) || ''}$body$`)
      index = endIndex + dollarQuoted.length - 1
      dollarQuoted = null
      continue
    }

    if (singleQuoted) {
      appendToken(character)

      if (character === '\'' && nextCharacter === '\'') {
        appendToken(nextCharacter)
        index += 1
        continue
      }

      if (character === '\'') {
        singleQuoted = false
      }

      continue
    }

    if (doubleQuoted) {
      appendToken(character)

      if (character === '"' && nextCharacter === '"') {
        appendToken(nextCharacter)
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '-' && nextCharacter === '-') {
      inLineComment = true
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      blockCommentDepth += 1
      index += 1
      continue
    }

    if (character === '\'') {
      singleQuoted = true
      appendToken(character)
      continue
    }

    if (character === '"') {
      doubleQuoted = true
      appendToken(character)
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        dollarQuoted = match[0]
        index += dollarQuoted.length - 1
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
