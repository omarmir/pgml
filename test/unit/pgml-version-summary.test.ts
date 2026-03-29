import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import {
  buildPgmlEditorReadOnlyLabel,
  buildPgmlPreviewTargetLabel,
  buildPgmlVersionCompareSummary,
  buildPgmlVersionDiffSections,
  buildPgmlWorkspaceBaseLabel,
  buildPgmlWorkspaceStatus
} from '../../app/utils/pgml-version-summary'

describe('PGML version summary helpers', () => {
  it('groups schema diff entries into labeled compare sections', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.users {
  id uuid [pk]
}`),
      parsePgml(`Table public.users {
  id uuid [pk]
  email text
}

Table public.orders {
  id uuid [pk]
}`)
    )
    const sections = buildPgmlVersionDiffSections(diff)

    expect(sections).toMatchObject([
      {
        count: 1,
        label: 'Tables'
      },
      {
        count: 2,
        label: 'Columns'
      }
    ])
  })

  it('builds a compare summary from labels, sections, and layout changes', () => {
    expect(buildPgmlVersionCompareSummary({
      compareBaseLabel: 'v1',
      compareTargetLabel: 'workspace',
      diffSections: [{
        count: 2,
        items: [],
        label: 'Tables'
      }],
      layoutChanged: 1
    })).toEqual({
      baseLabel: 'v1',
      changedSectionCount: 2,
      targetLabel: 'workspace'
    })
  })

  it('builds a preview label for workspace and version targets', () => {
    expect(buildPgmlPreviewTargetLabel({
      fallbackLabel: null,
      previewTargetId: 'workspace',
      workspaceLabel: 'Workspace draft'
    })).toBe('Workspace draft')
    expect(buildPgmlPreviewTargetLabel({
      fallbackLabel: 'Checkpoint v2',
      previewTargetId: 'v2',
      workspaceLabel: 'Workspace draft'
    })).toBe('Checkpoint v2')
  })

  it('builds a workspace base label from the selected base version', () => {
    expect(buildPgmlWorkspaceBaseLabel({
      basedOnVersionId: null,
      fallbackVersionId: null,
      versionLabel: null
    })).toBe('No locked base version yet.')
    expect(buildPgmlWorkspaceBaseLabel({
      basedOnVersionId: 'v2',
      fallbackVersionId: 'v2',
      versionLabel: 'Implementation sync'
    })).toBe('Incrementing from Implementation sync.')
  })

  it('builds workspace status text from checkpoint availability', () => {
    expect(buildPgmlWorkspaceStatus({
      canCheckpoint: true
    })).toBe('Draft changes are waiting to be checkpointed.')
    expect(buildPgmlWorkspaceStatus({
      canCheckpoint: false
    })).toBe('Draft matches the current locked base version.')
  })

  it('builds read-only labels from editor mode and preview state', () => {
    expect(buildPgmlEditorReadOnlyLabel({
      isWorkspacePreview: true,
      mode: 'document'
    })).toBe('Document view')
    expect(buildPgmlEditorReadOnlyLabel({
      isWorkspacePreview: false,
      mode: 'head'
    })).toBe('Version preview')
  })
})
