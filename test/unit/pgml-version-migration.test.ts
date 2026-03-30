import { describe, expect, it } from 'vitest'

import { parsePgmlDocument } from '../../app/utils/pgml-document'
import { buildPgmlVersionMigrationBundle } from '../../app/utils/pgml-version-migration'

describe('PGML version migration helpers', () => {
  it('prepends the empty-base warning when no base version is selected', () => {
    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: '',
      hasSelectedBase: false,
      targetSource: `Table public.users {
  id uuid [pk]
}`
    })

    expect(bundle.meta.warningCount).toBe(1)
    expect(bundle.sql.migration.warnings[0]).toBe(
      'No base version is selected. The migration is being generated from an empty schema.'
    )
  })

  it('builds history-aware step migrations for version lineage and workspace drafts', () => {
    const document = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }

      Table public.orders {
        id uuid [pk]
        user_id uuid
      }

      Ref: public.orders.user_id > public.users.id
    }
  }

  Version v1 {
    name: "Initial users"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Add user email"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`)

    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: document.versions[0]!.snapshot.source,
      baseVersionId: 'v1',
      document,
      hasSelectedBase: true,
      targetId: 'workspace',
      targetSource: document.workspace.snapshot.source
    }, {
      baseName: 'Billing history'
    })

    expect(bundle.meta.historyAware).toBe(true)
    expect(bundle.meta.stepCount).toBe(2)
    expect(bundle.meta.validation.isValid).toBe(true)
    expect(bundle.steps).toHaveLength(2)
    expect(bundle.steps[0]!.index).toBe(0)
    expect(bundle.steps[0]!.label).toBe('Initial users -> Add user email')
    expect(bundle.steps[0]!.target.baseId).toBe('v1')
    expect(bundle.steps[0]!.target.targetId).toBe('v2')
    expect(bundle.steps[0]!.validation.isValid).toBe(true)
    expect(bundle.steps[1]!.index).toBe(1)
    expect(bundle.steps[1]!.label).toBe('Add user email -> Current workspace')
    expect(bundle.steps[1]!.target.targetId).toBe('workspace')
    expect(bundle.steps[1]!.validation.isValid).toBe(true)
    expect(bundle.steps[0]!.sql.migration.fileName).toContain('-step-1-')
    expect(bundle.steps[0]!.kysely.migration.fileName).toContain('-step-1-')
    expect(bundle.steps[1]!.sql.migration.fileName).toContain('-step-2-')
    expect(bundle.steps[1]!.kysely.migration.fileName).toContain('-step-2-')
    expect(bundle.steps[0]!.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    expect(bundle.steps[0]!.sql.migration.content).not.toContain(
      'CREATE TABLE "public"."orders" ('
    )
    expect(bundle.steps[0]!.kysely.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    expect(bundle.steps[0]!.kysely.migration.content).not.toContain(
      'CREATE TABLE "public"."orders" ('
    )
    expect(bundle.steps[1]!.sql.migration.content).toContain(
      'CREATE TABLE "public"."orders" ('
    )
    expect(bundle.steps[1]!.sql.migration.content).toContain(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");'
    )
    expect(bundle.steps[1]!.sql.migration.content).not.toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    expect(bundle.steps[1]!.kysely.migration.content).toContain(
      'CREATE TABLE "public"."orders" ('
    )
    expect(bundle.steps[1]!.kysely.migration.content).toContain(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");'
    )
    expect(bundle.steps[1]!.kysely.migration.content).not.toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    expect(bundle.sql.migration.content).toContain('-- Step 1: Initial users -> Add user email')
    expect(bundle.sql.migration.content).toContain('-- Step 2: Add user email -> Current workspace')
    expect(bundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    expect(bundle.sql.migration.content).toContain(
      'CREATE TABLE "public"."orders" ('
    )
    expect(bundle.sql.migration.content).toContain(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");'
    )
    const addEmailIndex = bundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."users" ADD COLUMN "email" text;'
    )
    const createOrdersIndex = bundle.sql.migration.content.indexOf(
      'CREATE TABLE "public"."orders" ('
    )
    const addReferenceIndex = bundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");'
    )

    expect(addEmailIndex).toBeGreaterThan(-1)
    expect(createOrdersIndex).toBeGreaterThan(addEmailIndex)
    expect(addReferenceIndex).toBeGreaterThan(createOrdersIndex)
    expect(bundle.kysely.migration.fileName).toBe('billing-history.migration.ts')
    expect(bundle.kysely.migration.content).toContain('// Step 1: Initial users -> Add user email')
    expect(bundle.kysely.migration.content).toContain('// Step 2: Add user email -> Current workspace')
    expect(bundle.steps[0]!.kysely.migration.content).toContain('ALTER TABLE "public"."users" ADD COLUMN "email" text;')
    expect(bundle.steps[1]!.kysely.migration.content).toContain('CREATE TABLE "public"."orders" (')
  })

  it('falls back to aggregate diff warnings when compare targets are not a forward lineage', () => {
    const document = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.memberships {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Orders"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.orders {
        id uuid [pk]
      }
    }
  }

  Version v3 {
    name: "Members"
    role: design
    parent: v1
    created_at: "2026-03-31T12:00:00.000Z"

    Snapshot {
      Table public.memberships {
        id uuid [pk]
      }
    }
  }
}`)

    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: document.versions[1]!.snapshot.source,
      baseVersionId: 'v2',
      document,
      hasSelectedBase: true,
      targetId: 'v3',
      targetSource: document.versions[2]!.snapshot.source
    })

    expect(bundle.meta.historyAware).toBe(false)
    expect(bundle.sql.migration.warnings[0]).toContain('not a forward version lineage')
  })

  it('retains warning-only history steps when a version transition cannot be migrated automatically', () => {
    const document = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Enum public.order_status {
        draft
        paid
      }

      Table public.audit_log {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Full status"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Enum public.order_status {
        draft
        paid
        archived
      }
    }
  }

  Version v2 {
    name: "Trim status"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Enum public.order_status {
        draft
        paid
      }
    }
  }
}`)

    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: document.versions[0]!.snapshot.source,
      baseVersionId: 'v1',
      document,
      hasSelectedBase: true,
      targetId: 'workspace',
      targetSource: document.workspace.snapshot.source
    }, {
      baseName: 'Warning lineage'
    })

    expect(bundle.meta.historyAware).toBe(true)
    expect(bundle.meta.stepCount).toBe(2)
    expect(bundle.meta.validation.isValid).toBe(true)
    expect(bundle.steps).toHaveLength(2)
    expect(bundle.steps[0]!.meta.hasChanges).toBe(false)
    expect(bundle.steps[0]!.meta.warningCount).toBeGreaterThan(0)
    expect(bundle.steps[0]!.validation.isValid).toBe(true)
    expect(bundle.steps[0]!.sql.migration.warnings[0]).toContain(
      'Enum public.order_status changed in a way that cannot be migrated safely'
    )
    expect(bundle.steps[0]!.kysely.migration.warnings[0]).toContain(
      'Enum public.order_status changed in a way that cannot be migrated safely'
    )
    expect(bundle.steps[1]!.meta.hasChanges).toBe(true)
    expect(bundle.steps[1]!.validation.isValid).toBe(true)
    expect(bundle.steps[1]!.sql.migration.content).toContain('CREATE TABLE "public"."audit_log" (')
    expect(bundle.steps[1]!.sql.migration.content).not.toContain('Enum public.order_status')
    expect(bundle.sql.migration.content).toContain('-- Step 1: Full status -> Trim status')
    expect(bundle.sql.migration.content).toContain('-- No automatic SQL statements were generated for this step. Review warnings.')
    expect(bundle.sql.migration.content).toContain('-- Warning: Enum public.order_status changed in a way that cannot be migrated safely')
    expect(bundle.sql.migration.content).toContain('CREATE TABLE "public"."audit_log" (')
    expect(bundle.kysely.migration.content).toContain('// Step 1: Full status -> Trim status')
    expect(bundle.kysely.migration.content).toContain('// No automatic SQL statements were generated for this step. Review warnings.')
    expect(bundle.sql.migration.warnings[0]).toContain('Step 1 (Full status -> Trim status): Enum public.order_status changed')
  })

  it('keeps complex multi-step history migrations ordered across enum changes, tables, refs, routines, and triggers', () => {
    const document = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Enum public.order_status {
        draft
        submitted
        paid
      }

      Table public.users {
        id uuid [pk]
      }

      Table public.orders {
        id uuid [pk]
        user_id uuid [not null]
        status public.order_status [default: 'submitted']
      }

      Ref: public.orders.user_id > public.users.id

      Function public.touch_orders() returns trigger {
        source: $sql$
          CREATE OR REPLACE FUNCTION public.touch_orders()
          RETURNS trigger AS $$
          BEGIN
            RETURN NEW;
          END;
          $$ LANGUAGE plpgsql;
        $sql$
      }

      Trigger trg_touch_orders on public.orders {
        source: $sql$
          CREATE TRIGGER trg_touch_orders
            BEFORE UPDATE ON public.orders
            FOR EACH ROW
            EXECUTE FUNCTION public.touch_orders();
        $sql$
      }
    }
  }

  Version v1 {
    name: "Users"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Enum public.order_status {
        draft
        paid
      }

      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Orders"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Enum public.order_status {
        draft
        paid
      }

      Table public.users {
        id uuid [pk]
      }

      Table public.orders {
        id uuid [pk]
        user_id uuid [not null]
        status public.order_status
      }

      Ref: public.orders.user_id > public.users.id
    }
  }
}`)

    const bundle = buildPgmlVersionMigrationBundle({
      baseSource: document.versions[0]!.snapshot.source,
      baseVersionId: 'v1',
      document,
      hasSelectedBase: true,
      targetId: 'workspace',
      targetSource: document.workspace.snapshot.source
    }, {
      baseName: 'Complex lineage'
    })

    expect(bundle.meta.historyAware).toBe(true)
    expect(bundle.meta.stepCount).toBe(2)
    expect(bundle.steps).toHaveLength(2)
    expect(bundle.sql.migration.content).toContain('-- Step 1: Users -> Orders')
    expect(bundle.sql.migration.content).toContain('-- Step 2: Orders -> Current workspace')
    expect(bundle.sql.migration.content).toContain('CREATE TABLE "public"."orders" (')
    expect(bundle.sql.migration.content).toContain('ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
    expect(bundle.sql.migration.content).toContain(`ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`)
    expect(bundle.sql.migration.content).toContain(`ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`)
    expect(bundle.sql.migration.content).toContain('CREATE OR REPLACE FUNCTION public.touch_orders()')
    expect(bundle.sql.migration.content).toContain('CREATE TRIGGER trg_touch_orders')

    const createOrdersIndex = bundle.sql.migration.content.indexOf('CREATE TABLE "public"."orders" (')
    const addReferenceIndex = bundle.sql.migration.content.indexOf(
      'ALTER TABLE "public"."orders" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");'
    )
    const addEnumValueIndex = bundle.sql.migration.content.indexOf(
      `ALTER TYPE "public"."order_status" ADD VALUE IF NOT EXISTS 'submitted' BEFORE 'paid';`
    )
    const setDefaultIndex = bundle.sql.migration.content.indexOf(
      `ALTER TABLE "public"."orders" ALTER COLUMN "status" SET DEFAULT 'submitted';`
    )
    const createFunctionIndex = bundle.sql.migration.content.indexOf('CREATE OR REPLACE FUNCTION public.touch_orders()')
    const createTriggerIndex = bundle.sql.migration.content.indexOf('CREATE TRIGGER trg_touch_orders')

    expect(addReferenceIndex).toBeGreaterThan(createOrdersIndex)
    expect(addEnumValueIndex).toBeGreaterThan(addReferenceIndex)
    expect(setDefaultIndex).toBeGreaterThan(addEnumValueIndex)
    expect(createFunctionIndex).toBeGreaterThan(setDefaultIndex)
    expect(createTriggerIndex).toBeGreaterThan(createFunctionIndex)
    expect(bundle.kysely.migration.content).toContain('// Step 2: Orders -> Current workspace')
    expect(bundle.kysely.migration.content).toContain('await sql`')
  })
})
