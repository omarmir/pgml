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
    expect(migrationBundle.sql.migration.content).toContain('BEGIN;')
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
    expect(migrationBundle.sql.migration.content).toContain('DROP TYPE IF EXISTS "public"."order_status";')
    expect(migrationBundle.sql.migration.content).toContain('CREATE TYPE "public"."order_status" AS ENUM (\'draft\', \'paid\');')
    expect(migrationBundle.sql.migration.content).toContain('DROP SEQUENCE IF EXISTS "public"."order_number_seq";')
    expect(migrationBundle.sql.migration.content).toContain('ALTER TABLE "public"."orders" DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";')
    expect(migrationBundle.sql.migration.content).toContain('DROP FUNCTION IF EXISTS "public"."refresh_orders"();')
    expect(migrationBundle.sql.migration.warnings).toEqual(expect.arrayContaining([
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
