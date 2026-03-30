const buildPgmlImportDialogDescription = (input: {
  baseVersionLabel: string
  fileLabel: string
  pasteLabel: string
}) => {
  return `Paste ${input.pasteLabel} or upload ${input.fileLabel}. PGML will convert the import into schema objects, replace the current workspace snapshot, and set the workspace to increment from ${input.baseVersionLabel}.`
}

const buildPgmlImportInputDescription = () => {
  return 'Choose exactly one input method. This replaces the current draft workspace but does not create a locked version until you checkpoint it.'
}

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
  return buildPgmlImportDialogDescription({
    baseVersionLabel,
    fileLabel: 'a text dump file',
    pasteLabel: 'a text pg_dump'
  })
}

export const buildPgmlImportDumpInputDescription = () => {
  return buildPgmlImportInputDescription()
}

export const buildPgmlImportDumpDialogTitle = () => {
  return 'Import pg_dump onto a version'
}

export const buildPgmlImportDumpConfirmLabel = () => {
  return 'Replace workspace with import'
}

export const buildPgmlImportCheckpointRequiredDescription = () => {
  return 'Create a version checkpoint before importing onto this document.'
}

export const buildPgmlImportBaseRequiredMessage = () => {
  return 'Choose the version this import should increment from.'
}

export const buildPgmlImportSuccessDescription = () => {
  return 'The imported dump is now the current workspace draft. Create a checkpoint when you want to lock it.'
}

export const buildPgmlImportFailureMessage = () => {
  return 'Unable to import that pg_dump.'
}

export const buildPgmlImportConflictMessage = () => {
  return 'Choose either pasted pg_dump text or a file upload, not both.'
}

export const buildPgmlImportMissingInputMessage = () => {
  return 'Paste pg_dump text or choose a text dump file before importing.'
}

export const buildPgmlImportDbmlDialogDescription = (baseVersionLabel: string) => {
  return buildPgmlImportDialogDescription({
    baseVersionLabel,
    fileLabel: 'a DBML file',
    pasteLabel: 'DBML text'
  })
}

export const buildPgmlImportDbmlInputDescription = () => {
  return buildPgmlImportInputDescription()
}

export const buildPgmlImportDbmlDialogTitle = () => {
  return 'Import DBML onto a version'
}

export const buildPgmlImportDbmlConfirmLabel = () => {
  return 'Replace workspace with import'
}

export const buildPgmlImportDbmlFailureMessage = () => {
  return 'Unable to import that DBML.'
}

export const buildPgmlImportDbmlConflictMessage = () => {
  return 'Choose either pasted DBML text or a file upload, not both.'
}

export const buildPgmlImportDbmlMissingInputMessage = () => {
  return 'Paste DBML text or choose a DBML file before importing.'
}

export const buildPgmlRestoreSuccessDescription = () => {
  return 'The selected version is now the active workspace draft.'
}

export const buildPgmlCheckpointCreatedDescription = (
  versionLabel: string,
  role: 'design' | 'implementation'
) => {
  return `${versionLabel} is now locked as a ${role} version.`
}
