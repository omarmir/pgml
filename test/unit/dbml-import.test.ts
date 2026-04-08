import { describe, expect, it } from 'vitest'

import { convertDbmlToPgml, deriveDbmlSchemaName } from '../../app/utils/dbml-import'
import { parsePgml } from '../../app/utils/pgml'

describe('DBML import utilities', () => {
  it('converts DBML-like schema blocks into importable PGML and strips Project metadata', () => {
    const result = convertDbmlToPgml({
      dbml: `Project commerce {
  database_type: 'PostgreSQL'
}

Table users {
  id uuid [pk]
  email text [unique]
}

Table orders {
  id uuid [pk]
  user_id uuid
}

Ref: users.id < orders.user_id`
    })

    const model = parsePgml(result.pgml)

    expect(result.schemaName).toBe('commerce')
    expect(result.pgml).toContain('// Imported from DBML.')
    expect(result.pgml).not.toContain('Project commerce')
    expect(result.pgml).toContain('Table public.users {')
    expect(result.pgml).toContain('Table public.orders {')
    expect(result.pgml).toContain('Ref: public.users.id < public.orders.user_id')
    expect(model.tables.map(table => table.name)).toEqual(['users', 'orders'])
    expect(model.references).toHaveLength(1)
  })

  it('derives imported schema names from the preferred file name when there is no Project block', () => {
    expect(deriveDbmlSchemaName({
      preferredName: 'billing.dbml'
    })).toBe('billing')
  })

  it('normalizes serial pseudo-types into explicit sequence-backed PGML columns', () => {
    const result = convertDbmlToPgml({
      dbml: `Table orders {
  id bigserial [pk, not null] // System ID
  item_id serial [not null]
}`
    })

    expect(result.pgml).toContain(`Sequence public.orders_id_seq {
  as: bigint
  owned_by: public.orders.id
}`)
    expect(result.pgml).toContain(`Sequence public.orders_item_id_seq {
  as: integer
  owned_by: public.orders.item_id
}`)
    expect(result.pgml).toContain(`id bigint [pk, not null, default: nextval('public.orders_id_seq')] // System ID`)
    expect(result.pgml).toContain(`item_id integer [not null, default: nextval('public.orders_item_id_seq')]`)

    const model = parsePgml(result.pgml)

    expect(model.sequences.map(sequence => sequence.name)).toEqual([
      'public.orders_id_seq',
      'public.orders_item_id_seq'
    ])
    expect(model.tables.find(table => table.fullName === 'public.orders')?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modifiers: expect.arrayContaining([`default: nextval('public.orders_id_seq')`]),
        name: 'id',
        type: 'bigint'
      }),
      expect.objectContaining({
        modifiers: expect.arrayContaining([`default: nextval('public.orders_item_id_seq')`]),
        name: 'item_id',
        type: 'integer'
      })
    ]))
  })

  it('rejects DBML that does not contain importable schema objects', () => {
    expect(() => {
      convertDbmlToPgml({
        dbml: `Project blank {
  database_type: 'PostgreSQL'
}`
      })
    }).toThrow('No importable schema objects were found in that DBML.')
  })

  it('canonicalizes imported DBML type references to schema-qualified PGML names', () => {
    const result = convertDbmlToPgml({
      dbml: `Enum Agreement_Type {
  pending
  approved
}

Table Agency_Agreement_Type {
  egcs_ay_agreementtype Agreement_Type [not null]
}`
    })

    expect(result.pgml).toContain(`Enum public.Agreement_Type {
  pending
  approved
}`)
    expect(result.pgml).toContain(`Table public.Agency_Agreement_Type {
  egcs_ay_agreementtype public.Agreement_Type [not null]
}`)
  })

  it('canonicalizes built-in type aliases during DBML import', () => {
    const result = convertDbmlToPgml({
      dbml: `Table Agency_Profile {
  name character varying(255) [not null]
  submitted_at timestamp without time zone
}`
    })

    expect(result.pgml).toContain(`Table public.Agency_Profile {
  name varchar(255) [not null]
  submitted_at timestamp
}`)
  })

  it('optionally folds imported DBML identifiers to lowercase', () => {
    const result = convertDbmlToPgml({
      dbml: `Enum Agreement_Type {
  pending
}

Table Agency_Profile {
  ID uuid [pk]
}

Table Agency_Agreement_Type {
  EGCS_AY_AgreementType Agreement_Type [not null, ref: > Agency_Profile.ID]
}`,
      foldIdentifiersToLowercase: true
    })

    expect(result.pgml).toContain(`Enum public.agreement_type {
  pending
}`)
    expect(result.pgml).toContain(`Table public.agency_profile {
  id uuid [pk]
}`)
    expect(result.pgml).toContain(`Table public.agency_agreement_type {
  egcs_ay_agreementtype public.agreement_type [not null, ref: > public.agency_profile.id]
}`)
  })

  it('keeps executable SQL inside DBML comments untouched when comment parsing is disabled', () => {
    const result = convertDbmlToPgml({
      dbml: `Table accounts {
  id uuid [pk]
  email text
}

/*
Function: audit_accounts
Reference: Captures account writes
----------------------------------
CREATE FUNCTION audit_accounts() RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/`
    })

    expect(result.pgml).toContain('Function: audit_accounts')
    expect(result.pgml).not.toContain('Function public.audit_accounts() returns trigger')

    const model = parsePgml(result.pgml)

    expect(model.functions).toHaveLength(0)
  })

  it('optionally extracts executable SQL entities from DBML block comments and carries context into notes', () => {
    const result = convertDbmlToPgml({
      dbml: `Table accounts {
  id uuid [pk]
  email text
}

/*
Index: idx_accounts_email
Reference: Speeds up account lookup by email
--------------------------------------------
CREATE INDEX idx_accounts_email ON accounts USING btree (email);
*/

/*
Function: audit_accounts
Reference: Captures account writes
----------------------------------
CREATE FUNCTION audit_accounts() RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/

/*
Trigger: trg_accounts_audit
Reference: Runs the audit helper for inserts
--------------------------------------------
CREATE TRIGGER trg_accounts_audit
  AFTER INSERT ON accounts
  FOR EACH ROW
  EXECUTE FUNCTION audit_accounts();
audit_accounts
*/`,
      parseExecutableComments: true
    })

    expect(result.pgml).not.toContain('Function: audit_accounts')
    expect(result.pgml).toContain('Index idx_accounts_email (email) [type: btree, note: Speeds up account lookup by email]')
    expect(result.pgml).toContain('Function public.audit_accounts() returns trigger {')
    expect(result.pgml).toContain('  note: "Captures account writes"')
    expect(result.pgml).toContain('Trigger trg_accounts_audit on public.accounts {')
    expect(result.pgml).toContain('  note: "Runs the audit helper for inserts"')

    const model = parsePgml(result.pgml)

    expect(model.tables.find(table => table.fullName === 'public.accounts')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        columns: ['email'],
        name: 'idx_accounts_email',
        type: 'btree'
      })
    ]))
    expect(model.functions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({
            key: 'note',
            value: 'Captures account writes'
          })
        ]),
        name: 'public.audit_accounts'
      })
    ]))
    expect(model.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({
            key: 'note',
            value: 'Runs the audit helper for inserts'
          })
        ]),
        name: 'trg_accounts_audit',
        tableName: 'public.accounts'
      })
    ]))
  })

  it('extracts sequence and procedure SQL from DBML block comments when the option is enabled', () => {
    const result = convertDbmlToPgml({
      dbml: `Table accounts {
  id bigint [pk]
}

/*
Sequence: account_id_seq
Reference: Allocates imported account ids
-----------------------------------------
CREATE SEQUENCE account_id_seq
  AS bigint
  START WITH 1000;
ALTER SEQUENCE account_id_seq OWNED BY accounts.id;
*/

/*
Procedure: archive_accounts
Reference: Archives stale accounts
----------------------------------
CREATE PROCEDURE archive_accounts(retention_days integer)
LANGUAGE plpgsql
AS $$
BEGIN
  NULL;
END;
$$;
*/`,
      parseExecutableComments: true
    })

    expect(result.pgml).toContain('Sequence public.account_id_seq {')
    expect(result.pgml).toContain('  note: "Allocates imported account ids"')
    expect(result.pgml).toContain('CREATE SEQUENCE account_id_seq')
    expect(result.pgml).toContain('ALTER SEQUENCE account_id_seq OWNED BY accounts.id;')
    expect(result.pgml).toContain('Procedure public.archive_accounts(retention_days integer) {')
    expect(result.pgml).not.toContain('Procedure: archive_accounts')

    const model = parsePgml(result.pgml)

    expect(model.sequences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({
            key: 'note',
            value: 'Allocates imported account ids'
          })
        ]),
        name: 'public.account_id_seq'
      })
    ]))
    expect(model.procedures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        metadata: expect.arrayContaining([
          expect.objectContaining({
            key: 'note',
            value: 'Archives stale accounts'
          })
        ]),
        name: 'public.archive_accounts'
      })
    ]))
  })

  it('replaces parsed executable comment blocks in place instead of moving them to the end of the import', () => {
    const result = convertDbmlToPgml({
      dbml: `Table alpha {
  id uuid [pk]
}

/*
Function: fn_middle
Reference: Keep this in place
----------------------------------
CREATE FUNCTION fn_middle() RETURNS trigger AS $$
BEGIN
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
*/

Table omega {
  id uuid [pk]
}`,
      parseExecutableComments: true
    })

    const alphaIndex = result.pgml.indexOf('Table public.alpha {')
    const functionIndex = result.pgml.indexOf('Function public.fn_middle() returns trigger {')
    const omegaIndex = result.pgml.indexOf('Table public.omega {')

    expect(alphaIndex).toBeGreaterThanOrEqual(0)
    expect(functionIndex).toBeGreaterThan(alphaIndex)
    expect(omegaIndex).toBeGreaterThan(functionIndex)
  })
})
