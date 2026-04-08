import { describe, expect, it } from 'vitest'

import { buildPgmlWithNodeProperties, parsePgml } from '../../app/utils/pgml'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { buildPgmlMigrationDiffBundle } from '../../app/utils/pgml-migration-diff'

const baseSnapshotSource = `Table public.users {
  id uuid [pk]
}`

describe('PGML version diffing', () => {
  it('classifies schema and layout deltas between two snapshots', () => {
    const baseModel = parsePgml(baseSnapshotSource)
    const targetModel = parsePgml(buildPgmlWithNodeProperties(`Table public.users {
  id uuid [pk]
  email text [not null]
}`, {
      'public.users': {
        x: 240,
        y: 180
      }
    }))
    const diff = diffPgmlSchemaModels(baseModel, targetModel)

    expect(diff.columns).toHaveLength(1)
    expect(diff.columns[0]).toEqual(expect.objectContaining({
      id: 'public.users::email',
      kind: 'added'
    }))
    expect(diff.layout).toHaveLength(1)
    expect(diff.summary.added).toBe(1)
    expect(diff.summary.layoutChanged).toBe(1)
  })

  it('builds forward migration SQL from the selected base and target snapshots', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(baseSnapshotSource),
      parsePgml(`Table public.users {
  id uuid [pk]
  email text [not null]
}`),
      {
        baseName: 'Billing versions'
      }
    )

    expect(migrationBundle.sql.migration.fileName).toBe('billing-versions.migration.sql')
    expect(migrationBundle.kysely.migration.fileName).toBe('billing-versions.migration.ts')
    expect(migrationBundle.meta).toEqual({
      hasChanges: true,
      statementCount: 1,
      warningCount: 0
    })
    expect(migrationBundle.sql.migration.content).toContain('BEGIN;')
    expect(migrationBundle.kysely.migration.content).toContain('await sql`')
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text NOT NULL;'
    )
    expect(migrationBundle.sql.migration.warnings).toEqual([])
  })

  it('ignores column modifier ordering when classifying changes', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.users {
  id uuid [pk]
  email text [not null, unique]
}`),
      parsePgml(`Table public.users {
  id uuid [pk]
  email text [unique, not null]
}`)
    )

    expect(diff.columns).toEqual([])
    expect(diff.summary.modified).toBe(0)
  })

  it('ignores equivalent sequence-backed defaults that only differ by quoting, regclass casts, or modifier order', () => {
    const beforeModel = parsePgml(`Table public.agency_cost_category_line_item {
  id bigint [pk, not null, default: nextval('public.agency_cost_category_line_item_id_seq')]
}`)
    const afterModel = parsePgml(`Table public.agency_cost_category_line_item {
  id bigint [not null, default: nextval('public.\\"agency_cost_category_line_item_id_seq\\"'::regclass), pk]
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.columns).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
    expect(migrationBundle.sql.migration.content).not.toContain('SET DEFAULT')
  })

  it('ignores equivalent built-in type aliases when diffing and generating migrations', () => {
    const beforeModel = parsePgml(`Table public.agency_profile {
  legal_name varchar(255) [not null]
  submitted_at timestamp
}`)
    const afterModel = parsePgml(`Table public.agency_profile {
  legal_name character varying(255) [not null]
  submitted_at timestamp without time zone
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.columns).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
    expect(migrationBundle.sql.migration.content).not.toContain('ALTER COLUMN "legal_name" TYPE')
    expect(migrationBundle.sql.migration.content).not.toContain('ALTER COLUMN "submitted_at" TYPE')
  })

  it('ignores metadata ordering for routines when semantic content is unchanged', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Function public.refresh_orders() returns void {
  volatility: stable
  cost: 100
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`),
      parsePgml(`Function public.refresh_orders() returns void {
  cost: 100
  volatility: stable
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    )

    expect(diff.functions).toEqual([])
    expect(diff.summary.modified).toBe(0)
  })

  it('reports changed fields for modified diff entries', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.users {
  id uuid [pk]
  email text
}`),
      parsePgml(`Table public.users {
  id uuid [pk]
  email varchar [not null]
}`)
    )

    expect(diff.columns[0]).toEqual(expect.objectContaining({
      changes: expect.arrayContaining(['modifiers', 'type']),
      id: 'public.users::email',
      kind: 'modified'
    }))
  })

  it('ignores group changes when table members only differ by implicit public schema qualification', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`TableGroup Agency {
  Agency_Profile
  Agency_Cost_Category
}

Table public.Agency_Profile {
  id uuid [pk]
}

Table public.Agency_Cost_Category {
  id uuid [pk]
}`),
      parsePgml(`TableGroup Agency {
  public.Agency_Profile
  public.Agency_Cost_Category
}

Table public.Agency_Profile {
  id uuid [pk]
}

Table public.Agency_Cost_Category {
  id uuid [pk]
}`)
    )

    expect(diff.groups).toEqual([])
    expect(diff.summary.modified).toBe(0)
  })

  it('omits routine migration statements when only metadata ordering changes', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Function public.refresh_orders() returns void {
  volatility: stable
  cost: 100
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`),
      parsePgml(`Function public.refresh_orders() returns void {
  cost: 100
  volatility: stable
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    )

    expect(migrationBundle.sql.migration.content).not.toContain('CREATE OR REPLACE FUNCTION public.refresh_orders()')
  })

  it('drops references before dropping the referenced table snapshot', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}`),
      parsePgml(`Table public.users {
  id uuid [pk]
}`)
    )
    const referenceDropIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";'
    )
    const tableDropIndex = migrationBundle.sql.migration.content.indexOf(
      'DROP TABLE IF EXISTS "public"."orders";'
    )

    expect(referenceDropIndex).toBeGreaterThan(-1)
    expect(tableDropIndex).toBeGreaterThan(-1)
    expect(referenceDropIndex).toBeLessThan(tableDropIndex)
  })

  it('drops triggers before dropping their table snapshot', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Table public.users {
  id uuid [pk]
}

Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      AFTER UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`),
      parsePgml('')
    )
    const triggerDropIndex = migrationBundle.sql.migration.content.indexOf(
      'DROP TRIGGER IF EXISTS "trg_touch_users" ON "public"."users";'
    )
    const tableDropIndex = migrationBundle.sql.migration.content.indexOf(
      'DROP TABLE IF EXISTS "public"."users";'
    )

    expect(triggerDropIndex).toBeGreaterThan(-1)
    expect(tableDropIndex).toBeGreaterThan(-1)
    expect(triggerDropIndex).toBeLessThan(tableDropIndex)
  })

  it('emits drop statements for removed functions and procedures when signatures are available', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Function public.refresh_orders(user_id uuid) returns void {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders(user_id uuid)
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Procedure public.archive_orders(retention_days integer) {
  source: $sql$
    CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      RETURN;
    END;
    $$;
  $sql$
}`),
      parsePgml('')
    )

    expect(migrationBundle.sql.migration.content).toContain(
      'DROP FUNCTION IF EXISTS "public"."refresh_orders"(uuid);'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'DROP PROCEDURE IF EXISTS "public"."archive_orders"(integer);'
    )
  })

  it('warns when a removed table looks like a rename to a newly added table', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Table public.users {
  id uuid [pk]
  email text
}`),
      parsePgml(`Table public.accounts {
  id uuid [pk]
  email text
}`)
    )

    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('possible rename')
    ]))
  })

  it('alters enums additively before dependent table changes instead of dropping and recreating the type', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Enum public.order_status {
  draft
  paid
}

Table public.orders {
  id uuid [pk]
  status public.order_status
}`),
      parsePgml(`Enum public.order_status {
  draft
  submitted
  paid
  archived
}

Table public.orders {
  id uuid [pk]
  status public.order_status [default: 'submitted']
}`),
      {
        baseName: 'Enum evolution'
      }
    )

    expect(migrationBundle.sql.migration.content).toContain(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`
    )
    expect(migrationBundle.sql.migration.content).toContain(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'archived' AFTER 'paid';`
    )
    expect(migrationBundle.sql.migration.content).toContain(
      `ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`
    )
    expect(migrationBundle.sql.migration.content).not.toContain('DROP TYPE IF EXISTS "public"."order_status";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE TYPE "public"."order_status" AS ENUM')

    const addSubmittedIndex = migrationBundle.sql.migration.content.indexOf(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`
    )
    const setDefaultIndex = migrationBundle.sql.migration.content.indexOf(
      `ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`
    )

    expect(addSubmittedIndex).toBeGreaterThan(-1)
    expect(setDefaultIndex).toBeGreaterThan(addSubmittedIndex)
  })

  it('warns and omits unsafe enum rewrites that would require removing or reordering values', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Enum public.order_status {
  draft
  paid
  archived
}`),
      parsePgml(`Enum public.order_status {
  paid
  draft
}`)
    )

    expect(migrationBundle.sql.migration.content).not.toContain('ALTER TYPE "public"."order_status"')
    expect(migrationBundle.sql.migration.content).not.toContain('DROP TYPE IF EXISTS "public"."order_status";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE TYPE "public"."order_status" AS ENUM')
    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Enum public.order_status changed in a way that cannot be migrated safely')
    ]))
  })

  it('alters composite types before applying dependent table changes', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Composite public.money_amount {
  amount numeric
  currency text
  legacy_code text
}

Table public.invoices {
  id uuid [pk]
  total public.money_amount
}`),
      parsePgml(`Composite public.money_amount {
  amount numeric(12,2)
  currency text
  precision text
}

Table public.invoices {
  id uuid [pk]
  total public.money_amount
  processed_at timestamptz
}`)
    )

    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TYPE "public"."money_amount" DROP ATTRIBUTE IF EXISTS "legacy_code";'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TYPE "public"."money_amount" ALTER ATTRIBUTE "amount" TYPE numeric(12, 2);'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TYPE "public"."money_amount" ADD ATTRIBUTE "precision" text;'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."invoices" ADD COLUMN "processed_at" timestamptz;'
    )
    expect(migrationBundle.sql.migration.content).not.toContain('DROP TYPE IF EXISTS "public"."money_amount";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE TYPE "public"."money_amount" AS (')

    const compositeAlterIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TYPE "public"."money_amount" ALTER ATTRIBUTE "amount" TYPE numeric(12, 2);'
    )
    const addColumnIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."invoices" ADD COLUMN "processed_at" timestamptz;'
    )

    expect(compositeAlterIndex).toBeGreaterThan(-1)
    expect(addColumnIndex).toBeGreaterThan(compositeAlterIndex)
  })

  it('warns and omits unsafe domain and sequence replacements instead of generating invalid recreate statements', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Domain public.email_address {
  base: text
  check: VALUE <> ''
}

Sequence public.invoice_number_seq {
  source: $sql$
    CREATE SEQUENCE public.invoice_number_seq START WITH 1000;
  $sql$
}`),
      parsePgml(`Domain public.email_address {
  base: citext
  check: VALUE <> '' and VALUE ilike '%@%'
}

Sequence public.invoice_number_seq {
  source: $sql$
    CREATE SEQUENCE public.invoice_number_seq START WITH 5000;
  $sql$
}`)
    )

    expect(migrationBundle.sql.migration.content).not.toContain('DROP DOMAIN IF EXISTS "public"."email_address";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE DOMAIN "public"."email_address"')
    expect(migrationBundle.sql.migration.content).not.toContain('DROP SEQUENCE IF EXISTS "public"."invoice_number_seq";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE SEQUENCE public.invoice_number_seq START WITH 5000;')
    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Domain public.email_address changed'),
      expect.stringContaining('Sequence public.invoice_number_seq changed')
    ]))
  })

  it('warns and omits same-name cross-kind custom type replacements', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Domain public.shared_identifier {
  base: text
}`),
      parsePgml(`Enum public.shared_identifier {
  draft
  active
}`)
    )

    expect(migrationBundle.sql.migration.content).not.toContain('DROP DOMAIN IF EXISTS "public"."shared_identifier";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE TYPE "public"."shared_identifier" AS ENUM')
    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Type public.shared_identifier changes kind across versions')
    ]))
  })

  it('drops dependent indexes, constraints, and refs before dropping their columns and recreates them afterward', () => {
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  user_id uuid
  Constraint orders_user_id_check: user_id is not null
  Index idx_orders_user_id (user_id) [type: btree]
}

Ref: public.orders.user_id > public.users.id`),
      parsePgml(`Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  customer_id uuid [not null]
  Constraint orders_customer_id_check: customer_id is not null
  Index idx_orders_customer_id (customer_id) [type: btree]
}

