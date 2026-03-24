import { describe, expect, it } from 'vitest'

import {
  defaultPgmlTableWidthScale,
  hasStoredPgmlTableWidthScale,
  normalizePgmlTableWidthScale
} from '../../app/utils/pgml-node-properties'

describe('PGML node property helpers', () => {
  it('normalizes invalid table width scales to the default width', () => {
    expect(normalizePgmlTableWidthScale(undefined)).toBe(defaultPgmlTableWidthScale)
    expect(normalizePgmlTableWidthScale(null)).toBe(defaultPgmlTableWidthScale)
    expect(normalizePgmlTableWidthScale(Number.NaN)).toBe(defaultPgmlTableWidthScale)
  })

  it('snaps table width scales to the nearest supported width multiplier', () => {
    expect(normalizePgmlTableWidthScale(1.24)).toBe(1.25)
    expect(normalizePgmlTableWidthScale(1.62)).toBe(1.5)
    expect(normalizePgmlTableWidthScale(1.9)).toBe(2)
  })

  it('only persists non-default table width scales', () => {
    expect(hasStoredPgmlTableWidthScale(1)).toBe(false)
    expect(hasStoredPgmlTableWidthScale(1.25)).toBe(true)
  })
})
