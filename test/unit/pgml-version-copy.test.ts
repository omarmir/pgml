import { describe, expect, it } from 'vitest'

import { buildPgmlCheckpointTargetLabel } from '../../app/utils/pgml-version-copy'

describe('PGML version copy helpers', () => {
  it('builds checkpoint target labels for rooted and first-checkpoint states', () => {
    expect(buildPgmlCheckpointTargetLabel('Initial implementation')).toBe('Branches from Initial implementation')
    expect(buildPgmlCheckpointTargetLabel(null)).toBe('Creates the first locked version from the workspace draft')
  })
})
