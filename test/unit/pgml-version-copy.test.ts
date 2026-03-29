import { describe, expect, it } from 'vitest'

import {
  buildPgmlCheckpointRoleDescription,
  buildPgmlCheckpointTargetLabel,
  buildPgmlImportDumpDialogDescription,
  buildPgmlRestoreVersionDescription
} from '../../app/utils/pgml-version-copy'

describe('PGML version copy helpers', () => {
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
})
