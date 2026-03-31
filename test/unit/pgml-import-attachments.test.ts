import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import {
  applyImportedExecutableAttachmentSelections,
  prepareImportedExecutableAttachments
} from '../../app/utils/pgml-import-attachments'

describe('PGML import executable attachment utilities', () => {
  it('promotes explicit import attachment metadata into executable affects blocks', () => {
    const prepared = prepareImportedExecutableAttachments(`Table public.accounts {
  id uuid [pk]
}

Function public.refresh_accounts() returns void {
  table: public.accounts

  source: $sql$
    CREATE FUNCTION public.refresh_accounts() RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    const model = parsePgml(prepared.pgml)
    const routine = model.functions.find(entry => entry.name === 'public.refresh_accounts')

    expect(prepared.candidates).toEqual([])
    expect(prepared.pgml).toContain('affects {')
    expect(prepared.pgml).toContain('owned_by: [public.accounts]')
    expect(prepared.pgml).not.toContain('\n  table: public.accounts\n')
    expect(routine?.affects?.ownedBy).toEqual(['public.accounts'])
  })

  it('uses trigger-linked routines as certain table attachments during import preparation', () => {
    const prepared = prepareImportedExecutableAttachments(`Table public.accounts {
  id uuid [pk]
}

Function public.audit_accounts() returns trigger {
  source: $sql$
    CREATE FUNCTION public.audit_accounts() RETURNS trigger AS $$
    BEGIN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_accounts_audit on public.accounts {
  source: $sql$
    CREATE TRIGGER trg_accounts_audit
      AFTER INSERT ON public.accounts
      FOR EACH ROW
      EXECUTE FUNCTION public.audit_accounts();
  $sql$
}`)
    const model = parsePgml(prepared.pgml)
    const routine = model.functions.find(entry => entry.name === 'public.audit_accounts')

    expect(prepared.candidates).toEqual([])
    expect(routine?.affects?.ownedBy).toEqual(['public.accounts'])
  })

  it('returns unattached executable imports as manual table-selection candidates', () => {
    const prepared = prepareImportedExecutableAttachments(`Table public.accounts {
  id uuid [pk]
}

Procedure public.archive_accounts(retention_days integer) {
  source: $sql$
    CREATE PROCEDURE public.archive_accounts(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NULL;
    END;
    $$;
  $sql$
}`)

    expect(prepared.tableOptions).toEqual([
      {
        label: 'public.accounts',
        value: 'public.accounts'
      }
    ])
    expect(prepared.candidates).toEqual([
      expect.objectContaining({
        id: 'procedure:public.archive_accounts',
        kind: 'Procedure',
        name: 'public.archive_accounts',
        selectedTableIds: []
      })
    ])
  })

  it('applies manual executable table selections through affects owned_by metadata', () => {
    const prepared = prepareImportedExecutableAttachments(`Table public.accounts {
  id uuid [pk]
}

Table public.audit_log {
  id uuid [pk]
}

Function public.archive_accounts() returns void {
  source: $sql$
    CREATE FUNCTION public.archive_accounts() RETURNS void AS $$
    BEGIN
      RETURN;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}`)
    const nextSource = applyImportedExecutableAttachmentSelections(prepared.pgml, prepared.candidates.map((candidate) => {
      return {
        ...candidate,
        selectedTableIds: ['public.accounts', 'public.audit_log']
      }
    }))
    const model = parsePgml(nextSource)
    const routine = model.functions.find(entry => entry.name === 'public.archive_accounts')

    expect(nextSource).toContain('owned_by: [public.accounts, public.audit_log]')
    expect(routine?.affects?.ownedBy).toEqual(['public.accounts', 'public.audit_log'])
  })
})
