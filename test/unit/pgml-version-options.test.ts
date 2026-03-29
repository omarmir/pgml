import { describe, expect, it } from 'vitest'

import {
  buildPgmlImportBaseVersionItems,
  buildPgmlVersionCompareOptions
} from '../../app/utils/pgml-version-options'

describe('PGML version option helpers', () => {
  it('builds compare and import option lists from version panel items', () => {
    const versions = [
      {
        id: 'v1',
        label: 'Initial design',
        parentVersionId: null
      },
      {
        id: 'v2',
        label: 'Orders branch',
        parentVersionId: 'v1'
      }
    ]

    expect(buildPgmlVersionCompareOptions(versions)).toEqual([
      {
        label: 'Current workspace',
        value: 'workspace'
      },
      {
        label: 'Initial design',
        value: 'v1'
      },
      {
        label: 'Orders branch',
        value: 'v2'
      }
    ])
    expect(buildPgmlImportBaseVersionItems(versions)).toEqual([
      {
        description: 'Root version',
        label: 'Initial design',
        value: 'v1'
      },
      {
        description: 'Continues from v1',
        label: 'Orders branch',
        value: 'v2'
      }
    ])
  })
})
