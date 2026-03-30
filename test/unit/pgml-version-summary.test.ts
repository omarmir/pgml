import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import {
  buildPgmlEmptyBaseCompareRelationshipSummary,
  buildPgmlCompareDeltaDescription,
  buildPgmlDirectIncrementCompareRelationshipSummary,
  buildPgmlDivergedCompareRelationshipSummary,
  buildPgmlDocumentEditorModeDescription,
  buildPgmlEditorReadOnlyLabel,
  buildPgmlInvalidCompareRelationshipSummary,
  buildPgmlNoCommonAncestorCompareRelationshipSummary,
  buildPgmlPreviewTargetLabel,
  buildPgmlVersionPreviewDescription,
  buildPgmlVersionCompareSummary,
  buildPgmlVersionDiffSections,
  buildPgmlWorkspaceCompareRelationshipSummary,
  buildPgmlWorkspaceBaseCompareRelationshipSummary,
  buildPgmlWorkspaceBaseLabel,
  buildPgmlWorkspaceEditorDescription,
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

  it('builds the document editor mode description', () => {
    expect(buildPgmlDocumentEditorModeDescription()).toContain('full VersionSet document')
  })

  it('builds the version preview editor description', () => {
    expect(buildPgmlVersionPreviewDescription('Initial design')).toContain('Initial design')
  })

  it('builds the workspace editor description', () => {
    expect(buildPgmlWorkspaceEditorDescription()).toContain('current workspace snapshot')
  })

  it('builds compare delta descriptions from changed section counts', () => {
    expect(buildPgmlCompareDeltaDescription(2)).toContain('2 changed areas')
    expect(buildPgmlCompareDeltaDescription(0)).toBe('No visible delta in the selected comparison.')
  })

  it.each([
    {
      expected: 'Comparing the current workspace against an empty base.',
      label: 'empty-base',
      summary: buildPgmlEmptyBaseCompareRelationshipSummary()
    },
    {
      expected: 'Comparing the current workspace against Implementation sync.',
      label: 'workspace',
      summary: buildPgmlWorkspaceCompareRelationshipSummary('Implementation sync')
    },
    {
      expected: 'Select a valid base and target to compare version history.',
      label: 'invalid',
      summary: buildPgmlInvalidCompareRelationshipSummary()
    },
    {
      expected: 'Add orders increments directly from Initial design.',
      label: 'direct increment',
      summary: buildPgmlDirectIncrementCompareRelationshipSummary('Add orders', 'Initial design')
    },
    {
      expected: 'Selected versions diverge from Initial design.',
      label: 'diverged',
      summary: buildPgmlDivergedCompareRelationshipSummary('Initial design')
    },
    {
      expected: 'Selected versions do not share a common recorded ancestor.',
      label: 'no-common-ancestor',
      summary: buildPgmlNoCommonAncestorCompareRelationshipSummary()
    }
  ])('builds the $label compare relationship summary', ({ summary, expected }) => {
    expect(summary).toBe(expected)
  })

  it('builds the workspace-base compare relationship summary', () => {
    expect(buildPgmlWorkspaceBaseCompareRelationshipSummary('Initial design')).toContain('locked base Initial design')
  })
})
