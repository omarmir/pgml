export const pgmlTableWidthScaleValues = [1, 1.25, 1.5, 1.75, 2] as const

export type PgmlTableWidthScale = typeof pgmlTableWidthScaleValues[number]

export const defaultPgmlTableWidthScale: PgmlTableWidthScale = 1

export const normalizePgmlTableWidthScale = (value: number | null | undefined): PgmlTableWidthScale => {
  if (!Number.isFinite(value)) {
    return defaultPgmlTableWidthScale
  }

  const safeValue = value as number

  return pgmlTableWidthScaleValues.reduce((closestScale, candidateScale) => {
    const closestDistance = Math.abs(safeValue - closestScale)
    const candidateDistance = Math.abs(safeValue - candidateScale)

    return candidateDistance < closestDistance ? candidateScale : closestScale
  }, defaultPgmlTableWidthScale)
}

export const hasStoredPgmlTableWidthScale = (value: number | null | undefined) => {
  return normalizePgmlTableWidthScale(value) !== defaultPgmlTableWidthScale
}
