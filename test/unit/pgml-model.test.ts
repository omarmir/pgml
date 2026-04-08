import { describe, expect, it } from 'vitest'

import {
  dedentPgmlSourceForEditor,
  extractPgmlRoutineBodyFromExecutableSource,
  filterPgmlSchemaModelForCompareExclusions,
  getOrderedGroupTables,
  getPgmlSourceScrollTop,
  getPgmlSourceSelectionRange,
  normalizePgmlBlockSourceForEditor,
  normalizePgmlSourceIndentation,
  parsePgml,
  pgmlExample,
  pgmlVersionedExample,
  reindentPgmlBlockEditorText,
  reindentPgmlEditorText,
  replacePgmlConstraintExpressionInBlock,
  replacePgmlExecutableSourceInBlock,
  replacePgmlRoutineBodyInExecutableSource,
  replacePgmlSourceRange
} from '../../app/utils/pgml'
import { getPgmlDocumentBlockPreviewSource, parsePgmlDocument } from '../../app/utils/pgml-document'

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
    expect(document.workspace.snapshot.source).not.toContain('Properties "group:Analytics"')
    expect(document.workspace.snapshot.source).toContain('TableGroup Analytics')
    expect(document.workspace.snapshot.source).toContain('Composite address_record')
    expect(document.workspace.snapshot.source).toContain('Procedure archive_orders(retention_days integer) [replace]')
    expect(getPgmlDocumentBlockPreviewSource(document.workspace)).toContain('Properties "group:Analytics"')
  })

  it('filters compare models by excluded groups and tables', () => {
    const model = parsePgml(`Sequence public.user_id_seq {
  source: $sql$
    CREATE SEQUENCE public.user_id_seq;
  $sql$
}

Table public.users in Core {
  id bigint [pk, default: nextval('public.user_id_seq')]
}

Table public.orders in Core {
  id uuid [pk]
  user_id bigint [ref: > public.users.id]
}

Table public.audit_log {
  id uuid [pk]
}

TableGroup Core {
  public.users
  public.orders
}

Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      BEFORE UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`)

    const filteredModel = filterPgmlSchemaModelForCompareExclusions(model, {
      groupNames: ['Core'],
      tableIds: ['public.audit_log']
    })

    expect(filteredModel.tables).toEqual([])
    expect(filteredModel.groups).toEqual([])
    expect(filteredModel.references).toEqual([])
    expect(filteredModel.sequences).toEqual([])
    expect(filteredModel.triggers).toEqual([])
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

  it('infers routine affects from executable source when no affects block is present', () => {
    const model = parsePgml(`Enum entity_type {
  fundingopportunity
}

Sequence public.common_entity_id_seq {
  source: $sql$
    CREATE SEQUENCE public.common_entity_id_seq;
  $sql$
}

Table public.common_entity {
  id bigint [pk, default: nextval('common_entity_id_seq')]
  entity_type entity_type [not null]
}

Table public.funding_opportunity_profile {
  id bigint [pk]
}

Function register_entity() returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity() RETURNS trigger AS $$
    DECLARE
      allocated_id bigint;
    BEGIN
      INSERT INTO 'Common_Entity' (entity_type)
      VALUES (TG_ARGV[0]::'Entity_Type')
      RETURNING id INTO allocated_id;

      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}`)
    const routine = model.functions.find(entry => entry.name === 'register_entity') || null

    expect(routine?.affects?.writes).toEqual(['public.common_entity'])
    expect(routine?.affects?.sets).toEqual(['public.funding_opportunity_profile.id'])
    expect(routine?.affects?.dependsOn).toEqual(expect.arrayContaining([
      'public.common_entity',
      'entity_type'
    ]))
  })

  it('expands trigger-row affects across multiple trigger attachments', () => {
    const model = parsePgml(`Table public.orders {
  id uuid [pk]
}

Table public.invoices {
  id uuid [pk]
}

Function assign_entity_id() returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.assign_entity_id() RETURNS trigger AS $$
    BEGIN
      NEW.id := COALESCE(NEW.id, gen_random_uuid());
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_assign_order_id on public.orders {
  source: $sql$
    CREATE TRIGGER trg_assign_order_id
      BEFORE INSERT ON public.orders
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_entity_id();
  $sql$
}

Trigger trg_assign_invoice_id on public.invoices {
  source: $sql$
    CREATE TRIGGER trg_assign_invoice_id
      BEFORE INSERT ON public.invoices
      FOR EACH ROW
      EXECUTE FUNCTION public.assign_entity_id();
  $sql$
}`)
    const routine = model.functions.find(entry => entry.name === 'assign_entity_id') || null

    expect(routine?.affects?.sets).toEqual([
      'public.orders.id',
      'public.invoices.id'
    ])
    expect(routine?.affects?.reads).toEqual([
      'public.orders.id',
      'public.invoices.id'
    ])
    expect(routine?.affects?.dependsOn).toEqual([
      'public.orders',
      'public.invoices'
    ])
  })

  it('does not mistake trigger-row comparisons for column writes', () => {
    const model = parsePgml(`Table public.common_completion {
  id uuid [pk]
  egcs_cn_value boolean
  egcs_cn_user uuid
  egcs_cn_completedat timestamptz
}

Function trg_fn_enforce_completion_audit_fields() returns trigger {
  source: $sql$
    BEGIN
      IF NEW.egcs_cn_value IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Completion rows must store egcs_cn_value = true';
      END IF;

      IF TG_OP = 'UPDATE' THEN
        IF OLD.egcs_cn_value = true THEN
          IF NEW.egcs_cn_user IS DISTINCT FROM OLD.egcs_cn_user THEN
            RAISE EXCEPTION 'Completion user cannot be changed after completion';
          END IF;

          IF NEW.egcs_cn_value IS DISTINCT FROM OLD.egcs_cn_value THEN
            RAISE EXCEPTION 'Completion value cannot be changed after completion';
          END IF;

          IF NEW.egcs_cn_completedat IS DISTINCT FROM OLD.egcs_cn_completedat THEN
            RAISE EXCEPTION 'Completion timestamp cannot be changed after completion';
          END IF;
        END IF;
      END IF;

      IF TG_OP = 'INSERT' THEN
        IF NEW.egcs_cn_value = true THEN
          NEW.egcs_cn_completedat := NOW();
        END IF;
      ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.egcs_cn_value IS DISTINCT FROM true AND NEW.egcs_cn_value IS DISTINCT FROM OLD.egcs_cn_value THEN
          NEW.egcs_cn_completedat := NOW();
        END IF;
      END IF;

      RETURN NEW;
    END;
  $sql$
}

Trigger trg_enforce_completion_audit_fields on public.common_completion {
  source: $sql$
    CREATE TRIGGER trg_enforce_completion_audit_fields
      BEFORE INSERT OR UPDATE ON public.common_completion
      FOR EACH ROW
      EXECUTE FUNCTION trg_fn_enforce_completion_audit_fields();
  $sql$
}`)
    const routine = model.functions.find(entry => entry.name === 'trg_fn_enforce_completion_audit_fields') || null

    expect(routine?.affects?.sets).toEqual(['public.common_completion.egcs_cn_completedat'])
    expect(routine?.affects?.reads).toEqual(expect.arrayContaining([
      'public.common_completion.egcs_cn_value',
      'public.common_completion.egcs_cn_user',
      'public.common_completion.egcs_cn_completedat'
    ]))
    expect(routine?.affects?.reads).not.toEqual(expect.arrayContaining([
      'NEW.egcs_cn_value',
      'OLD.egcs_cn_value'
    ]))
  })

  it('infers multiple read and write targets for source-only procedures', () => {
    const model = parsePgml(`Table public.orders {
  id uuid [pk]
}

Table public.order_items {
  id uuid [pk]
  order_id uuid [not null]
}

Table public.orders_archive {
  id uuid [pk]
}

Table public.order_item_archive {
  id uuid [pk]
}

Procedure archive_orders(retention_days integer) [replace] {
  source: $sql$
    CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO public.orders_archive
      SELECT *
      FROM public.orders;

      INSERT INTO public.order_item_archive
      SELECT items.*
      FROM public.order_items AS items
      INNER JOIN public.orders AS orders
        ON orders.id = items.order_id;
    END;
    $$;
  $sql$
}`)
    const routine = model.procedures.find(entry => entry.name === 'archive_orders') || null

    expect(routine?.affects?.writes).toEqual([
      'public.orders_archive',
      'public.order_item_archive'
    ])
    expect(routine?.affects?.reads).toEqual([
      'public.orders',
      'public.order_items'
    ])
    expect(routine?.affects?.dependsOn).toEqual(expect.arrayContaining([
      'public.orders',
      'public.order_items'
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

  it('parses DBML-style imported indexes, checks, comments, and named composite refs', () => {
    const source = `/*
Imported from DBML.
*/
Table public.users {
  id bigint [pk, not null] // System ID
  email text [not null]
  status text [not null]

  Indexes {
    email [name: 'users_email_idx']
    (email, status) [name: 'users_email_status_idx', unique, where: \`status <> ''\`]
  }

  checks {
    \`status <> ''\` [name: 'users_status_check']
    \`NOT (
      status = 'draft'
      AND email = ''
    )\` [name: 'users_status_email_check']
  }
}

Table public.accounts {
  id bigint [pk]
  user_id bigint [not null]
  entity_type text [not null]
}

Ref account_user_ref: public.accounts.(user_id, entity_type) > public.users.(id, status)`
    const model = parsePgml(source)
    const usersTable = model.tables.find(table => table.fullName === 'public.users')
    const namedReference = model.references.find(reference => reference.name === 'account_user_ref')

    expect(usersTable?.columns.map(column => column.name)).toEqual(['id', 'email', 'status'])
    expect(usersTable?.indexes).toEqual([
      expect.objectContaining({
        columns: ['email'],
        name: 'users_email_idx'
      }),
      expect.objectContaining({
        columns: ['email', 'status'],
        name: 'users_email_status_idx'
      })
    ])
    expect(usersTable?.constraints).toEqual([
      expect.objectContaining({
        expression: `status <> ''`,
        name: 'users_status_check'
      }),
      expect.objectContaining({
        expression: `NOT (
status = 'draft'
AND email = ''
)`,
        name: 'users_status_email_check'
      })
    ])
    expect(namedReference).toEqual(expect.objectContaining({
      fromColumn: 'user_id',
      fromColumns: ['user_id', 'entity_type'],
      name: 'account_user_ref',
      toColumn: 'id',
      toColumns: ['id', 'status']
    }))
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

  it('normalizes over-indented PGML blocks for popup editing and writes them back with stable indentation', () => {
    const originalBlock = `TableGroup Core {
                                                                                                        public.tenants
                                                                                                        public.accounts
}`

    expect(normalizePgmlBlockSourceForEditor(originalBlock)).toBe(`TableGroup Core {
  public.tenants
  public.accounts
}`)
    expect(reindentPgmlBlockEditorText(`TableGroup Core {
  public.tenants
  public.audit_log
}`, originalBlock)).toBe(`TableGroup Core {
  public.tenants
  public.audit_log
}`)
  })

  it('normalizes pathological document indentation while keeping nested SQL structure intact', () => {
    expect(normalizePgmlSourceIndentation(`TableGroup Core {
                                                                                                        public.tenants
}

Function sync_users() returns trigger {
  source: $sql$
        CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
                RETURN NEW;
        END;
        $$;
  $sql$
}`)).toBe(`TableGroup Core {
  public.tenants
}

Function sync_users() returns trigger {
  source: $sql$
    CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
            RETURN NEW;
    END;
    $$;
  $sql$
}`)
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

  it('rewrites malformed executable source bodies with the expected PGML indentation level', () => {
    const nextBlock = replacePgmlExecutableSourceInBlock(`Function sync_users() returns trigger {
  source: $sql$
                                                                                                        CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
                                                                                                        BEGIN
                                                                                                          RETURN NEW;
                                                                                                        END;
                                                                                                        $$;
  $sql$
}`, `CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;`)

    expect(nextBlock).toBe(`Function sync_users() returns trigger {
  source: $sql$
    CREATE FUNCTION public.sync_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$
}`)
  })

  it('extracts only the routine body from wrapped function SQL for popup editing', () => {
    expect(extractPgmlRoutineBodyFromExecutableSource(`CREATE OR REPLACE FUNCTION public.demo()
RETURNS void AS $$
BEGIN
  PERFORM 1;
END;
$$ LANGUAGE plpgsql;`)).toBe(`BEGIN
  PERFORM 1;
END;`)

    expect(extractPgmlRoutineBodyFromExecutableSource(`CREATE FUNCTION public.touch_users()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;`)).toBe(`BEGIN
  RETURN NEW;
END;`)
  })

  it('reapplies routine body edits while preserving the surrounding language wrapper', () => {
    const nextExecutableSource = replacePgmlRoutineBodyInExecutableSource(`CREATE OR REPLACE FUNCTION public.demo()
RETURNS void AS $$
BEGIN
  PERFORM 1;
END;
$$ LANGUAGE plpgsql;`, `BEGIN
  PERFORM 2;
END;`)

    expect(nextExecutableSource).toBe(`CREATE OR REPLACE FUNCTION public.demo()
RETURNS void AS $$
BEGIN
  PERFORM 2;
END;
$$ LANGUAGE plpgsql;`)
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
