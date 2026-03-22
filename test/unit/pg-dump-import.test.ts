import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import {
  convertPgDumpToPgml,
  derivePgDumpSchemaName
} from '../../app/utils/pg-dump-import'

describe('pg_dump import utilities', () => {
  it('converts text pg_dump SQL into PGML schema objects that the studio can parse', () => {
    const sql = `CREATE TYPE public.role_kind AS ENUM ('owner', 'analyst');
CREATE DOMAIN public.email_address AS text CHECK ((VALUE <> ''::text));
CREATE TABLE public.users (
  id uuid NOT NULL,
  tenant_id uuid,
  email public.email_address NOT NULL,
  role public.role_kind NOT NULL
);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.users ADD CONSTRAINT users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);
CREATE INDEX idx_users_email ON public.users USING btree (email);
CREATE SEQUENCE public.user_number_seq AS bigint START WITH 1000 INCREMENT BY 1;
ALTER SEQUENCE public.user_number_seq OWNED BY public.users.id;
CREATE FUNCTION public.touch_users() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_touch_users BEFORE INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_users();
COPY public.users (id) FROM stdin;
ignored
\\.`
    const result = convertPgDumpToPgml({
      preferredName: 'users-export.sql',
      sql
    })
    const model = parsePgml(result.pgml)

    expect(result.schemaName).toBe('users-export')
    expect(result.pgml).toContain('// Imported from a text pg_dump.')
    expect(model.tables.find(table => table.fullName === 'public.users')?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modifiers: expect.arrayContaining(['pk']),
        name: 'id',
        type: 'uuid'
      }),
      expect.objectContaining({
        modifiers: expect.arrayContaining(['ref: > public.tenants.id']),
        name: 'tenant_id'
      })
    ]))
    expect(model.tables.find(table => table.fullName === 'public.users')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['email'],
        name: 'idx_users_email',
        type: 'btree'
      })
    ]))
    expect(model.customTypes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'Enum',
        name: 'public.role_kind',
        values: ['owner', 'analyst']
      }),
      expect.objectContaining({
        baseType: 'text',
        kind: 'Domain',
        name: 'public.email_address'
      })
    ]))
    expect(model.sequences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({ key: 'owned_by', value: 'public.users.id' }),
          expect.objectContaining({ key: 'start', value: '1000' })
        ]),
        name: 'public.user_number_seq'
      })
    ]))
    expect(model.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({ key: 'language', value: 'plpgsql' })
        ]),
        signature: 'public.touch_users() returns trigger'
      })
    ]))
    expect(model.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'trg_touch_users',
        tableName: 'public.users'
      })
    ]))
  })

  it('derives imported schema names and rejects dumps without schema objects', () => {
    expect(derivePgDumpSchemaName('  finance-schema.dump  ')).toBe('finance-schema')
    expect(derivePgDumpSchemaName()).toBe('Imported schema')

    expect(() => {
      convertPgDumpToPgml({
        sql: 'SET statement_timeout = 0; COPY public.users (id) FROM stdin;\nvalue\n\\.'
      })
    }).toThrow('No importable schema objects were found in that pg_dump.')
  })
})
