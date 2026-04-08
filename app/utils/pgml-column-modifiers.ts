const normalizeLine = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const trimIdentifierQuotes = (value: string) => {
  return value.trim().replaceAll('"', '')
}

const splitQualifiedIdentifierParts = (value: string) => {
  const parts: string[] = []
  let current = ''
  let doubleQuoted = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (doubleQuoted) {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '"') {
      doubleQuoted = true
      current += character
      continue
    }

    if (character === '.') {
      const nextPart = current.trim()

      if (nextPart.length > 0) {
        parts.push(nextPart)
      }

      current = ''
      continue
    }

    current += character
  }

  const trailingPart = current.trim()

  if (trailingPart.length > 0) {
    parts.push(trailingPart)
  }

  return parts
}

const normalizeQualifiedIdentifier = (value: string) => {
  const normalized = normalizeLine(value).replaceAll('\\"', '"')
  const parts = splitQualifiedIdentifierParts(normalized)
    .map(part => trimIdentifierQuotes(part))
    .filter(part => part.length > 0)

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  return parts[0] || trimIdentifierQuotes(normalized)
}

const normalizeReferenceModifier = (modifier: string) => {
  const referenceMatch = modifier.match(/^ref:\s*([<>-])\s*(.+)$/iu)

  if (!referenceMatch) {
    return modifier
  }

  return `ref: ${referenceMatch[1] || '>'} ${normalizeLine(referenceMatch[2] || '')}`
}

const normalizeActionModifier = (
  modifier: string,
  kind: 'delete' | 'update'
) => {
  const actionMatch = modifier.match(new RegExp(`^${kind}:\\s*(.+)$`, 'iu'))

  if (!actionMatch) {
    return modifier
  }

  return `${kind}: ${normalizeLine(actionMatch[1] || '').toLowerCase()}`
}

const normalizeDefaultExpression = (value: string) => {
  const normalizedValue = normalizeLine(value)
  const nextvalMatch = normalizedValue.match(/^nextval\(\s*'(.+?)'\s*(?:::\s*regclass)?\s*\)$/iu)

  if (!nextvalMatch?.[1]) {
    return normalizedValue
  }

  return `nextval('${normalizeQualifiedIdentifier(nextvalMatch[1])}')`
}

export const normalizePgmlColumnModifier = (modifier: string) => {
  const normalizedModifier = normalizeLine(modifier)
  const lowercaseModifier = normalizedModifier.toLowerCase()

  if (lowercaseModifier === 'pk') {
    return 'pk'
  }

  if (lowercaseModifier === 'not null') {
    return 'not null'
  }

  if (lowercaseModifier === 'unique') {
    return 'unique'
  }

  if (lowercaseModifier.startsWith('default:')) {
    return `default: ${normalizeDefaultExpression(normalizedModifier.replace(/^default:\s*/iu, ''))}`
  }

  if (lowercaseModifier.startsWith('ref:')) {
    return normalizeReferenceModifier(normalizedModifier)
  }

  if (lowercaseModifier.startsWith('delete:')) {
    return normalizeActionModifier(normalizedModifier, 'delete')
  }

  if (lowercaseModifier.startsWith('update:')) {
    return normalizeActionModifier(normalizedModifier, 'update')
  }

  return normalizedModifier
}

const getModifierSortRank = (modifier: string) => {
  const normalizedModifier = normalizePgmlColumnModifier(modifier).toLowerCase()

  if (normalizedModifier === 'pk') {
    return 0
  }

  if (normalizedModifier === 'not null') {
    return 1
  }

  if (normalizedModifier === 'unique') {
    return 2
  }

  if (normalizedModifier.startsWith('default:')) {
    return 3
  }

  if (normalizedModifier.startsWith('note:')) {
    return 4
  }

  if (normalizedModifier.startsWith('ref:')) {
    return 5
  }

  if (normalizedModifier.startsWith('delete:')) {
    return 6
  }

  if (normalizedModifier.startsWith('update:')) {
    return 7
  }

  return 100
}

export const normalizePgmlColumnModifiers = (modifiers: string[]) => {
  return modifiers
    .map(modifier => normalizePgmlColumnModifier(modifier))
    .sort((left, right) => {
      const leftRank = getModifierSortRank(left)
      const rightRank = getModifierSortRank(right)

      if (leftRank !== rightRank) {
        return leftRank - rightRank
      }

      return left.localeCompare(right)
    })
}

export const getPgmlColumnDefaultModifierValue = (modifiers: string[]) => {
  return modifiers.find(modifier => modifier.startsWith('default:'))?.replace(/^default:\s*/u, '').trim() || null
}

export const getNormalizedPgmlColumnDefaultModifierValue = (modifiers: string[]) => {
  const defaultValue = getPgmlColumnDefaultModifierValue(modifiers)

  return defaultValue ? normalizeDefaultExpression(defaultValue) : null
}
