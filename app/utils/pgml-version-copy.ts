export const buildPgmlCheckpointTargetLabel = (baseVersionLabel?: string | null) => {
  return baseVersionLabel
    ? `Branches from ${baseVersionLabel}`
    : 'Creates the first locked version from the workspace draft'
}
