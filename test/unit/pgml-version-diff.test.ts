import { beforeAll, describe, expect, it } from 'vitest'

import { buildPgmlWithNodeProperties, parsePgml } from '../../app/utils/pgml'
import { convertDbmlToPgml } from '../../app/utils/dbml-import'
import { diffPgmlSchemaModels } from '../../app/utils/pgml-diff'
import { convertPgDumpToPgml } from '../../app/utils/pg-dump-import'
import { initializePgmlExecutableParser } from '../../app/utils/pgml-executable-parser'
import { buildPgmlMigrationDiffBundle } from '../../app/utils/pgml-migration-diff'

const baseSnapshotSource = `Table public.users {
  id uuid [pk]
}`

describe('PGML version diffing', () => {
  beforeAll(async () => {
    await initializePgmlExecutableParser()
  })

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

  it('matches renamed indexes and constraints by material contents instead of reporting add/remove pairs', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.users {
  id uuid [pk]
  email text

  Index users_email_idx (email) [type: btree]
  Constraint users_email_chk: email <> ''
}`),
      parsePgml(`Table public.users {
  id uuid [pk]
  email text

  Index users_email_lookup_idx (email) [type: btree]
  Constraint users_email_present_chk: email <> ''
}`)
    )

    expect(diff.indexes).toEqual([
      expect.objectContaining({
        changes: ['name'],
        id: 'public.users::users_email_lookup_idx',
        kind: 'modified'
      })
    ])
    expect(diff.constraints).toEqual([
      expect.objectContaining({
        changes: ['name'],
        id: 'public.users::users_email_present_chk',
        kind: 'modified'
      })
    ])
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
    expect(diff.summary.modified).toBe(2)
  })

  it('matches renamed executable objects by material contents instead of reporting add/remove pairs', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Function public.refresh_users() returns void {
  source: $sql$
    select 1;
  $sql$
}

Procedure public.rebuild_users() {
  source: $sql$
    select 1;
  $sql$
}

Trigger users_touch on public.users {
  source: $sql$
    CREATE TRIGGER users_touch BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.touch_users();
  $sql$
}

Sequence public.users_id_seq {
  as: bigint
}`),
      parsePgml(`Function public.refresh_users_v2() returns void {
  source: $sql$
    select 1;
  $sql$
}

Procedure public.rebuild_users_v2() {
  source: $sql$
    select 1;
  $sql$
}

Trigger users_touch_v2 on public.users {
  source: $sql$
    CREATE TRIGGER users_touch_v2 BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION public.touch_users();
  $sql$
}

Sequence public.users_identity_seq {
  as: bigint
}`)
    )

    expect(diff.functions).toEqual([
      expect.objectContaining({
        changes: ['name', 'signature'],
        id: 'public.refresh_users_v2',
        kind: 'modified'
      })
    ])
    expect(diff.procedures).toEqual([
      expect.objectContaining({
        changes: ['name', 'signature'],
        id: 'public.rebuild_users_v2',
        kind: 'modified'
      })
    ])
    expect(diff.triggers).toEqual([
      expect.objectContaining({
        changes: ['name'],
        id: 'users::users_touch_v2',
        kind: 'modified'
      })
    ])
    expect(diff.sequences).toEqual([
      expect.objectContaining({
        changes: ['name'],
        id: 'public.users_identity_seq',
        kind: 'modified'
      })
    ])
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
    expect(diff.summary.modified).toBe(4)
  })

  it('suppresses equivalent composite refs and foreign-key constraints from compare output', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.Common_Approval_Template {
  id uuid [pk]
  egcs_cn_scopeid uuid
  egcs_cn_scopetype text
}

Table public.Common_Entity {
  id uuid [pk]
  egcs_cn_entitytype text
}

Ref cn_ref_approvaltemplatescopeidscopetype: public.Common_Approval_Template.(egcs_cn_scopeid, egcs_cn_scopetype) > public.Common_Entity.(id, egcs_cn_entitytype)`),
      parsePgml(`Table public.Common_Approval_Template {
  id uuid [pk]
  egcs_cn_scopeid uuid
  egcs_cn_scopetype text

  Constraint cn_ref_approvaltemplatescopeidscopetype: foreign key (egcs_cn_scopeid, egcs_cn_scopetype) references public.Common_Entity (id, egcs_cn_entitytype)
}

Table public.Common_Entity {
  id uuid [pk]
  egcs_cn_entitytype text
}`)
    )

    expect(diff.references).toEqual([])
    expect(diff.constraints).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
  })

  it('suppresses equivalent composite refs and foreign-key constraints when identifier casing differs', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table Common_Approval_Template {
  id uuid [pk]
  egcs_cn_scopeid uuid
  egcs_cn_scopetype text
}

Table Common_Entity {
  id uuid [pk]
  egcs_cn_entitytype text
}

Ref cn_ref_approvaltemplatescopeidscopetype: Common_Approval_Template.(egcs_cn_scopeid, egcs_cn_scopetype) > Common_Entity.(id, egcs_cn_entitytype)`),
      parsePgml(`Table public.common_approval_template {
  id uuid [pk]
  egcs_cn_scopeid uuid
  egcs_cn_scopetype text

  Constraint cn_ref_approvaltemplatescopeidscopetype: foreign key (egcs_cn_scopeid, egcs_cn_scopetype) references public.Common_Entity (id, egcs_cn_entitytype)
}

Table public.common_entity {
  id uuid [pk]
  egcs_cn_entitytype text
}`)
    )

    expect(diff.references).toEqual([])
    expect(diff.constraints).toEqual([])
  })

  it('suppresses equivalent enum-range constraint expressions across IN SELECT and = ANY forms', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.common_entity {
  egcs_cn_addresscountry countries
  egcs_cn_addresssubdivision text

  Constraint chk_common_entity_addresssubdivision: (egcs_cn_addresscountry = 'ca' AND egcs_cn_addresssubdivision::text IN (SELECT enum_range(NULL::Jurisdiction)::text)) OR (egcs_cn_addresscountry <> 'ca')
}`),
      parsePgml(`Table public.common_entity {
  egcs_cn_addresscountry countries
  egcs_cn_addresssubdivision text

  Constraint chk_common_entity_addresssubdivision: ((egcs_cn_addresscountry = 'ca'::public.countries) AND ((egcs_cn_addresssubdivision)::text = ANY ((enum_range(NULL::public.jurisdiction))::text[]))) OR (egcs_cn_addresscountry <> 'ca'::public.countries)
}`)
    )

    expect(diff.constraints).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(diff.summary.added).toBe(0)
    expect(diff.summary.removed).toBe(0)
  })

  it('ignores equivalent sequence ownership metadata when pg_dump source only differs by quoted identifiers', () => {
    const beforeModel = parsePgml(convertPgDumpToPgml({
      foldIdentifiersToLowercase: true,
      sql: `CREATE TABLE public.transfer_payment_stream_area_of_expertise (
  id bigint NOT NULL
);
ALTER TABLE ONLY public.transfer_payment_stream_area_of_expertise
  ADD CONSTRAINT transfer_payment_stream_area_of_expertise_pkey PRIMARY KEY (id);
CREATE SEQUENCE public.transfer_payment_stream_area_of_expertise_id_seq;
ALTER SEQUENCE public.transfer_payment_stream_area_of_expertise_id_seq
  OWNED BY public.transfer_payment_stream_area_of_expertise.id;`
    }).pgml)
    const afterModel = parsePgml(convertPgDumpToPgml({
      foldIdentifiersToLowercase: true,
      sql: `CREATE TABLE public."Transfer_Payment_Stream_Area_of_Expertise" (
  id bigint NOT NULL
);
ALTER TABLE ONLY public."Transfer_Payment_Stream_Area_of_Expertise"
  ADD CONSTRAINT "Transfer_Payment_Stream_Area_of_Expertise_pkey" PRIMARY KEY (id);
CREATE SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq";
ALTER SEQUENCE public."Transfer_Payment_Stream_Area_of_Expertise_id_seq"
  OWNED BY public."Transfer_Payment_Stream_Area_of_Expertise".id;`
    }).pgml)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.sequences).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores equivalent serial sequences between DBML and pg_dump imports when pg_dump only adds default sequence clauses', () => {
    const beforeModel = parsePgml(convertDbmlToPgml({
      dbml: `Table Common_Review_Set {
  id bigserial [pk, not null]
}`
    }).pgml)
    const afterModel = parsePgml(convertPgDumpToPgml({
      sql: `CREATE TABLE public."Common_Review_Set" (
  id bigint DEFAULT nextval('public."Common_Review_Set_id_seq"'::regclass) NOT NULL
);
ALTER TABLE ONLY public."Common_Review_Set"
  ADD CONSTRAINT "Common_Review_Set_pkey" PRIMARY KEY (id);
CREATE SEQUENCE public."Common_Review_Set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public."Common_Review_Set_id_seq"
  OWNED BY public."Common_Review_Set".id;`
    }).pgml)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.sequences).toEqual([])
    expect(diff.columns).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores source-backed sequence blocks when they only restate canonical serial sequence metadata', () => {
    const beforeModel = parsePgml(`Table public.common_review_set {
  id bigint [pk, not null, default: nextval('public.common_review_set_id_seq')]
}

Sequence public.common_review_set_id_seq {
  as: bigint
  owned_by: public.common_review_set.id
}`)
    const afterModel = parsePgml(`Table public.common_review_set {
  id bigint [pk, not null, default: nextval('public.common_review_set_id_seq')]
}

Sequence public.common_review_set_id_seq {
  source: $sql$
    CREATE SEQUENCE public."common_review_set_id_seq" AS bigint START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    ALTER SEQUENCE public."common_review_set_id_seq" OWNED BY public."common_review_set".id;
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.sequences).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores function source differences when only formatting, comments, dollar-quote tags, or clause order change', () => {
    const beforeModel = parsePgml(`Function public.touch_users() returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.touch_users() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RETURN NEW;
    END;
    $$;
  $sql$
}`)
    const afterModel = parsePgml(`Function public.touch_users() returns trigger {
  source: $sql$
    create or replace function public.touch_users()
    returns trigger
    as $fn$
    -- formatting-only change
    begin
      return new;
    end;
    $fn$
    language plpgsql;
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.functions).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores SQL function source differences when only clause order, type aliases, or SQL-body formatting change', () => {
    const beforeModel = parsePgml(`Function public.calc_total(account_id uuid, include_archived boolean) returns numeric {
  source: $sql$
    CREATE FUNCTION public.calc_total(
      IN account_id uuid,
      IN include_archived boolean DEFAULT false,
      OUT total numeric
    ) RETURNS numeric
    LANGUAGE sql
    STABLE
    SECURITY INVOKER
    SET search_path = public
    AS $$
      SELECT COALESCE(SUM(amount), 0)::numeric
      FROM public.invoice_lines
      WHERE invoice_lines.account_id = account_id
        AND (include_archived OR invoice_lines.archived_at IS NULL)
    $$;
  $sql$
}`)
    const afterModel = parsePgml(`Function public.calc_total(account_id uuid, include_archived boolean) returns numeric {
  source: $sql$
    create function public.calc_total(
      in account_id uuid,
      in include_archived bool default false,
      out total numeric
    ) returns numeric
    as $fn$
      select coalesce(sum(amount), 0)::numeric
      from public.invoice_lines
      where invoice_lines.account_id = account_id
        and (include_archived or invoice_lines.archived_at is null)
    $fn$
    set search_path = public
    security invoker
    stable
    language sql;
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.functions).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores trigger source differences when only formatting, event ordering, or execute syntax aliases change', () => {
    const beforeModel = parsePgml(`Trigger trg_touch_users on public.users {
  source: $sql$
    CREATE TRIGGER trg_touch_users
      BEFORE UPDATE OR INSERT ON public.users
      FOR EACH ROW
      EXECUTE FUNCTION public.touch_users();
  $sql$
}`)
    const afterModel = parsePgml(`Trigger trg_touch_users on public.users {
  source: $sql$
    create trigger trg_touch_users before insert or update on public.users
      for each row
      execute procedure public.touch_users();
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.triggers).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores trigger source differences when only update column ordering or when-clause formatting change', () => {
    const beforeModel = parsePgml(`Trigger trg_accounts_audit on public.accounts {
  source: $sql$
    CREATE TRIGGER trg_accounts_audit
      AFTER UPDATE OF email, status OR INSERT ON public.accounts
      REFERENCING NEW TABLE AS new_rows
      FOR EACH ROW
      WHEN (NEW.status IS DISTINCT FROM OLD.status)
      EXECUTE FUNCTION public.audit_account_change('status-change');
  $sql$
}`)
    const afterModel = parsePgml(`Trigger trg_accounts_audit on public.accounts {
  source: $sql$
    create trigger trg_accounts_audit
      after insert or update of status, email on public.accounts
      referencing new table as new_rows
      for each row
      when ((new.status is distinct from old.status))
      execute procedure public.audit_account_change('status-change');
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.triggers).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores trigger source differences when only public qualification and quoted identifiers change', () => {
    const beforeModel = parsePgml(`Trigger trg_register_applicantrecipient on Applicant_Recipient_Profile {
  source: $sql$
    CREATE TRIGGER trg_register_applicantrecipient
      BEFORE INSERT ON Applicant_Recipient_Profile
      FOR EACH ROW EXECUTE FUNCTION register_entity('applicantrecipient');
  $sql$
}`)
    const afterModel = parsePgml(`Trigger trg_register_applicantrecipient on public."Applicant_Recipient_Profile" {
  source: $sql$
    CREATE TRIGGER trg_register_applicantrecipient BEFORE INSERT ON public."Applicant_Recipient_Profile" FOR EACH ROW EXECUTE FUNCTION public.register_entity('applicantrecipient');
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.triggers).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores trigger source differences when only when-clause parentheses and public qualification change', () => {
    const beforeModel = parsePgml(`Trigger trg_cascade_routingslip_status on Common_Approval {
  source: $sql$
    CREATE TRIGGER trg_cascade_routingslip_status
      AFTER UPDATE OF egcs_cn_approvalvalue ON Common_Approval
      FOR EACH ROW
      WHEN (OLD.egcs_cn_approvalvalue IS DISTINCT FROM NEW.egcs_cn_approvalvalue)
      EXECUTE FUNCTION trg_fn_cascade_routingslip_status();
  $sql$
}`)
    const afterModel = parsePgml(`Trigger trg_cascade_routingslip_status on public."Common_Approval" {
  source: $sql$
    CREATE TRIGGER trg_cascade_routingslip_status AFTER UPDATE OF egcs_cn_approvalvalue ON public."Common_Approval" FOR EACH ROW WHEN ((old.egcs_cn_approvalvalue IS DISTINCT FROM new.egcs_cn_approvalvalue)) EXECUTE FUNCTION public.trg_fn_cascade_routingslip_status();
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.triggers).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
  })

  it('ignores sequence source differences when only default clauses, ordering, or quoted ownership differ', () => {
    const beforeModel = parsePgml(`Sequence public.user_number_seq {
  source: $sql$
    CREATE SEQUENCE public.user_number_seq
      AS bigint
      START WITH 1
      INCREMENT BY 1
      NO MINVALUE
      NO MAXVALUE
      CACHE 1
      NO CYCLE;
    ALTER SEQUENCE public.user_number_seq OWNED BY public.users.id;
  $sql$
}`)
    const afterModel = parsePgml(`Sequence public.user_number_seq {
  source: $sql$
    ALTER SEQUENCE public.user_number_seq OWNED BY public."users".id;
    CREATE SEQUENCE public.user_number_seq
      CACHE 1
      INCREMENT BY 1
      START WITH 1
      AS int8;
  $sql$
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.sequences).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.meta.statementCount).toBe(0)
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

  it('treats unqualified public custom type references as equivalent to explicit public schema references', () => {
    const beforeModel = parsePgml(`Enum public.review_status {
  draft
  approved
}

Table public.reviews {
  id uuid [pk]
  status review_status
}`)
    const afterModel = parsePgml(`Enum public.review_status {
  draft
  approved
}

Table public.reviews {
  id uuid [pk]
  status public.review_status
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.columns).toEqual([])
    expect(diff.customTypes).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.sql.migration.content).not.toContain('ALTER COLUMN "status" TYPE')
  })

  it('treats equivalent NOT IN and <> ALL array check expressions as the same constraint', () => {
    const beforeModel = parsePgml(`Table public.common_entity {
  id uuid [pk]
  entity_type public.Entity_Type
  Constraint chk_common_entity_type: entity_type NOT IN ('fundingopportunity', 'transferpaymentstream', 'fundingcaseintake', 'fundingcaseagreement', 'applicantrecipient')
}

Enum public.Entity_Type {
  fundingopportunity
  transferpaymentstream
  fundingcaseintake
  fundingcaseagreement
  applicantrecipient
}`)
    const afterModel = parsePgml(`Table public.common_entity {
  id uuid [pk]
  entity_type public.Entity_Type
  Constraint chk_common_entity_type: entity_type <> ALL (ARRAY['fundingopportunity'::public."Entity_Type", 'fundingcaseintake'::public."Entity_Type", 'fundingcaseagreement'::public."Entity_Type", 'applicantrecipient'::public."Entity_Type", 'transferpaymentstream'::public."Entity_Type"])
}

Enum public.Entity_Type {
  fundingopportunity
  transferpaymentstream
  fundingcaseintake
  fundingcaseagreement
  applicantrecipient
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.constraints).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
    expect(migrationBundle.sql.migration.content).not.toContain('DROP CONSTRAINT')
  })

  it('ignores explicit bigint sequence metadata when it only restates the default sequence type', () => {
    const beforeModel = parsePgml(`Sequence public.agency_address_type_id_seq {
  owned_by: public.agency_address_type.id
}`)
    const afterModel = parsePgml(`Sequence public.agency_address_type_id_seq {
  as: bigint
  owned_by: public.agency_address_type.id
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)
    const migrationBundle = buildPgmlMigrationDiffBundle(beforeModel, afterModel)

    expect(diff.sequences).toEqual([])
    expect(diff.summary.modified).toBe(0)
    expect(migrationBundle.meta.hasChanges).toBe(false)
  })

  it('ignores group membership reordering when the set of tables stays the same', () => {
    const beforeModel = parsePgml(`TableGroup Core {
  public.users
  public.orders
  public.audit_log
}

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}

Table public.audit_log {
  id uuid [pk]
}`)
    const afterModel = parsePgml(`TableGroup Core {
  public.audit_log
  public.users
  public.orders
}

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}

Table public.audit_log {
  id uuid [pk]
}`)
    const diff = diffPgmlSchemaModels(beforeModel, afterModel)

    expect(diff.groups).toEqual([])
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

  it('ignores source-range-only custom type movement and omits sourceRange from change keys', () => {
    const movedOnlyDiff = diffPgmlSchemaModels(
      parsePgml(`Enum public.order_status {
  draft
  approved
}`),
      parsePgml(`


Enum public.order_status {
  draft
  approved
}`)
    )

    expect(movedOnlyDiff.customTypes).toEqual([])
    expect(movedOnlyDiff.summary.modified).toBe(0)

    const changedEnumDiff = diffPgmlSchemaModels(
      parsePgml(`Enum public.order_status {
  draft
}`),
      parsePgml(`

Enum public.order_status {
  draft
  approved
}`)
    )

    expect(changedEnumDiff.customTypes).toEqual([
      expect.objectContaining({
        changes: expect.arrayContaining(['values']),
        id: 'Enum::public.order_status',
        kind: 'modified'
      })
    ])
    expect(changedEnumDiff.customTypes[0]?.changes).not.toContain('sourceRange')
  })

  it('suppresses column modifications when the only change is an inline reference projection', () => {
    const diff = diffPgmlSchemaModels(
      parsePgml(`Table public.common_entity {
  id uuid [pk]
}

Table public.common_review {
  id uuid [pk]
  entity_id uuid [not null]
}`),
      parsePgml(`Table public.common_entity {
  id uuid [pk]
}

Table public.common_review {
  id uuid [pk]
  entity_id uuid [not null, ref: > public.common_entity.id, delete: restrict]
}`)
    )

    expect(diff.columns).toEqual([])
    expect(diff.references).toEqual([
      expect.objectContaining({
        id: '>::public.common_review::entity_id::public.common_entity::id',
        kind: 'added'
      })
    ])
    expect(diff.summary.added).toBe(1)
    expect(diff.summary.modified).toBe(0)
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
