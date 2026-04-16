import { describe, expect, it } from 'vitest'

import {
  buildPgmlDiagramCompareEntries,
  filterPgmlDiagramCompareEntriesForExclusions,
  filterPgmlDiagramCompareEntriesForNoise,
  getPgmlDiagramCompareChangeColor,
  getPgmlDiagramCompareChangeVerb,
  getPgmlDiagramCompareEntityKindLabel
} from '../../app/utils/pgml-diagram-compare'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { parsePgml } from '../../app/utils/pgml'

const parseSnapshotModel = (source: string) => {
  return parsePgml(source)
}

describe('PGML diagram compare entries', () => {
  it('builds compare entries that can drive diagram selection and delta inspection', () => {
    const baseModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
  email text
  Constraint chk_users_email: email <> ''
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id

Function public.legacy_cleanup() returns void {
  source: $sql$
    select 1;
  $sql$
}

Properties "public.users" {
  x: 20
  y: 32
}`)
    const targetModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
  email varchar [not null]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Table public.audit_log {
  id uuid [pk]
}

Properties "public.users" {
  x: 20
  y: 32
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const modifiedColumn = entries.find(entry => entry.id === 'column:public.users::email') || null
    const addedTable = entries.find(entry => entry.id === 'table:public.audit_log') || null
    const removedFunction = entries.find(entry => entry.id === 'function:legacy_cleanup') || null
    const removedConstraint = entries.find(entry => entry.id === 'constraint:public.users::chk_users_email') || null
    const removedReference = entries.find(entry => entry.id === 'reference:>::public.orders::user_id::public.users::id') || null

    expect(modifiedColumn).toMatchObject({
      changeKind: 'modified',
      description: 'Changed column public.users.email: modifiers none -> [not null]; type text -> varchar.',
      entityKind: 'column',
      label: 'public.users.email',
      rowKey: 'public.users.email',
      scopeId: 'table:public.users',
      scopeKind: 'table',
      scopeLabel: 'public.users',
      targetNodeIds: ['public.users']
    })
    expect(modifiedColumn?.beforeSnapshot).toContain('"type": "text"')
    expect(modifiedColumn?.afterSnapshot).toContain('"type": "varchar"')
    expect(modifiedColumn?.fields.some(field => field.label === 'modifiers')).toBe(true)
    expect(modifiedColumn?.fields.some(field => field.id === 'modifiers' && field.label === 'modifiers')).toBe(true)
    expect(modifiedColumn?.selectionCandidates).toContainEqual({
      columnName: 'email',
      kind: 'column',
      tableId: 'public.users'
    })

    expect(addedTable).toMatchObject({
      changeKind: 'added',
      entityKind: 'table',
      scopeId: 'table:public.audit_log',
      scopeKind: 'table',
      targetNodeIds: ['public.audit_log']
    })
    expect(addedTable?.selectionCandidates).toContainEqual({
      kind: 'table',
      tableId: 'public.audit_log'
    })

    expect(removedFunction).toMatchObject({
      baseNodeIds: ['function:public.legacy_cleanup'],
      changeKind: 'removed',
      entityKind: 'function',
      scopeKind: 'standalone',
      targetNodeIds: []
    })
    expect(removedFunction?.beforeSnapshot).toContain('legacy_cleanup')
    expect(removedFunction?.afterSnapshot).toBeNull()

    expect(removedConstraint).toMatchObject({
      changeKind: 'removed',
      entityKind: 'constraint',
      targetNodeIds: ['public.users']
    })

    expect(removedReference).toMatchObject({
      changeKind: 'removed',
      entityKind: 'reference',
      rowKey: null,
      targetNodeIds: ['public.orders', 'public.users']
    })
  })

  it('omits compare entries when a column default only differs by quoted regclass syntax or modifier order', () => {
    const baseModel = parseSnapshotModel(`Table public.agency_cost_category_line_item {
  id bigint [pk, not null, default: nextval('public.agency_cost_category_line_item_id_seq')]
}`)
    const targetModel = parseSnapshotModel(`Table public.agency_cost_category_line_item {
  id bigint [not null, default: nextval('public.\\"agency_cost_category_line_item_id_seq\\"'::regclass), pk]
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )

    expect(entries.some(entry => entry.id === 'column:public.agency_cost_category_line_item::id')).toBe(false)
  })

  it('filters excluded compare entities by their stable compare entry ids', () => {
    const baseModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
}`)
    const targetModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
  email text
}

Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const filteredEntries = filterPgmlDiagramCompareEntriesForExclusions(entries, {
      entityIds: ['function:refresh_users']
    })

    expect(filteredEntries.some(entry => entry.id === 'function:refresh_users')).toBe(false)
    expect(filteredEntries.some(entry => entry.id === 'column:public.users::email')).toBe(true)
  })

  it('classifies default-only column diffs as optional compare noise', () => {
    const baseModel = parseSnapshotModel(`Table public.orders {
  id uuid [pk]
  status text [default: 'draft']
}`)
    const targetModel = parseSnapshotModel(`Table public.orders {
  id uuid [pk]
  status text [default: 'submitted']
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const defaultEntry = entries.find(entry => entry.id === 'column:public.orders::status') || null

    expect(defaultEntry?.noiseKinds).toEqual(['defaults'])
    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'column:public.orders::status')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideDefaults: false
    }).some(entry => entry.id === 'column:public.orders::status')).toBe(true)
  })

  it('classifies metadata-only routine diffs as optional compare noise', () => {
    const baseModel = parseSnapshotModel(`Function public.refresh_orders() returns void {
  cost: 100
  source: $sql$
    select 1;
  $sql$
}`)
    const targetModel = parseSnapshotModel(`Function public.refresh_orders() returns void {
  cost: 200
  source: $sql$
    select 1;
  $sql$
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const metadataEntry = entries.find(entry => entry.id === 'function:refresh_orders') || null

    expect(metadataEntry?.noiseKinds).toEqual(['metadata'])
    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'function:refresh_orders')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideMetadata: false
    }).some(entry => entry.id === 'function:refresh_orders')).toBe(true)
  })

  it('renders executable affects graphs with stable ordering in compare snapshots', () => {
    const baseModel = parseSnapshotModel(`Function public.register_entity() returns trigger {
  affects {
    writes: [public.common_entity]
    sets: [public.transfer_payment_stream.id, public.common_review.id, public.funding_opportunity_profile.id, public.applicant_recipient_profile.id, public.funding_case_agreement_profile.id, public.funding_case_intake_profile.id]
    depends_on: [public.common_entity, public.transfer_payment_stream, public.common_review, public.funding_opportunity_profile, public.applicant_recipient_profile, public.funding_case_agreement_profile, public.funding_case_intake_profile, public.entity_type]
    owned_by: [public.transfer_payment_stream, public.common_review, public.funding_opportunity_profile, public.applicant_recipient_profile, public.funding_case_agreement_profile, public.funding_case_intake_profile]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION register_entity() RETURNS trigger AS $$
    BEGIN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    const targetModel = parseSnapshotModel(`Function public.register_entity() returns trigger {
  affects {
    writes: [public.common_entity]
    sets: [public.common_review.id, public.transfer_payment_stream.id, public.applicant_recipient_profile.id]
    depends_on: [public.common_entity, public.applicant_recipient_profile, public.common_review, public.transfer_payment_stream, public.entity_type]
    owned_by: [public.applicant_recipient_profile, public.common_review, public.transfer_payment_stream]
  }

  source: $sql$
    CREATE FUNCTION public.register_entity() RETURNS trigger AS $$
    BEGIN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const routineEntry = entries.find(entry => entry.id === 'function:register_entity') || null

    expect(routineEntry?.changedFields).toEqual(['affects'])
    expect(routineEntry?.beforeSnapshot).toContain('"dependsOn": [\n      "public.applicant_recipient_profile",')
    expect(routineEntry?.beforeSnapshot).toContain('"public.common_review"')
    expect(routineEntry?.beforeSnapshot).toContain('"public.transfer_payment_stream"')
    expect(routineEntry?.beforeSnapshot).toContain('"public.funding_opportunity_profile"')
    expect(routineEntry?.afterSnapshot).toContain('"dependsOn": [\n      "public.applicant_recipient_profile",')
    expect(routineEntry?.afterSnapshot).toContain('"public.common_review"')
    expect(routineEntry?.afterSnapshot).toContain('"public.transfer_payment_stream"')
    expect(routineEntry?.afterSnapshot).not.toContain('"public.funding_opportunity_profile"')
    expect(routineEntry?.fields).toContainEqual({
      after: expect.stringContaining('"ownedBy"'),
      before: expect.stringContaining('"ownedBy"'),
      id: 'affects',
      label: 'affects'
    })
  })

  it('classifies executable rename-only diffs as optional compare noise', () => {
    const baseModel = parseSnapshotModel(`Function public.refresh_orders() returns void {
  source: $sql$
    select 1;
  $sql$
}`)
    const targetModel = parseSnapshotModel(`Function public.refresh_orders_v2() returns void {
  source: $sql$
    select 1;
  $sql$
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const executableRenameEntry = entries.find(entry => entry.id === 'function:refresh_orders_v2') || null

    expect(executableRenameEntry?.changeKind).toBe('modified')
    expect(executableRenameEntry?.changedFields).toEqual(expect.arrayContaining(['name', 'signature']))
    expect(executableRenameEntry?.noiseKinds).toEqual(['executable-name'])
    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'function:refresh_orders_v2')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideExecutableNameOnly: false
    }).some(entry => entry.id === 'function:refresh_orders_v2')).toBe(true)
  })

  it('classifies index and constraint rename-only diffs as optional compare noise', () => {
    const baseModel = parseSnapshotModel(`Table public.orders {
  id uuid [pk]
  user_id uuid
  Index cn_idx_orders_user_id (user_id)
  Constraint cn_chk_orders_user_id: user_id is not null
}`)
    const targetModel = parseSnapshotModel(`Table public.orders {
  id uuid [pk]
  user_id uuid
  Index cn_idx_orders_customer_id (user_id)
  Constraint cn_chk_orders_customer_id: user_id is not null
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const indexRenameEntry = entries.find(entry => entry.id === 'index:public.orders::cn_idx_orders_customer_id') || null
    const constraintRenameEntry = entries.find(entry => entry.id === 'constraint:public.orders::cn_chk_orders_customer_id') || null

    expect(indexRenameEntry?.changeKind).toBe('modified')
    expect(indexRenameEntry?.changedFields).toEqual(['name'])
    expect(indexRenameEntry?.noiseKinds).toEqual(['structural-name'])

    expect(constraintRenameEntry?.changeKind).toBe('modified')
    expect(constraintRenameEntry?.changedFields).toEqual(['name'])
    expect(constraintRenameEntry?.noiseKinds).toEqual(['structural-name'])

    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'index:public.orders::cn_idx_orders_customer_id')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'constraint:public.orders::cn_chk_orders_customer_id')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideStructuralNameOnly: false
    }).some(entry => entry.id === 'index:public.orders::cn_idx_orders_customer_id')).toBe(true)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideStructuralNameOnly: false
    }).some(entry => entry.id === 'constraint:public.orders::cn_chk_orders_customer_id')).toBe(true)
  })

  it('filters order-only compare entries independently of other noise kinds', () => {
    const orderOnlyEntry = {
      afterSnapshot: null,
      baseNodeIds: [],
      beforeSnapshot: null,
      changeKind: 'modified' as const,
      changedFields: ['tableNames'],
      description: 'Changed group Core.',
      entityKind: 'group' as const,
      fields: [],
      id: 'group:Core',
      label: 'Core',
      noiseKinds: ['order'] as const,
      rowKey: null,
      scopeId: 'group:Core',
      scopeKind: 'group' as const,
      scopeLabel: 'Core',
      selectionCandidates: [],
      sourceRange: null,
      targetNodeIds: []
    }

    expect(filterPgmlDiagramCompareEntriesForNoise([orderOnlyEntry]).length).toBe(0)
    expect(filterPgmlDiagramCompareEntriesForNoise([orderOnlyEntry], {
      hideOrderOnly: false
    })).toEqual([orderOnlyEntry])
  })

  it('classifies enum member reordering as order-only compare noise', () => {
    const baseModel = parseSnapshotModel(`Enum public.entity_type {
  fundingopportunity
  transferpaymentstream
  fundingcaseintake
  fundingcaseagreement
  applicantrecipient
  commonreview
}`)
    const targetModel = parseSnapshotModel(`Enum public.entity_type {
  fundingopportunity
  fundingcaseintake
  fundingcaseagreement
  applicantrecipient
  transferpaymentstream
  commonreview
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const enumEntry = entries.find(entry => entry.id === 'custom-type:Enum::public.entity_type') || null

    expect(enumEntry?.changeKind).toBe('modified')
    expect(enumEntry?.changedFields).toEqual(expect.arrayContaining(['values']))
    expect(enumEntry?.noiseKinds).toEqual(['order'])
    expect(filterPgmlDiagramCompareEntriesForNoise(entries).some(entry => entry.id === 'custom-type:Enum::public.entity_type')).toBe(false)
    expect(filterPgmlDiagramCompareEntriesForNoise(entries, {
      hideOrderOnly: false
    }).some(entry => entry.id === 'custom-type:Enum::public.entity_type')).toBe(true)
  })

  it('describes modified references with the changed reference fields', () => {
    const baseModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}`)
    const targetModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [ref: > public.users.id, delete: cascade]
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const modifiedReference = entries.find(entry => entry.id === 'reference:>::public.orders::user_id::public.users::id') || null

    expect(modifiedReference).toMatchObject({
      changeKind: 'modified',
      description: 'Changed reference public.orders.user_id -> public.users.id: delete action none -> cascade.',
      entityKind: 'reference',
      label: 'public.orders.user_id -> public.users.id',
      rowKey: 'public.orders.user_id'
    })
    expect(modifiedReference?.fields).toContainEqual({
      after: 'cascade',
      before: null,
      id: 'onDelete',
      label: 'delete action'
    })
  })

  it('surfaces inline reference additions as references without a duplicate modified column entry', () => {
    const baseModel = parseSnapshotModel(`Table public.agencies {
  id uuid [pk]
}

Table public.accounts {
  id uuid [pk]
  agency_id uuid
}`)
    const targetModel = parseSnapshotModel(`Table public.agencies {
  id uuid [pk]
}

Table public.accounts {
  id uuid [pk]
  agency_id uuid [ref: > public.agencies.id]
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const modifiedColumn = entries.find(entry => entry.id === 'column:public.accounts::agency_id')
    const addedReference = entries.find(entry => entry.id === 'reference:>::public.accounts::agency_id::public.agencies::id') || null

    expect(modifiedColumn).toBeUndefined()
    expect(addedReference).toMatchObject({
      changeKind: 'added',
      description: 'Added reference public.accounts.agency_id -> public.agencies.id.',
      entityKind: 'reference',
      label: 'public.accounts.agency_id -> public.agencies.id',
      rowKey: 'public.accounts.agency_id'
    })
    expect(addedReference?.afterSnapshot).toContain('"toTable": "public.agencies"')
    expect(addedReference?.beforeSnapshot).toBeNull()
    expect(addedReference?.selectionCandidates).toContainEqual({
      columnName: 'agency_id',
      kind: 'column',
      tableId: 'public.accounts'
    })
  })

  it('treats materially equivalent inline and top-level refs as compare-noise-free no-ops', () => {
    const baseModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid
}

Ref orders_user_ref: public.orders.user_id > public.users.id [delete: restrict, update: no action]`)
    const targetModel = parseSnapshotModel(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [ref: > public.users.id, delete: restrict, update: no action]
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )

    expect(entries).toEqual([])
  })

  it('builds layout compare entries with diagram-target selections', () => {
    const baseModel = parseSnapshotModel(`TableGroup Analytics {
  public.users
}

Table public.users {
  id uuid [pk]
}

Properties "group:Analytics" {
  x: 24
  y: 40
}

Properties "public.users" {
  x: 52
  y: 108
}`)
    const targetModel = parseSnapshotModel(`TableGroup Analytics {
  public.users
}

Table public.users {
  id uuid [pk]
}

Properties "group:Analytics" {
  x: 140
  y: 72
}

Properties "public.users" {
  x: 220
  y: 148
}`)
    const entries = buildPgmlDiagramCompareEntries(
      diffPgmlSchemaModels(baseModel, targetModel),
      baseModel,
      targetModel
    )
    const groupLayoutEntry = entries.find(entry => entry.id === 'layout:group:Analytics') || null
    const tableLayoutEntry = entries.find(entry => entry.id === 'layout:public.users') || null

    expect(groupLayoutEntry).toMatchObject({
      changeKind: 'modified',
      entityKind: 'layout',
      selectionCandidates: [{
        id: 'group:Analytics',
        kind: 'group'
      }],
      targetNodeIds: ['group:Analytics']
    })
    expect(tableLayoutEntry).toMatchObject({
      changeKind: 'modified',
      entityKind: 'layout',
      selectionCandidates: [{
        kind: 'table',
        tableId: 'public.users'
      }],
      targetNodeIds: ['public.users']
    })
  })

  it('exposes compare labels and colors for UI badges', () => {
    expect(getPgmlDiagramCompareEntityKindLabel('custom-type')).toBe('Type')
    expect(getPgmlDiagramCompareChangeVerb('modified')).toBe('Changed')
    expect(getPgmlDiagramCompareChangeColor('removed')).toBe('#f43f5e')
  })
})
