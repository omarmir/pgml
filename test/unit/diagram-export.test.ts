import { describe, expect, it } from 'vitest'

import {
  diagramRasterExportScaleFactors,
  getRasterExportPlan,
  getRasterExportDimensions,
  MAX_RASTER_EXPORT_DIMENSION,
  MAX_RASTER_EXPORT_PIXELS
} from '../../app/utils/diagram-export'

describe('getRasterExportDimensions', () => {
  it('exposes the supported raster export scale ladder in ascending order', () => {
    expect([...diagramRasterExportScaleFactors]).toEqual([1, 2, 3, 4, 8])
  })

  it('allows a larger 8x export when it stays within safe browser limits', () => {
    expect(getRasterExportDimensions(2080, 1970, 8)).toEqual({
      rasterWidth: 16640,
      rasterHeight: 15760,
      totalPixels: 262246400
    })
  })

  it('rejects exports that exceed the canvas dimension budget', () => {
    expect(() => getRasterExportDimensions(MAX_RASTER_EXPORT_DIMENSION + 1, 1200, 1)).toThrow(
      'The current diagram is too large for 1x PNG export.'
    )
  })

  it('rejects exports that exceed the total raster pixel budget', () => {
    const safeDimension = Math.floor(Math.sqrt(MAX_RASTER_EXPORT_PIXELS)) + 1

    expect(() => getRasterExportDimensions(safeDimension, safeDimension, 1)).toThrow(
      'The current diagram is too detailed for 1x PNG export.'
    )
  })

  it('shrinks padding to keep larger png exports available', () => {
    expect(getRasterExportPlan(1626, 2536, 8, 24)).toEqual({
      padding: 8,
      rasterWidth: 13136,
      rasterHeight: 20416,
      totalPixels: 268184576
    })
  })

  it('fails when a raster export cannot fit even without padding', () => {
    expect(() => getRasterExportPlan(5000, 5000, 8, 24)).toThrow(
      'The current diagram is too large for 8x PNG export.'
    )
  })
})
