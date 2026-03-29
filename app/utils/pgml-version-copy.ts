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

export const buildPgmlRestoreVersionDescription = (hasPendingChanges: boolean) => {
  return hasPendingChanges
    ? 'The current workspace has unsaved changes. Restoring will replace the draft before the next checkpoint.'
    : 'This will replace the current workspace draft and point future changes at the restored base version.'
}

export const buildPgmlImportDumpDialogDescription = (baseVersionLabel: string) => {
  return `Paste a text pg_dump or upload a text dump file. PGML will convert the dump into schema objects, replace the current workspace snapshot, and set the workspace to increment from ${baseVersionLabel}.`
}
