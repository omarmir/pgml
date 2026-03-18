export const MAX_RASTER_EXPORT_DIMENSION = 32767
export const MAX_RASTER_EXPORT_PIXELS = 268_435_456

export type RasterExportDimensions = {
  rasterWidth: number
  rasterHeight: number
  totalPixels: number
}

export type RasterExportPlan = RasterExportDimensions & {
  padding: number
}

export const getRasterExportDimensions = (
  width: number,
  height: number,
  scaleFactor: number
): RasterExportDimensions => {
  const rasterWidth = Math.ceil(width * scaleFactor)
  const rasterHeight = Math.ceil(height * scaleFactor)
  const totalPixels = rasterWidth * rasterHeight

  if (rasterWidth > MAX_RASTER_EXPORT_DIMENSION || rasterHeight > MAX_RASTER_EXPORT_DIMENSION) {
    throw new Error(`The current diagram is too large for ${scaleFactor}x PNG export.`)
  }

  if (totalPixels > MAX_RASTER_EXPORT_PIXELS) {
    throw new Error(`The current diagram is too detailed for ${scaleFactor}x PNG export.`)
  }

  return {
    rasterWidth,
    rasterHeight,
    totalPixels
  }
}

export const getRasterExportPlan = (
  width: number,
  height: number,
  scaleFactor: number,
  preferredPadding: number
): RasterExportPlan => {
  let padding = preferredPadding
  let lastError: Error | null = null

  while (padding >= 0) {
    try {
      const dimensions = getRasterExportDimensions(width + padding * 2, height + padding * 2, scaleFactor)

      return {
        padding,
        ...dimensions
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unable to prepare the PNG export.')
      padding -= 2
    }
  }

  throw lastError || new Error('Unable to prepare the PNG export.')
}
