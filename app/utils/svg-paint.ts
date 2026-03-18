export type SvgGradientStop = {
  color: string
  offset: string | null
}

export type SvgPaint = {
  color: string
  opacity: number | null
}

const splitCssTopLevel = (value: string, delimiter = ',') => {
  const parts: string[] = []
  let current = ''
  let depth = 0

  for (const character of value) {
    if (character === '(') {
      depth += 1
      current += character
      continue
    }

    if (character === ')') {
      depth = Math.max(0, depth - 1)
      current += character
      continue
    }

    if (character === delimiter && depth === 0) {
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

const extractColorStopOffset = (value: string) => {
  let depth = 0
  let splitIndex = -1

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index] || ''

    if (character === ')') {
      depth += 1
      continue
    }

    if (character === '(') {
      depth = Math.max(0, depth - 1)
      continue
    }

    if (depth === 0 && /\s/.test(character)) {
      const nextOffset = value.slice(index).trim()

      if (/^-?\d+(?:\.\d+)?%?$/.test(nextOffset)) {
        splitIndex = index
        break
      }
    }
  }

  if (splitIndex === -1) {
    return {
      color: value.trim(),
      offset: null
    }
  }

  return {
    color: value.slice(0, splitIndex).trim(),
    offset: value.slice(splitIndex).trim() || null
  }
}

export const normalizeSvgColor = (value: string, fallback = 'transparent') => {
  const trimmed = value.trim()

  if (trimmed.length === 0 || trimmed.toLowerCase() === 'none') {
    return fallback
  }

  const srgbMatch = trimmed.match(/^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)$/i)

  if (!srgbMatch) {
    return trimmed.replace(/\s+/g, ' ')
  }

  const red = Math.round(Number.parseFloat(srgbMatch[1] || '0') * 255)
  const green = Math.round(Number.parseFloat(srgbMatch[2] || '0') * 255)
  const blue = Math.round(Number.parseFloat(srgbMatch[3] || '0') * 255)
  const alpha = srgbMatch[4] ? Number.parseFloat(srgbMatch[4]) : 1

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

const toHexChannel = (value: number) => {
  return Math.max(0, Math.min(255, Math.round(value)))
    .toString(16)
    .padStart(2, '0')
}

const rgbaToSvgPaint = (value: string): SvgPaint | null => {
  const rgbaMatch = value.match(/^rgba?\((.*)\)$/i)

  if (!rgbaMatch) {
    return null
  }

  const channels = splitCssTopLevel(rgbaMatch[1] || '')

  if (channels.length < 3) {
    return null
  }

  const red = Number.parseFloat(channels[0] || '0')
  const green = Number.parseFloat(channels[1] || '0')
  const blue = Number.parseFloat(channels[2] || '0')
  const alpha = channels[3] ? Number.parseFloat(channels[3]) : 1

  return {
    color: `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`,
    opacity: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
  }
}

const hexToSvgPaint = (value: string): SvgPaint | null => {
  const normalized = value.trim()

  if (!/^#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(normalized)) {
    return null
  }

  if (normalized.length === 4 || normalized.length === 5) {
    const red = normalized[1] || '0'
    const green = normalized[2] || '0'
    const blue = normalized[3] || '0'
    const alpha = normalized.length === 5 ? normalized[4] || 'f' : 'f'

    return {
      color: `#${red}${red}${green}${green}${blue}${blue}`,
      opacity: Number.parseInt(`${alpha}${alpha}`, 16) / 255
    }
  }

  if (normalized.length === 9) {
    return {
      color: normalized.slice(0, 7),
      opacity: Number.parseInt(normalized.slice(7), 16) / 255
    }
  }

  return {
    color: normalized,
    opacity: 1
  }
}

export const normalizeSvgPaint = (value: string, fallback = 'transparent'): SvgPaint => {
  const normalized = normalizeSvgColor(value, fallback).trim()

  if (normalized.toLowerCase() === 'transparent') {
    return {
      color: '#000000',
      opacity: 0
    }
  }

  const rgbaPaint = rgbaToSvgPaint(normalized)

  if (rgbaPaint) {
    return rgbaPaint
  }

  const hexPaint = hexToSvgPaint(normalized)

  if (hexPaint) {
    return hexPaint
  }

  return {
    color: normalized,
    opacity: null
  }
}

export const parseCssLinearGradient = (backgroundImage: string): SvgGradientStop[] | null => {
  const firstLayer = splitCssTopLevel(backgroundImage)
    .map(part => part.trim())
    .find(part => part.length > 0 && part.toLowerCase() !== 'none')

  if (!firstLayer) {
    return null
  }

  const gradientMatch = firstLayer.match(/^linear-gradient\((.*)\)$/i)

  if (!gradientMatch) {
    return null
  }

  const rawArguments = splitCssTopLevel(gradientMatch[1] || '')

  if (!rawArguments.length) {
    return null
  }

  const firstArgument = rawArguments[0]?.trim().toLowerCase() || ''
  const stopArguments = firstArgument.endsWith('deg') || firstArgument.startsWith('to ')
    ? rawArguments.slice(1)
    : rawArguments

  if (!stopArguments.length) {
    return null
  }

  return stopArguments
    .map(extractColorStopOffset)
    .filter(stop => stop.color.length > 0)
    .map(stop => ({
      color: normalizeSvgColor(stop.color),
      offset: stop.offset
    }))
}
