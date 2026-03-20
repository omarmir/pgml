import { describe, expect, it } from 'vitest'

import { buildPgmlExportBundle } from '../../app/utils/pgml-export'
import { parsePgml } from '../../app/utils/pgml'

const exportSource = `Enum order_status {
  draft
  submitted
}

Domain email_address {
  base: text
  check: VALUE <> ''
}

Composite money_amount {
  amount numeric
  currency text
}

Sequence invoice_number_seq {
  source: $sql$
    CREATE SEQUENCE public.invoice_number_seq
      START WITH 1000;
  $sql$
}

Table public.users {
  id uuid [pk, default: gen_random_uuid()]
  email email_address [not null]
  status order_status [not null]
  profile jsonb
}

Table billing.invoices {
  id bigint [pk, default: nextval('invoice_number_seq')]
  user_id uuid [not null, ref: > public.users.id]
  total money_amount
}

Function refresh_invoice_totals() returns void [replace] {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.refresh_invoice_totals()
    RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`

describe('PGML export generation', () => {
  it('parses custom types into structured export-friendly shapes', () => {
    const model = parsePgml(exportSource)
    const enumType = model.customTypes.find(type => type.name === 'order_status')
    const domainType = model.customTypes.find(type => type.name === 'email_address')
    const compositeType = model.customTypes.find(type => type.name === 'money_amount')

    expect(enumType).toEqual(expect.objectContaining({
      kind: 'Enum',
      values: ['draft', 'submitted']
    }))
    expect(domainType).toEqual(expect.objectContaining({
      kind: 'Domain',
      baseType: 'text',
      check: `VALUE <> ''`
    }))
    expect(compositeType).toEqual(expect.objectContaining({
      kind: 'Composite',
      fields: [
        {
          name: 'amount',
          type: 'numeric'
        },
        {
          name: 'currency',
          type: 'text'
        }
      ]
    }))
  })

  it('builds SQL and Kysely export artifacts from the current PGML snapshot', () => {
    const bundle = buildPgmlExportBundle(parsePgml(exportSource), {
      baseName: 'Billing Suite',
      kyselyTypeStyle: 'strict'
    })

    expect(bundle.sql.migration.fileName).toBe('billing-suite.migration.sql')
    expect(bundle.sql.ddl.fileName).toBe('billing-suite.ddl.sql')
    expect(bundle.sql.migration.content).toContain('BEGIN;')
    expect(bundle.sql.ddl.content).not.toContain('BEGIN;')
    expect(bundle.sql.ddl.content).toContain('CREATE TYPE "public"."order_status" AS ENUM (\'draft\', \'submitted\');')
    expect(bundle.sql.ddl.content).toContain('CREATE DOMAIN "public"."email_address" AS text CHECK (VALUE <> \'\');')
    expect(bundle.sql.ddl.content).toContain('ALTER TABLE "billing"."invoices" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id");')
    expect(bundle.sql.ddl.content).toContain('CREATE OR REPLACE FUNCTION public.refresh_invoice_totals()')

    expect(bundle.kysely.migration.fileName).toBe('billing-suite.migration.ts')
    expect(bundle.kysely.interfaces.fileName).toBe('billing-suite.database.ts')
    expect(bundle.kysely.migration.content).toContain('import type { Database } from \'./billing-suite.database\'')
    expect(bundle.kysely.migration.content).toContain('await sql`')
    expect(bundle.kysely.migration.content).toContain('CREATE TYPE "public"."order_status" AS ENUM')
    expect(bundle.kysely.interfaces.content).toContain(`export type OrderStatus = 'draft' | 'submitted'`)
    expect(bundle.kysely.interfaces.content).toContain('export type EmailAddress = string')
    expect(bundle.kysely.interfaces.content).toContain('export interface MoneyAmount')
    expect(bundle.kysely.interfaces.content).toContain(`'billing.invoices': BillingInvoicesTable`)
    expect(bundle.kysely.interfaces.content).toContain('id: Generated<string>')
  })
})
