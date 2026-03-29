import { describe, expect, it } from 'vitest'

import {
  buildPgmlDiagramCompareEntries,
  getPgmlDiagramCompareChangeColor,
  getPgmlDiagramCompareChangeVerb,
  getPgmlDiagramCompareEntityKindLabel
} from '../../app/utils/pgml-diagram-compare'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { parsePgml } from '../../app/utils/pgml'

describe('PGML diagram compare entries', () => {
  it('builds compare entries that can drive diagram selection and delta inspection', () => {
    const baseModel = parsePgml(`Table public.users {
  id uuid [pk]
  email text
}

Function public.legacy_cleanup() returns void {
  source: $sql$
    select 1;
  $sql$
}

Properties "public.users" {
  x: 20
  y: 32
}`)
    const targetModel = parsePgml(`Table public.users {
  id uuid [pk]
  email varchar [not null]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [not null]
}

Ref: public.orders.user_id > public.users.id

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
    const addedTable = entries.find(entry => entry.id === 'table:public.orders') || null
    const removedFunction = entries.find(entry => entry.id === 'function:public.legacy_cleanup') || null
    const addedReference = entries.find(entry => entry.id === 'reference:>::public.orders::user_id::public.users::id') || null

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
      targetNodeIds: ['public.orders']
    })
    expect(addedTable?.selectionCandidates).toContainEqual({
      kind: 'table',
      tableId: 'public.orders'
    })

    expect(removedFunction).toMatchObject({
      baseNodeIds: ['function:public.legacy_cleanup'],
      changeKind: 'removed',
      entityKind: 'function',
      targetNodeIds: []
    })
    expect(removedFunction?.beforeSnapshot).toContain('legacy_cleanup')
    expect(removedFunction?.afterSnapshot).toBeNull()

    expect(addedReference).toMatchObject({
      changeKind: 'added',
      entityKind: 'reference',
      rowKey: 'public.orders.user_id',
      targetNodeIds: ['public.orders', 'public.users']
    })
  })

  it('builds layout compare entries with diagram-target selections', () => {
    const baseModel = parsePgml(`TableGroup Analytics {
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
    const targetModel = parsePgml(`TableGroup Analytics {
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
