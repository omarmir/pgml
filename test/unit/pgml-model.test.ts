import { describe, expect, it } from 'vitest'

import { parsePgml, pgmlExample } from '../../app/utils/pgml'

describe('PGML model parsing', () => {
  it('parses the bundled example into grouped tables, refs, and custom types', () => {
    const model = parsePgml(pgmlExample)

    expect(model.groups.map(group => group.name)).toEqual(['Core', 'Commerce', 'Programs'])
    expect(model.tables).toHaveLength(8)
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
      })
    ]))
    expect(model.customTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'Enum', name: 'role_kind' }),
      expect.objectContaining({ kind: 'Enum', name: 'entity_type' }),
      expect.objectContaining({ kind: 'Domain', name: 'email_address' })
    ]))
    expect(model.tables.find(table => table.fullName === 'public.orders')?.groupName).toBe('Commerce')
    expect(model.schemas).toEqual(['public'])
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

    expect(archiveOrders?.signature).toBe('archive_orders(retention_days integer)')
    expect(archiveOrders?.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'language', value: 'plpgsql' })
    ]))
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
})
