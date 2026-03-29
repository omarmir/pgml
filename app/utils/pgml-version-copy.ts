export const buildPgmlCheckpointTargetLabel = (baseVersionLabel?: string | null) => {
  return baseVersionLabel
    ? `Branches from ${baseVersionLabel}`
    : 'Creates the first locked version from the workspace draft'
}

export const buildPgmlCheckpointRoleDescription = (role: 'design' | 'implementation') => {
  return role === 'implementation'
    ? 'Use an implementation checkpoint when the workspace reflects imported database state you want to preserve as a baseline.'
    : 'Use a design checkpoint when the workspace captures the intended next PGML revision.'
}