Ref: public.orders.customer_id > public.users.id`)
    )

    const dropIndexIndex = migrationBundle.sql.migration.content.indexOf(
      'DROP INDEX IF EXISTS "idx_orders_user_id";'
    )
    const dropConstraintIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_check";'
    )
    const dropReferenceIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";'
    )
    const dropColumnIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" DROP COLUMN IF EXISTS "user_id";'
    )
    const addColumnIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" ADD COLUMN "customer_id" uuid NOT NULL;'
    )
    const addConstraintIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_customer_id_check" CHECK (customer_id is not null);'
    )
    const addIndexIndex = migrationBundle.sql.migration.content.indexOf(
      'CREATE INDEX "idx_orders_customer_id" ON "public"."orders" USING btree ("customer_id");'
    )
    const addReferenceIndex = migrationBundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("customer_id") REFERENCES "public"."users" ("id");'
    )

    expect(dropIndexIndex).toBeGreaterThan(-1)
    expect(dropConstraintIndex).toBeGreaterThan(-1)
    expect(dropReferenceIndex).toBeGreaterThan(-1)
    expect(dropColumnIndex).toBeGreaterThan(dropReferenceIndex)
    expect(dropColumnIndex).toBeGreaterThan(dropConstraintIndex)
    expect(dropColumnIndex).toBeGreaterThan(dropIndexIndex)
    expect(addConstraintIndex).toBeGreaterThan(addColumnIndex)
    expect(addIndexIndex).toBeGreaterThan(addColumnIndex)
    expect(addReferenceIndex).toBeGreaterThan(addIndexIndex)
  })

  it('handles removed references, replaced custom types and omitted routines with warnings', () => {
    const baseSource = `Enum order_status {
  draft
  submitted
}

