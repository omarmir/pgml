import { describe, expect, it } from 'vitest'
import { isDiagramReferenceSelected } from '../../app/utils/diagram-reference-selection'
import type { PgmlReference } from '../../app/utils/pgml'

const reference: PgmlReference = {
  fromTable: 'public.orders',
  fromColumn: 'account_id',
  toTable: 'public.accounts',
  toColumn: 'id',
  relation: '>',
  onDelete: null,
  onUpdate: null
}

describe('relationship selection', () => {
  it('selects outgoing table references', () => {
    expect(isDiagramReferenceSelected(reference, { kind: 'table', tableId: 'public.orders' })).toBe(true)
    expect(isDiagramReferenceSelected(reference, { kind: 'table', tableId: 'public.accounts' })).toBe(false)
  })

  it('selects the exact referencing column', () => {
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.orders', columnName: 'account_id' })).toBe(true)
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.orders', columnName: 'id' })).toBe(false)
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.orders', columnName: 'description' })).toBe(false)
  })

  it('selects incoming references on the exact referenced column', () => {
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.accounts', columnName: 'id' })).toBe(true)
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.accounts', columnName: 'name' })).toBe(false)
    expect(isDiagramReferenceSelected(reference, { kind: 'column', tableId: 'public.users', columnName: 'id' })).toBe(false)
  })

  it('matches every participating column in a composite relationship', () => {
    const composite: PgmlReference = {
      ...reference,
      fromColumns: ['account_id', 'tenant_id'],
      toColumns: ['id', 'tenant_id']
    }

    expect(isDiagramReferenceSelected(composite, { kind: 'column', tableId: 'public.orders', columnName: 'tenant_id' })).toBe(true)
    expect(isDiagramReferenceSelected(composite, { kind: 'column', tableId: 'public.accounts', columnName: 'tenant_id' })).toBe(true)
  })

  it('matches both ends of a self reference', () => {
    const selfReference: PgmlReference = { ...reference, toTable: reference.fromTable }

    expect(isDiagramReferenceSelected(selfReference, { kind: 'column', tableId: 'public.orders', columnName: 'account_id' })).toBe(true)
    expect(isDiagramReferenceSelected(selfReference, { kind: 'column', tableId: 'public.orders', columnName: 'id' })).toBe(true)
    expect(isDiagramReferenceSelected(selfReference, { kind: 'column', tableId: 'public.orders', columnName: 'description' })).toBe(false)
  })

  it('preserves attachment context and ignores unrelated selections', () => {
    expect(isDiagramReferenceSelected(reference, { kind: 'attachment', tableId: 'public.orders', attachmentId: 'index' })).toBe(true)
    expect(isDiagramReferenceSelected(reference, { kind: 'group', id: 'group:Core' })).toBe(false)
    expect(isDiagramReferenceSelected(reference, { kind: 'object', id: 'function:find_orders' })).toBe(false)
    expect(isDiagramReferenceSelected(reference, null)).toBe(false)
  })
})
