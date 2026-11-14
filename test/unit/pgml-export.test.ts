import { describe, expect, it } from 'vitest'
import ts from 'typescript'

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
  user_id uuid [not null, ref: > public.users.id, delete: restrict, update: cascade]
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
    expect(bundle.sql.ddl.content).toContain('ALTER TABLE "billing"."invoices" ADD FOREIGN KEY ("user_id") REFERENCES "public"."users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;')
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

  it('exports preserved non-check table constraints without rewriting them as CHECK clauses', () => {
    const source = `Table public.parent_entities {
  tenant_id uuid [pk]
  entity_type text [pk]
}

Table public.audit_log {
  tenant_id uuid [not null]
  entity_type text [not null]
  Constraint audit_log_parent_fkey: foreign key (tenant_id, entity_type) references public.parent_entities (tenant_id, entity_type) on delete restrict
}`
    const bundle = buildPgmlExportBundle(parsePgml(source), {
      baseName: 'Constraint test',
      kyselyTypeStyle: 'pragmatic'
    })

    expect(bundle.sql.ddl.content).toContain('CONSTRAINT "audit_log_parent_fkey" foreign key (tenant_id, entity_type) references public.parent_entities (tenant_id, entity_type) on delete restrict')
    expect(bundle.sql.ddl.content).not.toContain('CONSTRAINT "audit_log_parent_fkey" CHECK (foreign key')
  })

  it('exports valid Kysely types for enum values and identifiers that need escaping', () => {
    const source = `Enum workflow_state {
  "can't"
  "back\\slash"
}

Composite attributes {
  display-name text
}

Table public.o'brien {
  id uuid [pk]
  display-name text
  state workflow_state
}`
    const model = parsePgml(source)
    const bundle = buildPgmlExportBundle(model, {
      kyselyTypeStyle: 'strict'
    })
    const content = bundle.kysely.interfaces.content
    const result = ts.transpileModule(content, {
      compilerOptions: { target: ts.ScriptTarget.ESNext },
      reportDiagnostics: true
    })

    expect(result.diagnostics?.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    expect(content).toContain('\'display-name\': string')
    expect(content).toContain('\'public.o\\\'brien\': OBrienTable')

    const exportedSource = ts.createSourceFile('database.ts', content, ts.ScriptTarget.Latest)
    const exportedEnum = exportedSource.statements.find(ts.isTypeAliasDeclaration)

    expect(exportedEnum).toBeDefined()
    if (!exportedEnum || !ts.isUnionTypeNode(exportedEnum.type)) {
      throw new Error('Expected the exported enum to be a union of string literals')
    }

    const values = exportedEnum.type.types.map((type) => {
      if (!ts.isLiteralTypeNode(type) || !ts.isStringLiteral(type.literal)) {
        throw new Error('Expected an enum string literal')
      }

      return type.literal.text
    })

    expect(values).toEqual(['can\'t', 'back\\slash'])
  })

  it('exports an empty enum as never so Kysely interfaces remain valid TypeScript', () => {
    const bundle = buildPgmlExportBundle(parsePgml('Enum empty_status {\n}'), {
      kyselyTypeStyle: 'strict'
    })
    const result = ts.transpileModule(bundle.kysely.interfaces.content, {
      reportDiagnostics: true
    })

    expect(result.diagnostics?.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
    expect(bundle.kysely.interfaces.content).toContain('export type EmptyStatus = never')
  })
})
