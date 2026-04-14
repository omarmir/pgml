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

  it('imports quoted ALTER TABLE foreign keys as relations while preserving delete actions', () => {
    const sql = `CREATE TABLE public."Agency_Profile" (
  id bigint NOT NULL
);
CREATE TABLE public."Transfer_Payment_Profile" (
  id bigint NOT NULL,
  egcs_tp_agency bigint NOT NULL
);
ALTER TABLE ONLY public."Agency_Profile"
  ADD CONSTRAINT "Agency_Profile_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."Transfer_Payment_Profile"
  ADD CONSTRAINT "Transfer_Payment_Profile_pkey" PRIMARY KEY (id);
ALTER TABLE ONLY public."Transfer_Payment_Profile"
  ADD CONSTRAINT "Transfer_Payment_Profile_egcs_tp_agency_fkey" FOREIGN KEY (egcs_tp_agency) REFERENCES public."Agency_Profile"(id) ON DELETE RESTRICT;`
    const result = convertPgDumpToPgml({ sql })
    const model = parsePgml(result.pgml)
    const table = model.tables.find(currentTable => currentTable.fullName === 'public.Transfer_Payment_Profile')

    expect(result.pgml).toContain('egcs_tp_agency bigint [not null, ref: > public.Agency_Profile.id, delete: restrict]')
    expect(table?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modifiers: expect.arrayContaining(['ref: > public.Agency_Profile.id', 'delete: restrict']),
        name: 'egcs_tp_agency'
      })
    ]))
    expect(model.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        fromColumn: 'egcs_tp_agency',
        fromTable: 'public.Transfer_Payment_Profile',
        onDelete: 'restrict',
        onUpdate: null,
        relation: '>',
        toColumn: 'id',
        toTable: 'public.Agency_Profile'
      })
    ]))
    expect(table?.constraints).toEqual([])
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

  it('optionally folds imported pg_dump identifiers to lowercase', () => {
    const sql = `CREATE TYPE public."Agreement_Type" AS ENUM ('pending');
CREATE TABLE public."Agency_Agreement_Type" (
  "EGCS_AY_AgreementType" public."Agreement_Type" NOT NULL
);`
    const result = convertPgDumpToPgml({
      foldIdentifiersToLowercase: true,
      sql
    })

    expect(result.pgml).toContain(`Enum public.agreement_type {
  pending
}`)
    expect(result.pgml).toContain(`Table public.agency_agreement_type {
  egcs_ay_agreementtype public.agreement_type [not null]
}`)
  })

  it('imports partial pg_dump indexes without swallowing WHERE predicates into the indexed column list', () => {
    const sql = `CREATE TABLE public."Agency_Profile" (
  id bigint NOT NULL,
  egcs_ay_name_en text,
  egcs_ay_name_fr text,
  _deleted boolean
);
CREATE UNIQUE INDEX ay_idx_profilenameen ON public."Agency_Profile" USING btree (egcs_ay_name_en) WHERE (_deleted = false);
CREATE UNIQUE INDEX ay_idx_profilenamefr ON public."Agency_Profile" USING btree (egcs_ay_name_fr) WHERE ((_deleted = false) AND (egcs_ay_name_fr IS NOT NULL));`
    const result = convertPgDumpToPgml({ sql })
    const model = parsePgml(result.pgml)
    const table = model.tables.find(currentTable => currentTable.fullName === 'public.Agency_Profile')

    expect(result.pgml).toContain('Index ay_idx_profilenameen (egcs_ay_name_en) [type: btree]')
    expect(result.pgml).toContain('Index ay_idx_profilenamefr (egcs_ay_name_fr) [type: btree]')
    expect(table?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['egcs_ay_name_en'],
        name: 'ay_idx_profilenameen',
        type: 'btree'
      }),
      expect.objectContaining({
        columns: ['egcs_ay_name_fr'],
        name: 'ay_idx_profilenamefr',
        type: 'btree'
      })
    ]))
  })

  it('imports pg_dump expression indexes through structured Indexes blocks when inline PGML syntax cannot represent them', () => {
    const sql = `CREATE TABLE public."Transfer_Payment_Objective" (
  id bigint NOT NULL,
  egcs_tp_transferpaymentprofile bigint NOT NULL,
  egcs_tp_objective_en text,
  _deleted boolean
);
CREATE UNIQUE INDEX tp_idx_objectivetransferpaymentprofileobjectiveen ON public."Transfer_Payment_Objective" USING btree (egcs_tp_transferpaymentprofile, md5(lower(egcs_tp_objective_en))) WHERE (_deleted = false);`
    const result = convertPgDumpToPgml({ sql })
    const model = parsePgml(result.pgml)
    const table = model.tables.find(currentTable => currentTable.fullName === 'public.Transfer_Payment_Objective')

    expect(result.pgml).toContain('  Indexes {')
    expect(result.pgml).toContain('    (egcs_tp_transferpaymentprofile, md5(lower(egcs_tp_objective_en))) [name: tp_idx_objectivetransferpaymentprofileobjectiveen, type: btree]')
    expect(table?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['egcs_tp_transferpaymentprofile', 'md5(lower(egcs_tp_objective_en))'],
        name: 'tp_idx_objectivetransferpaymentprofileobjectiveen',
        type: 'btree'
      })
    ]))
  })

  it('canonicalizes built-in type aliases during pg_dump import', () => {
    const sql = `CREATE TABLE public."Agency_Profile" (
  name character varying(255) NOT NULL,
  submitted_at timestamp without time zone
);`
    const result = convertPgDumpToPgml({ sql })

    expect(result.pgml).toContain(`Table public.Agency_Profile {
  name varchar(255) [not null]
  submitted_at timestamp
}`)
  })

  it('canonicalizes sequence-backed defaults and modifier ordering during pg_dump import', () => {
    const sql = `CREATE TABLE public."Agency_Cost_Category_Line_Item" (
  id bigint DEFAULT nextval('public."Agency_Cost_Category_Line_Item_id_seq"'::regclass) NOT NULL
);
ALTER TABLE ONLY public."Agency_Cost_Category_Line_Item"
  ADD CONSTRAINT "Agency_Cost_Category_Line_Item_pkey" PRIMARY KEY (id);`
    const result = convertPgDumpToPgml({ sql })

    expect(result.pgml).toContain(`Table public.Agency_Cost_Category_Line_Item {
  id bigint [pk, not null, default: nextval('public.Agency_Cost_Category_Line_Item_id_seq')]
}`)
  })

  it('canonicalizes quoted sequence ownership identifiers derived from pg_dump source', () => {
    const sql = `CREATE TABLE public."Transfer_Payment_Stream_Area_of_Expertise" (
  id bigint NOT NULL
);
ALTER TABLE ONLY public."Transfer_Payment_Stream_Area_of_Expertise"
  ADD CONSTRAINT "Transfer_Payment_Stream_Area_of_Expertise_pkey" PRIMARY KEY (id);
CREATE SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq";
ALTER SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq"
  OWNED BY public."Transfer_Payment_Stream_Area_of_Expertise".id;`
    const result = convertPgDumpToPgml({
      foldIdentifiersToLowercase: true,
      sql
    })
    const model = parsePgml(result.pgml)

    expect(model.sequences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({
            key: 'owned_by',
            value: 'public.transfer_payment_stream_area_of_expertise.id'
          })
        ]),
        name: 'public.transfer_payment_stream_area_of_expertise_id_seq'
      })
    ]))
  })

  it('renders serial-style pg_dump sequences as structured PGML without default-only sequence clauses', () => {
    const sql = `CREATE TABLE public."Common_Review_Set" (
  id bigint DEFAULT nextval('public."Common_Review_Set_id_seq"'::regclass) NOT NULL
);
ALTER TABLE ONLY public."Common_Review_Set"
  ADD CONSTRAINT "Common_Review_Set_pkey" PRIMARY KEY (id);
CREATE SEQUENCE public."Common_Review_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public."Common_Review_Set_id_seq"
  OWNED BY public."Common_Review_Set".id;`
    const result = convertPgDumpToPgml({ sql })
    const model = parsePgml(result.pgml)

    expect(result.pgml).toContain(`Sequence public.Common_Review_Set_id_seq {
  as: bigint
  owned_by: public.Common_Review_Set.id
}`)
    expect(result.pgml).not.toContain('source: $sql$')
    expect(result.pgml).not.toContain('start:')
    expect(result.pgml).not.toContain('increment:')
    expect(result.pgml).not.toContain('min:')
    expect(result.pgml).not.toContain('max:')
    expect(result.pgml).not.toContain('cache:')
    expect(model.sequences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: [
          { key: 'as', value: 'bigint' },
          { key: 'owned_by', value: 'public.Common_Review_Set.id' }
        ],
        name: 'public.Common_Review_Set_id_seq',
        source: null
      })
    ]))
  })
})
