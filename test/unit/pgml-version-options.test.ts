import { describe, expect, it } from 'vitest'

import {
  buildPgmlImportBaseVersionDescription,
  buildPgmlImportBaseVersionItems,
  buildPgmlVersionCompareOption,
  buildPgmlWorkspaceCompareOption,
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

  it('builds import base descriptions from root and labeled parent versions', () => {
    expect(buildPgmlImportBaseVersionDescription({
      parentVersionId: null,
      parentVersionLabel: null
    })).toBe('Root version')
    expect(buildPgmlImportBaseVersionDescription({
      parentVersionId: 'v1',
      parentVersionLabel: 'Initial design'
    })).toBe('Continues from Initial design')
  })

  it('builds the workspace compare option', () => {
    expect(buildPgmlWorkspaceCompareOption()).toEqual({
      label: 'Current workspace',
      value: 'workspace'
    })
  })

  it('builds a version compare option from a labeled version', () => {
    expect(buildPgmlVersionCompareOption({
      id: 'v2',
      label: 'Orders branch'
    })).toEqual({
      label: 'Orders branch',
      value: 'v2'
    })
  })
})
