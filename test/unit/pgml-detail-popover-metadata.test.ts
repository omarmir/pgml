import { describe, expect, it } from 'vitest'

import {
  parsePgml,
  replacePgmlConstraintDefinitionInBlock,
  replacePgmlExecutableMetadataInBlock,
  replacePgmlIndexDefinitionInBlock
} from '../../app/utils/pgml'
import {
  createPgmlDetailMetadataDraftFromIndex,
  createPgmlDetailMetadataDraftFromRoutine,
  createPgmlDetailMetadataDraftFromSequence,
  createPgmlDetailMetadataDraftFromTrigger
} from '../../app/utils/pgml-detail-popover-metadata'

describe('detail popover metadata editing', () => {
  it('builds structured drafts from executable metadata', () => {
    const model = parsePgml(`Table public.orders {
  id uuid [pk]
  total_cents integer
}

Function recalc_order_total(order_uuid uuid) returns void [replace] {
  docs {
    summary: Recompute order totals.
    purpose: Keep the order total in sync.
  }

  affects {
    reads: [public.order_items.quantity, public.order_items.unit_price_cents]
    writes: [public.orders.total_cents]
  }

  language: plpgsql
  volatility: stable
  source: $sql$
    CREATE OR REPLACE FUNCTION public.recalc_order_total(order_uuid uuid)
    RETURNS void AS $$
    BEGIN
      PERFORM 1;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_orders_sync on public.orders {
  timing: after
  events: [insert, update]
  level: row
  function: recalc_order_total
  arguments: [new.id]
}

Sequence public.order_number_seq {
  start: 1000
  increment: 1
  cycle: false
  owned_by: public.orders.id
}`)
    const routine = model.functions[0]
    const trigger = model.triggers[0]
    const sequence = model.sequences[0]
    const indexDraft = createPgmlDetailMetadataDraftFromIndex({
      columns: ['search'],
      name: 'idx_products_search',
      tableName: 'public.products',
      type: 'gin'
    })
    const routineDraft = createPgmlDetailMetadataDraftFromRoutine('function', routine)
    const triggerDraft = createPgmlDetailMetadataDraftFromTrigger(trigger)
    const sequenceDraft = createPgmlDetailMetadataDraftFromSequence(sequence)

    expect(routineDraft.docsSummary).toBe('Recompute order totals.')
    expect(routineDraft.known.language).toBe('plpgsql')
    expect(routineDraft.known.volatility).toBe('stable')
    expect(routineDraft.affects.reads.map(entry => entry.value)).toEqual([
      'public.order_items.quantity',
      'public.order_items.unit_price_cents'
    ])

    expect(triggerDraft.known.triggerTiming).toBe('after')
    expect(triggerDraft.known.triggerEvents.map(entry => entry.value)).toEqual(['insert', 'update'])
    expect(triggerDraft.known.triggerFunction).toBe('recalc_order_total')

    expect(sequenceDraft.known.sequenceStart).toBe('1000')
    expect(sequenceDraft.known.sequenceCycle).toBe('false')
    expect(sequenceDraft.known.sequenceOwnedBy).toBe('public.orders.id')

    expect(indexDraft.known.indexType).toBe('gin')
    expect(indexDraft.known.indexColumns.map(entry => entry.value)).toEqual(['search'])
  })

  it('rewrites executable metadata blocks while preserving embedded SQL', () => {
    const nextBlock = replacePgmlExecutableMetadataInBlock(`Function demo() returns void {
  language: sql
  source: $sql$
    CREATE OR REPLACE FUNCTION public.demo()
    RETURNS void AS $$
    BEGIN
      PERFORM 1;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`, {
      affects: {
        calls: ['public.audit_log'],
        dependsOn: ['public.orders'],
        extras: [{ key: 'locks', values: ['public.orders'] }],
        ownedBy: [],
        reads: ['public.order_items'],
        sets: [],
        uses: [],
        writes: ['public.orders.total_cents']
      },
      docsEntries: [{ key: 'purpose', value: 'Keeps order totals correct.' }],
      docsSummary: 'Recompute totals.',
      metadata: [
        { key: 'language', value: 'plpgsql' },
        { key: 'volatility', value: 'stable' }
      ]
    })

    expect(nextBlock).toContain('docs {')
    expect(nextBlock).toContain('summary: Recompute totals.')
    expect(nextBlock).toContain('purpose: Keeps order totals correct.')
    expect(nextBlock).toContain('affects {')
    expect(nextBlock).toContain('reads: [public.order_items]')
    expect(nextBlock).toContain('locks: [public.orders]')
    expect(nextBlock).toContain('language: plpgsql')
    expect(nextBlock).toContain('volatility: stable')
    expect(nextBlock).toContain('source: $sql$')
    expect(nextBlock).toContain('CREATE OR REPLACE FUNCTION public.demo()')
  })

  it('rewrites inline index and constraint snippets from structured popup fields', () => {
    expect(replacePgmlIndexDefinitionInBlock(
      '  Index idx_products_search (search) [type: gin]',
      {
        columns: ['search', 'tenant_id'],
        name: 'idx_products_search',
        type: 'brin'
      }
    )).toBe('  Index idx_products_search (search, tenant_id) [type: brin]')

    expect(replacePgmlConstraintDefinitionInBlock(
      '  Constraint chk_orders_total: total_cents >= 0',
      {
        expression: 'total_cents >= discount_cents',
        name: 'chk_orders_total'
      }
    )).toBe('  Constraint chk_orders_total: total_cents >= discount_cents')
  })
})
