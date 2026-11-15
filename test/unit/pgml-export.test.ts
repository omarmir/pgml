import { describe, expect, it } from 'vitest'
import ts from 'typescript'

import { buildPgmlExportBundle } from '../../app/utils/pgml-export'
import { convertDbmlToPgml } from '../../app/utils/dbml-import'
import { convertPgDumpToPgml } from '../../app/utils/pg-dump-import'
import { parsePgml } from '../../app/utils/pgml'
import { initializePgmlExecutableParser } from '../../app/utils/pgml-executable-parser'

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
    expect(bundle.sql.ddl.content).toContain('CREATE SEQUENCE public.invoice_number_seq\n      START WITH 1000;')
    expect(bundle.sql.ddl.content).not.toContain('ALTER SEQUENCE "public"."invoice_number_seq"')
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

  it('creates imported serial sequences before tables and attaches ownership after tables exist', () => {
    const imported = convertDbmlToPgml({
      dbml: 'Table users {\n  id serial [pk]\n}'
    })
    const bundle = buildPgmlExportBundle(parsePgml(imported.pgml), {
      kyselyTypeStyle: 'pragmatic'
    })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]) {
      const sequenceIndex = content.indexOf('CREATE SEQUENCE "public"."users_id_seq"')
      const tableIndex = content.indexOf('CREATE TABLE "public"."users"')
      const ownershipIndex = content.indexOf('ALTER SEQUENCE "public"."users_id_seq" OWNED BY public.users.id;')

      expect(sequenceIndex).toBeGreaterThanOrEqual(0)
      expect(tableIndex).toBeGreaterThan(sequenceIndex)
      expect(ownershipIndex).toBeGreaterThan(tableIndex)
      expect(content.slice(sequenceIndex, tableIndex)).not.toContain('OWNED BY')
      expect(content).toContain('DEFAULT nextval(\'public.users_id_seq\')')
    }
  })

  it('creates raw sequences after their owning tables and attaches defaults afterward', () => {
    const source = `Sequence users_id_seq {
  source: $sql$
    CREATE SEQUENCE public.users_id_seq START WITH 100 OWNED BY public.users.id CACHE 5;
  $sql$
}
Table users {
  id bigint [default: nextval('public.users_id_seq')]
}`
    const bundle = buildPgmlExportBundle(parsePgml(source), { kyselyTypeStyle: 'pragmatic' })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]) {
      const sequenceIndex = content.indexOf('CREATE SEQUENCE public.users_id_seq START WITH 100')
      const tableIndex = content.indexOf('CREATE TABLE "public"."users"')
      const defaultIndex = content.indexOf('ALTER TABLE "public"."users" ALTER COLUMN "id" SET DEFAULT nextval(\'public.users_id_seq\');')

      expect(tableIndex).toBeGreaterThanOrEqual(0)
      expect(sequenceIndex).toBeGreaterThan(tableIndex)
      expect(defaultIndex).toBeGreaterThan(sequenceIndex)
      expect(content).toContain('START WITH 100 OWNED BY public.users.id CACHE 5;')
      expect(content).not.toContain('ALTER SEQUENCE public.users_id_seq OWNED BY')
    }
  })

  it('preserves raw sequence blocks without interpreting quoted names or other source bytes', async () => {
    const model = parsePgml('Sequence raw_sequence {\n  start: 1\n}\nTable users {\n  id bigint\n}')
    const sequence = model.sequences[0]

    if (!sequence) {
      throw new Error('Expected a sequence fixture')
    }

    const name = '"public"."seq; ""OWNED BY"""'
    const target = '"public" /* path */ . "users"."id"'
    const create = `CREATE UNLOGGED SEQUENCE ${name}\n  START WITH 9 OWNED /* ownership */ BY ${target} CACHE 7;`
    const alter = `ALTER SEQUENCE IF EXISTS ${name} RESTART WITH 12 OWNED BY public.users.id;`
    const standalone = `ALTER SEQUENCE ${name} OWNED BY NONE;`
    const unrelated = `COMMENT ON SEQUENCE ${name} IS 'OWNED BY wrong.table;';\nDO $body$ BEGIN RAISE NOTICE 'OWNED BY wrong.table;'; END; $body$;\n-- OWNED BY wrong.table;\n/* outer /* OWNED BY wrong.table; */ comment */`
    const source = [create, alter, standalone, unrelated].join('\n')
    sequence.source = source
    const content = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' }).sql.ddl.content
    const tableIndex = content.indexOf('CREATE TABLE "public"."users"')
    const beforeTables = content.slice(0, tableIndex)
    const afterTables = content.slice(tableIndex)

    expect(beforeTables).not.toContain(create)
    expect(beforeTables).not.toContain(alter)
    expect(beforeTables).not.toContain(standalone)
    expect(afterTables).toContain(source)

    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(content)).not.toThrow()
  })

  it('preserves conditional source ownership semantics by setting defaults after raw sequence creation', async () => {
    const conditionalSource = `CREATE SEQUENCE IF NOT EXISTS public.users_id_seq START WITH 100 OWNED BY public.users.id;
ALTER SEQUENCE public.users_id_seq CACHE 7;`
    const model = parsePgml(`Sequence users_id_seq {
  source: $sql$
${conditionalSource}
  $sql$
}
Table users {
  id bigint [default: nextval('public.users_id_seq')]
  active boolean [default: false]
}
Table settings {
  value integer [default: 1]
}`)
    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]) {
      const usersIndex = content.indexOf('CREATE TABLE "public"."users"')
      const settingsIndex = content.indexOf('CREATE TABLE "public"."settings"')
      const sequenceIndex = content.indexOf(conditionalSource)
      const defaultIndex = content.indexOf('ALTER TABLE "public"."users" ALTER COLUMN "id" SET DEFAULT nextval(\'public.users_id_seq\');')

      expect(usersIndex).toBeGreaterThanOrEqual(0)
      expect(settingsIndex).toBeGreaterThan(usersIndex)
      expect(sequenceIndex).toBeGreaterThan(settingsIndex)
      expect(defaultIndex).toBeGreaterThan(sequenceIndex + conditionalSource.length)
      expect(content.slice(usersIndex, sequenceIndex)).not.toContain('DEFAULT')
      expect(content).toContain('ALTER TABLE "public"."users" ALTER COLUMN "active" SET DEFAULT false;')
      expect(content).toContain('ALTER TABLE "public"."settings" ALTER COLUMN "value" SET DEFAULT 1;')
      expect(content).not.toContain('ALTER SEQUENCE public.users_id_seq OWNED BY')
    }

    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(bundle.sql.ddl.content)).not.toThrow()
  })

  it('terminates deferred standalone ownership when the source omits its final semicolon', () => {
    const model = parsePgml(`Sequence users_id_seq {
  source: $sql$
    CREATE SEQUENCE public.users_id_seq;
    ALTER SEQUENCE IF EXISTS public.users_id_seq OWNED BY public.users.id
  $sql$
}
Table users {
  id bigint
}`)
    const content = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' }).sql.ddl.content

    expect(content.indexOf('ALTER SEQUENCE IF EXISTS public.users_id_seq OWNED BY public.users.id\n;'))
      .toBeGreaterThan(content.indexOf('CREATE TABLE "public"."users"'))
  })

  it('leaves source ownership-like text unchanged outside recognized sequence clauses', () => {
    const model = parsePgml('Sequence raw_sequence {\n  start: 1\n}')
    const sequence = model.sequences[0]

    if (!sequence) {
      throw new Error('Expected a sequence fixture')
    }

    const source = `CREATE TEMPORARY SEQUENCE public.raw_sequence CACHE 5;\nCOMMENT ON SEQUENCE public.raw_sequence IS 'OWNED BY public.users.id;';\nSELECT $$OWNED BY public.users.id;$$;\nALTER TABLE public.users OWNER TO someone;`
    sequence.source = source

    expect(buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' }).sql.ddl.content).toContain(source)
  })

  it.each([
    String.raw`CREATE SEQUENCE U&"s\0065q" OWNED BY public.users.id;`,
    String.raw`CREATE SEQUENCE public.s OWNED BY public.U&"us\0065rs".id;`,
    String.raw`CREATE SEQUENCE U&"s!0065q" UESCAPE '!' OWNED BY public.users.id;`
  ])('preserves raw Unicode sequence SQL after creating its owning table: %s', async (source) => {
    const model = parsePgml('Sequence s {\n start: 1\n}\nTable users {\n id bigint\n}')
    const sequence = model.sequences[0]

    if (!sequence) {
      throw new Error('Expected a sequence fixture')
    }

    sequence.source = source
    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content]) {
      expect(content).toContain(source)
      expect(content.indexOf(source)).toBeGreaterThan(content.indexOf('CREATE TABLE "public"."users"'))
    }

    const escapedSource = source.replaceAll('\\', '\\\\')
    expect(bundle.kysely.migration.content).toContain(escapedSource)
    expect(bundle.kysely.migration.content.indexOf(escapedSource))
      .toBeGreaterThan(bundle.kysely.migration.content.indexOf('CREATE TABLE "public"."users"'))

    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(bundle.sql.ddl.content)).not.toThrow()
  })

  it('defers modeled DEFAULT and CHECK dependencies while retaining non-value table clauses', () => {
    const model = parsePgml(`Sequence s {
  source: $sql$
    CREATE SEQUENCE IF NOT EXISTS public.s OWNED BY public.users.id;
  $sql$
}
Table users {
  id bigint [pk, not null, unique, default: nextval('public.s')]
  Constraint seq_exists: 'public.s'::regclass IS NOT NULL
  Constraint positive_id: check (id > 0)
  Constraint user_id_unique: unique (id)
}`)
    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]) {
      const tableIndex = content.indexOf('CREATE TABLE "public"."users"')
      const sequenceIndex = content.indexOf('CREATE SEQUENCE IF NOT EXISTS public.s OWNED BY public.users.id;')
      const tableSource = content.slice(tableIndex, sequenceIndex)

      expect(tableSource).toContain('"id" bigint NOT NULL UNIQUE PRIMARY KEY')
      expect(tableSource).toContain('CONSTRAINT "user_id_unique" unique (id)')
      expect(tableSource).not.toContain('DEFAULT')
      expect(tableSource).not.toContain('CHECK')
      expect(tableSource).not.toContain('check')
      expect(content.indexOf('ALTER TABLE "public"."users" ALTER COLUMN "id" SET DEFAULT nextval(\'public.s\');')).toBeGreaterThan(sequenceIndex)
      expect(content.indexOf('ALTER TABLE "public"."users" ADD CONSTRAINT "seq_exists" CHECK (\'public.s\'::regclass IS NOT NULL);')).toBeGreaterThan(sequenceIndex)
      expect(content.indexOf('ALTER TABLE "public"."users" ADD CONSTRAINT "positive_id" check (id > 0);')).toBeGreaterThan(sequenceIndex)
    }
  })

  it.each(['-- retained note', '-- retained note;'])('separates raw sequence SQL from following statements outside EOF comments: %s', async (comment) => {
    const source = `CREATE SEQUENCE public.s;\nALTER SEQUENCE public.s OWNED BY public.users.id ${comment}`
    const model = parsePgml(`Sequence s {
  source: $sql$
${source}
  $sql$
}
Table users {
  id bigint
  Indexes {
    id [name: users_id_idx]
  }
}`)
    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })

    expect(bundle.sql.ddl.content).toContain(`${source}\n;`)
    const parser = await initializePgmlExecutableParser(17)
    expect(() => parser.parseSync(bundle.sql.ddl.content)).not.toThrow()
    expect(() => parser.parseSync(bundle.sql.migration.content)).not.toThrow()
  })

  it('separates raw routines and triggers from following SQL without interpreting source comments', async () => {
    const model = parsePgml(`Table users {
  id bigint
}
Function first_value() returns integer {
  source: $sql$
CREATE FUNCTION public.first_value() RETURNS integer LANGUAGE sql AS $$ SELECT 1; $$ -- note;
  $sql$
}
Function before_insert() returns trigger {
  source: $sql$
CREATE FUNCTION public.before_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
  $sql$
}
Procedure do_nothing() {
  source: $sql$
CREATE PROCEDURE public.do_nothing() LANGUAGE sql AS $$ SELECT 1; $$ -- note
  $sql$
}
Trigger users_before_insert on public.users {
  source: $sql$
CREATE TRIGGER users_before_insert BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.before_insert() -- note;
  $sql$
}`)
    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })
    const parser = await initializePgmlExecutableParser(17)

    expect(bundle.sql.ddl.content).toContain('$$ -- note;\n;')
    expect(bundle.sql.ddl.content).toContain('$$ -- note\n;')
    expect(bundle.sql.ddl.content).toContain('public.before_insert() -- note;\n;')
    expect(() => parser.parseSync(bundle.sql.ddl.content)).not.toThrow()
    expect(() => parser.parseSync(bundle.sql.migration.content)).not.toThrow()
  })

  it('preserves imported expression index keys alongside quoted column keys', () => {
    const imported = convertPgDumpToPgml({
      sql: `CREATE TABLE public.users (email text, tenant_id uuid);
CREATE INDEX users_lower_email_idx ON public.users USING btree (tenant_id, lower(email));
CREATE INDEX users_email_idx ON public.users USING btree (email);`
    })
    const bundle = buildPgmlExportBundle(parsePgml(imported.pgml), {
      kyselyTypeStyle: 'pragmatic'
    })

    for (const content of [bundle.sql.ddl.content, bundle.sql.migration.content, bundle.kysely.migration.content]) {
      expect(content).toContain('CREATE INDEX "users_lower_email_idx" ON "public"."users" USING btree ("tenant_id", lower(email));')
      expect(content).toContain('CREATE INDEX "users_email_idx" ON "public"."users" USING btree ("email");')
      expect(content).not.toContain('"lower(email)"')
    }
  })

  it('quotes known index columns whose names contain spaces, reserved words or expression syntax', () => {
    const model = parsePgml('Table users {\n  name text\n  select text\n  expression text\n}')

    model.tables.forEach((table) => {
      table.columns.forEach((column) => {
        if (column.name === 'name') {
          column.name = 'display name'
        }

        if (column.name === 'expression') {
          column.name = 'lower(email)'
        }
      })
      table.indexes.push({
        columns: ['display name', 'select', 'lower(email)'],
        name: 'users_names_idx',
        tableName: table.fullName,
        type: 'btree'
      })
    })

    const bundle = buildPgmlExportBundle(model, { kyselyTypeStyle: 'pragmatic' })

    expect(bundle.sql.ddl.content).toContain('CREATE INDEX "users_names_idx" ON "public"."users" USING btree ("display name", "select", "lower(email)");')
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
