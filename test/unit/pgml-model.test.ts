import { describe, expect, it } from 'vitest'

import {
  dedentPgmlSourceForEditor,
  getOrderedGroupTables,
  getPgmlSourceScrollTop,
  getPgmlSourceSelectionRange,
  parsePgml,
  pgmlExample,
  pgmlVersionedExample,
  reindentPgmlEditorText,
  replacePgmlConstraintExpressionInBlock,
  replacePgmlExecutableSourceInBlock,
  replacePgmlSourceRange
} from '../../app/utils/pgml'
import { parsePgmlDocument } from '../../app/utils/pgml-document'

describe('PGML model parsing', () => {
  it('parses the bundled example into grouped tables, refs, and custom types', () => {
    const model = parsePgml(pgmlExample)
    const orderCustomerReferences = model.references.filter(reference =>
      reference.fromTable === 'public.orders'
      && reference.fromColumn === 'customer_id'
      && reference.toTable === 'public.users'
      && reference.toColumn === 'id'
    )

    expect(model.groups.map(group => group.name)).toEqual(['Core', 'Commerce', 'Programs', 'Analytics'])
    expect(model.tables).toHaveLength(10)
    expect(model.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromTable: 'public.users',
        fromColumn: 'tenant_id',
        toTable: 'public.tenants',
        toColumn: 'id'
      }),
      expect.objectContaining({
        fromTable: 'public.orders',
        fromColumn: 'customer_id',
        toTable: 'public.users',
        toColumn: 'id'
      }),
      expect.objectContaining({
        fromTable: 'analytics.order_rollups',
        fromColumn: 'order_id',
        toTable: 'public.orders',
        toColumn: 'id'
      })
    ]))
    expect(orderCustomerReferences).toHaveLength(1)
    expect(model.customTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'Enum', name: 'role_kind' }),
      expect.objectContaining({ kind: 'Enum', name: 'order_status' }),
      expect.objectContaining({ kind: 'Enum', name: 'entity_type' }),
      expect.objectContaining({ kind: 'Domain', name: 'email_address' }),
      expect.objectContaining({ kind: 'Composite', name: 'address_record' })
    ]))
    expect(model.tables.find(table => table.fullName === 'public.orders')?.groupName).toBe('Commerce')
    expect(model.tables.find(table => table.fullName === 'analytics.order_rollups')?.groupName).toBe('Analytics')
    expect(model.schemas).toEqual(expect.arrayContaining(['public', 'audit', 'analytics']))
    expect(model.schemas).toHaveLength(3)
  })

  it('ships the bundled studio example as a multi-version document with branch history', () => {
    const document = parsePgmlDocument(pgmlVersionedExample)

    expect(document.workspace.basedOnVersionId).toBe('v_programs')
    expect(document.versions.map(version => version.id)).toEqual([
      'v_foundation',
      'v_commerce',
      'v_programs',
      'v_analytics'
    ])
    expect(document.versions.map(version => version.role)).toEqual([
      'implementation',
      'design',
      'implementation',
      'design'
    ])
    expect(document.workspace.snapshot.source).toContain('TableGroup Analytics')
    expect(document.workspace.snapshot.source).toContain('Composite address_record')
    expect(document.workspace.snapshot.source).toContain('Procedure archive_orders(retention_days integer) [replace]')
    expect(document.workspace.snapshot.source).toContain('Properties "group:Analytics"')
  })

  it('derives sequence ownership and routine metadata from source blocks', () => {
    const model = parsePgml(pgmlExample)
    const orderNumberSequence = model.sequences.find(sequence => sequence.name === 'order_number_seq')
    const registerEntity = model.functions.find(routine => routine.name === 'register_entity')
    const archiveOrders = model.procedures.find(routine => routine.name === 'archive_orders')

    expect(orderNumberSequence?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'as', value: 'bigint' }),
      expect.objectContaining({ key: 'start', value: '1200' }),
      expect.objectContaining({ key: 'owned_by', value: 'public.orders.order_number' })
    ]))
    expect(orderNumberSequence?.docs?.summary).toContain('Allocates friendly order numbers')

    expect(registerEntity?.signature).toBe('register_entity(entity_kind text) returns trigger [replace]')
    expect(registerEntity?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'language', value: 'plpgsql' })
    ]))
    expect(registerEntity?.affects?.sets).toEqual(['public.funding_opportunity_profile.id'])

    expect(archiveOrders?.signature).toBe('archive_orders(retention_days integer) [replace]')
    expect(archiveOrders?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'language', value: 'plpgsql' })
    ]))
    expect(archiveOrders?.docs?.summary).toContain('Moves stale orders')
    expect(archiveOrders?.affects?.writes).toEqual(['public.orders_archive', 'public.order_item_archive'])
    expect(archiveOrders?.details).toEqual(expect.arrayContaining([
      expect.stringContaining('source:\nCREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)\nLANGUAGE plpgsql')
    ]))
  })

  it('dedents executable source in detail previews while keeping nested SQL indentation', () => {
    const model = parsePgml(`Procedure public.archive_orders(retention_days integer) {
  source: $sql$
        CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
        LANGUAGE plpgsql
        AS $$
        BEGIN
          INSERT INTO public.orders_archive
          SELECT * FROM public.orders;
        END;
        $$;
  $sql$
}`)
    const procedure = model.procedures.find(entry => entry.name.endsWith('archive_orders')) || null
    const sourceDetail = procedure?.details.find(detail => detail.startsWith('source:\n')) || null

    expect(sourceDetail?.trimEnd()).toBe(`source:
CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.orders_archive
  SELECT * FROM public.orders;
END;
$$;`)
  })

  it('derives trigger execution metadata and called routines from trigger source', () => {
    const model = parsePgml(pgmlExample)
    const syncTrigger = model.triggers.find(trigger => trigger.name === 'trg_order_items_total_sync')
    const registerTrigger = model.triggers.find(trigger => trigger.name === 'trg_register_fundingopportunity')

    expect(syncTrigger?.tableName).toBe('public.order_items')
    expect(syncTrigger?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'timing', value: 'after' }),
      expect.objectContaining({ key: 'events', value: '[insert, update, delete]' }),
      expect.objectContaining({ key: 'level', value: 'row' }),
      expect.objectContaining({ key: 'function', value: 'sync_order_total' })
    ]))

    expect(registerTrigger?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'timing', value: 'before' }),
      expect.objectContaining({ key: 'function', value: 'register_entity' }),
      expect.objectContaining({ key: 'arguments', value: '[\'fundingopportunity\']' })
    ]))
    expect(registerTrigger?.docs?.summary).toContain('Registers a Common_Entity id')
  })

  it('parses reference delete and update actions from inline modifiers', () => {
    const source = `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  customer_id uuid [ref: > public.users.id, delete: restrict, update: cascade]
}`
    const model = parsePgml(source)

    expect(model.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromColumn: 'customer_id',
        fromTable: 'public.orders',
        onDelete: 'restrict',
        onUpdate: 'cascade',
        toColumn: 'id',
        toTable: 'public.users'
      })
    ]))
  })

  it('tracks source ranges for navigable schema objects', () => {
    const source = `TableGroup Core {
  orders
}

Table orders in Core {
  id integer [pk]
  total_cents integer
  Constraint chk_orders_total: total_cents >= 0
  Index idx_orders_total (total_cents)
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}

Enum order_state {
  draft
  submitted
}`
    const model = parsePgml(source)
    const table = model.tables.find(entry => entry.fullName === 'public.orders')
    const constraint = table?.constraints.find(entry => entry.name === 'chk_orders_total')
    const index = table?.indexes.find(entry => entry.name === 'idx_orders_total')
    const routine = model.functions.find(entry => entry.name === 'orphan_report')
    const customType = model.customTypes.find(entry => entry.name === 'order_state')

    expect(table?.sourceRange).toEqual({ startLine: 5, endLine: 10 })
    expect(constraint?.sourceRange).toEqual({ startLine: 8, endLine: 8 })
    expect(index?.sourceRange).toEqual({ startLine: 9, endLine: 9 })
    expect(routine?.sourceRange).toEqual({ startLine: 12, endLine: 17 })
    expect(customType?.sourceRange).toEqual({ startLine: 19, endLine: 22 })
  })

  it('resolves grouped tables in TableGroup source order before falling back to table declaration order', () => {
    const source = `TableGroup Core {
  public.roles
  public.users
}

Table public.users in Core {
  id uuid [pk]
}

Table public.tenants in Core {
  id uuid [pk]
}

Table public.roles in Core {
  id uuid [pk]
}`
    const model = parsePgml(source)

    expect(getOrderedGroupTables(model, 'Core').map(table => table.fullName)).toEqual([
      'public.roles',
      'public.users',
      'public.tenants'
    ])
  })

  it('builds editor selection offsets from source ranges', () => {
    const source = `// filler
// filler

Table orders {
  id integer [pk]
  total_cents integer
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`
    const selectionRange = getPgmlSourceSelectionRange(source.replaceAll('\n', '\r\n'), {
      startLine: 9,
      endLine: 14
    })

    expect(selectionRange).not.toBeNull()
    expect(source.slice(selectionRange?.start || 0, selectionRange?.end || 0)).toBe(`Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`)
  })

  it('replaces the selected source block while preserving surrounding workspace text', () => {
    const source = `Table public.orders {
  id integer [pk]
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}

Table public.audit_log {
  id integer [pk]
}`

    const nextSource = replacePgmlSourceRange(source, {
      startLine: 5,
      endLine: 10
    }, `Function orphan_report() {
  language: sql
  source: $sql$
    select 2;
  $sql$
}`)

    expect(nextSource).toBe(`Table public.orders {
  id integer [pk]
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 2;
  $sql$
}

Table public.audit_log {
  id integer [pk]
}`)
  })

  it('dedents and reapplies table-body PGML snippets for popup editing', () => {
    const originalSnippet = `  Constraint chk_orders_total: total_cents >= 0`

    expect(dedentPgmlSourceForEditor(originalSnippet)).toBe('Constraint chk_orders_total: total_cents >= 0')
    expect(reindentPgmlEditorText('Constraint chk_orders_total: total_cents > 0', originalSnippet)).toBe(
      '  Constraint chk_orders_total: total_cents > 0'
    )
  })

  it('replaces executable source bodies without exposing the PGML wrapper to the popup editor', () => {
    const nextBlock = replacePgmlExecutableSourceInBlock(`Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}`, `select
  2;`)

    expect(nextBlock).toBe(`Function orphan_report() {
  language: sql
  source: $sql$
    select
      2;
  $sql$
}`)
  })

  it('replaces constraint expressions directly for popup SQL editing', () => {
    const nextBlock = replacePgmlConstraintExpressionInBlock(
      '  Constraint chk_orders_total: total_cents >= 0',
      'total_cents > 0'
    )

    expect(nextBlock).toBe('  Constraint chk_orders_total: total_cents > 0')
  })

  it('computes editor scroll offsets from the source block start', () => {
    expect(getPgmlSourceScrollTop({ startLine: 95, endLine: 103 }, 24, 1)).toBe(2232)
    expect(getPgmlSourceScrollTop({ startLine: 1, endLine: 3 }, 24, 1)).toBe(0)
  })
})
