import { describe, expect, it } from 'vitest'

import {
  buildPgmlDiagramCompareEntries,
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
    const removedFunction = entries.find(entry => entry.id === 'function:public.legacy_cleanup') || null
    const removedConstraint = entries.find(entry => entry.id === 'constraint:public.users::chk_users_email') || null
    const removedReference = entries.find(entry => entry.id === 'reference:>::public.orders::user_id::public.users::id') || null

    expect(modifiedColumn).toMatchObject({
      changeKind: 'modified',
      entityKind: 'column',
      label: 'public.users.email',
      rowKey: 'public.users.email',
      targetNodeIds: ['public.users']
    })
    expect(modifiedColumn?.beforeSnapshot).toContain('"type": "text"')
    expect(modifiedColumn?.afterSnapshot).toContain('"type": "varchar"')
    expect(modifiedColumn?.fields.some(field => field.label === 'modifiers')).toBe(true)
    expect(modifiedColumn?.selectionCandidates).toContainEqual({
      columnName: 'email',
      kind: 'column',
      tableId: 'public.users'
    })

    expect(addedTable).toMatchObject({
      changeKind: 'added',
      entityKind: 'table',
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
