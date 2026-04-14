export const semanticSqlFunctionBaseline = `CREATE FUNCTION public.calc_total(
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
$$;`

export const semanticSqlFunctionEquivalent = `create function public.calc_total(
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
language sql;`

export const semanticSqlFunctionChanged = `CREATE FUNCTION public.calc_total(
  IN account_id uuid,
  IN include_archived boolean DEFAULT false,
  OUT total numeric
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount), 1)::numeric
  FROM public.invoice_lines
  WHERE invoice_lines.account_id = account_id
    AND (include_archived OR invoice_lines.archived_at IS NULL)
$$;`

export const semanticPlpgsqlFunctionBaseline = `CREATE OR REPLACE FUNCTION public.touch_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;`

export const semanticPlpgsqlFunctionEquivalent = `create or replace function public.touch_users()
returns trigger
as $fn$
-- formatting-only noise
begin
  new.updated_at := now();
  return new;
end;
$fn$
security definer
language plpgsql;`

export const semanticTriggerBaseline = `CREATE TRIGGER trg_accounts_audit
AFTER UPDATE OF email, status OR INSERT ON public.accounts
REFERENCING NEW TABLE AS new_rows
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.audit_account_change('status-change');`

export const semanticTriggerEquivalent = `create trigger trg_accounts_audit
after insert or update of status, email on public.accounts
referencing new table as new_rows
for each row
when ((new.status is distinct from old.status))
execute procedure public.audit_account_change('status-change');`

export const semanticTriggerChanged = `CREATE TRIGGER trg_accounts_audit
AFTER UPDATE OF email, status OR INSERT ON public.accounts
REFERENCING NEW TABLE AS new_rows
FOR EACH ROW
WHEN (NEW.email IS DISTINCT FROM OLD.email)
EXECUTE FUNCTION public.audit_account_change('status-change');`

export const semanticSequenceBaseline = `CREATE SEQUENCE public.user_number_seq
  AS bigint
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1
  NO CYCLE;
ALTER SEQUENCE public.user_number_seq OWNED BY public.users.id;`

export const semanticSequenceEquivalent = `alter sequence public.user_number_seq owned by public."users".id;
create sequence public.user_number_seq
  cache 1
  increment by 1
  start with 1
  as int8;`

export const semanticSequenceChanged = `CREATE SEQUENCE public.user_number_seq
  AS bigint
  START WITH 5
  INCREMENT BY 1
  CACHE 1;
ALTER SEQUENCE public.user_number_seq OWNED BY public.users.id;`

export const executableParserPortableCorpus = [
  semanticSqlFunctionBaseline,
  semanticPlpgsqlFunctionBaseline,
  semanticTriggerBaseline,
  semanticSequenceBaseline
] as const
