import { describe, expect, it } from 'vitest'

import {
  buildPgmlCheckpointCreatedDescription,
  buildPgmlCheckpointRoleDescription,
  buildPgmlCheckpointTargetLabel,
  buildPgmlImportBaseRequiredMessage,
  buildPgmlImportCheckpointRequiredDescription,
  buildPgmlImportDumpConfirmLabel,
  buildPgmlImportDumpDialogTitle,
  buildPgmlImportDumpDialogDescription,
  buildPgmlImportDumpInputDescription,
  buildPgmlImportConflictMessage,
  buildPgmlImportFailureMessage,
  buildPgmlImportMissingInputMessage,
  buildPgmlImportSuccessDescription,
  buildPgmlRestoreSuccessDescription,
  buildPgmlRestoreVersionDescription
} from '../../app/utils/pgml-version-copy'

describe('PGML version copy helpers', () => {
  it('builds checkpoint creation success copy from version metadata', () => {
    expect(buildPgmlCheckpointCreatedDescription('Initial design', 'design')).toBe('Initial design is now locked as a design version.')
  })

  it('builds checkpoint target labels for rooted and first-checkpoint states', () => {
    expect(buildPgmlCheckpointTargetLabel('Initial implementation')).toBe('Branches from Initial implementation')
    expect(buildPgmlCheckpointTargetLabel(null)).toBe('Creates the first locked version from the workspace draft')
  })

  it('builds checkpoint role descriptions for design and implementation versions', () => {
    expect(buildPgmlCheckpointRoleDescription('design')).toContain('design checkpoint')
    expect(buildPgmlCheckpointRoleDescription('implementation')).toContain('implementation checkpoint')
  })

  it('builds restore copy from workspace pending-change state', () => {
    expect(buildPgmlRestoreVersionDescription(true)).toContain('unsaved changes')
    expect(buildPgmlRestoreVersionDescription(false)).toContain('restored base version')
  })

  it('builds import dialog copy from the selected base version label', () => {
    expect(buildPgmlImportDumpDialogDescription('Implementation sync')).toContain('increment from Implementation sync')
  })

  it('builds the import dialog input instructions', () => {
    expect(buildPgmlImportDumpInputDescription()).toContain('Choose exactly one input method')
  })

  it('builds the import dialog title', () => {
    expect(buildPgmlImportDumpDialogTitle()).toBe('Import pg_dump onto a version')
  })

  it('builds the import dialog confirm label', () => {
    expect(buildPgmlImportDumpConfirmLabel()).toBe('Replace workspace with import')
  })

  it('builds the import checkpoint requirement description', () => {
    expect(buildPgmlImportCheckpointRequiredDescription()).toContain('Create a version checkpoint')
  })

  it('builds the import base selection requirement message', () => {
    expect(buildPgmlImportBaseRequiredMessage()).toContain('increment from')
  })

  it('builds the import success description', () => {
    expect(buildPgmlImportSuccessDescription()).toContain('current workspace draft')
  })

  it('builds the generic import failure message', () => {
    expect(buildPgmlImportFailureMessage()).toBe('Unable to import that pg_dump.')
  })

  it('builds the import conflict validation message', () => {
    expect(buildPgmlImportConflictMessage()).toContain('not both')
  })

  it('builds the missing import input message', () => {
    expect(buildPgmlImportMissingInputMessage()).toContain('choose a text dump file')
  })

  it('builds the restore success description', () => {
    expect(buildPgmlRestoreSuccessDescription()).toContain('active workspace draft')
  })
})