Sequence order_number_seq {
  source: $sql$
    CREATE SEQUENCE public.order_number_seq START WITH 10;
  $sql$
}

Table public.users {
  id uuid [pk]
  email text [unique]
}

Table public.orders {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}

Function refresh_orders() returns void [replace] {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_orders()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`
    const targetSource = `Enum order_status {
  draft
  paid
}

Table public.users {
  id uuid [pk]
  email text
}

Table public.orders {
  id uuid [pk]
  user_id uuid
}

Function orphan_report() {
}`
    const diff = diffPgmlSchemaModels(parsePgml(baseSource), parsePgml(targetSource))
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(baseSource),
      parsePgml(targetSource),
      {
        baseName: 'Version warnings'
      }
    )

    expect(diff.customTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'Enum::order_status',
        kind: 'modified'
      })
    ]))
    expect(diff.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: expect.stringContaining('public.orders'),
        kind: 'removed'
      })
    ]))
    expect(migrationBundle.sql.migration.content).not.toContain('DROP TYPE IF EXISTS "public"."order_status";')
    expect(migrationBundle.sql.migration.content).not.toContain('CREATE TYPE "public"."order_status" AS ENUM')
    expect(migrationBundle.sql.migration.content).toContain('DROP SEQUENCE IF EXISTS "public"."order_number_seq";')
    expect(migrationBundle.sql.migration.content).toContain('ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";')
    expect(migrationBundle.sql.migration.content).toContain('DROP FUNCTION IF EXISTS "public"."refresh_orders"();')
    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('Enum order_status changed in a way that cannot be migrated safely'),
      expect.stringContaining('Column uniqueness changed for public.users.email'),
      expect.stringContaining('Function orphan_report has no source block')
    ]))
  })

  it('emits trigger, default, index, and constraint changes for altered tables', () => {
    const baseSource = `Table public.users {
  id uuid [pk]
  email text
  Constraint users_email_check: email <> ''
}

Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      AFTER UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`
    const targetSource = `Table public.users {
  id uuid [pk]
  email text [not null, default: '']
  Constraint users_email_check: email <> '' and email is not null
  Index idx_users_email (email) [type: btree]
}

Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      BEFORE UPDATE ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`
    const migrationBundle = buildPgmlMigrationDiffBundle(
      parsePgml(baseSource),
      parsePgml(targetSource)
    )

    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ALTER COLUMN "email" SET DEFAULT \'\';'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ALTER COLUMN "email" SET NOT NULL;'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" DROP CONSTRAINT IF EXISTS "users_email_check";'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD CONSTRAINT "users_email_check" CHECK (email <> \'\' and email is not null);'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'CREATE INDEX "idx_users_email" ON "public"."users" USING btree ("email");'
    )
    expect(migrationBundle.sql.migration.content).toContain(
      'DROP TRIGGER IF EXISTS "trg_touch_users" ON "public"."users";'
    )
    expect(migrationBundle.sql.migration.content).toContain('CREATE TRIGGER trg_touch_users')
  })
})
