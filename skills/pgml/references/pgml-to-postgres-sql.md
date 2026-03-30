# PGML To PostgreSQL SQL

Use this file when the task is to turn PGML into SQL, plan SQL changes from PGML, or write application queries against a PGML-described schema.

## Choose The SQL Output Type First

Before writing SQL, classify the request into one of these output types:

- Full DDL: generate a complete schema creation script from PGML.
- Migration delta: describe or emit `ALTER` statements from an old PGML state to a new PGML state.
- Application query: write `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `CALL`, or `PERFORM` statements that operate on the schema described by PGML.
- Routine reuse: write SQL that calls an existing function or procedure already modeled in PGML.

If the request simply says "write SQL from this PGML", prefer full DDL unless surrounding context clearly asks for application queries or a migration.

## Full DDL Workflow

Follow this order:

1. Read all PGML blocks and normalize schema names.
2. Create custom types before any table depends on them.
3. Create sequences before any table default uses `nextval(...)`.
4. Create tables and columns.
5. Add check constraints, unique constraints, and foreign keys.
6. Create indexes.
7. Create functions and procedures.
8. Create triggers after the referenced trigger function exists.

This ordering fits the examples used in the repo and avoids most obvious dependency failures.

## Mapping Rules

### Enums

PGML:

```pgml
Enum role_kind {
  owner
  analyst
  operator
}
```

PostgreSQL:

```sql
CREATE TYPE role_kind AS ENUM ('owner', 'analyst', 'operator');
```

### Domains

PGML:

```pgml
Domain email_address {
  base: text
  check: VALUE ~* '^[^@]+@[^@]+\\.[^@]+$'
}
```

PostgreSQL:

```sql
CREATE DOMAIN email_address AS text
CHECK (VALUE ~* '^[^@]+@[^@]+\\.[^@]+$');
```

### Composite Types

PGML:

```pgml
Composite money_amount {
  amount numeric
  currency text
}
```

PostgreSQL:

```sql
CREATE TYPE money_amount AS (
  amount numeric,
  currency text
);
```

### Sequences

Prefer embedded `source:` when available. If only declarative metadata is present, construct SQL conservatively.

PGML:

```pgml
Sequence order_number_seq {
  source: $sql$
    CREATE SEQUENCE public.order_number_seq
      AS bigint
      START WITH 1200
      INCREMENT BY 1
      MINVALUE 1200
      CACHE 20
      OWNED BY public.orders.order_number;
  $sql$
}
```

PostgreSQL:

```sql
CREATE SEQUENCE public.order_number_seq
  AS bigint
  START WITH 1200
  INCREMENT BY 1
  MINVALUE 1200
  CACHE 20
  OWNED BY public.orders.order_number;
```

### Tables And Columns

PGML:

```pgml
Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  order_number bigint [not null, unique, default: nextval('order_number_seq')]
  status text [not null]
  total_cents integer [not null]
  Constraint chk_orders_total: total_cents >= 0
}
```

One reasonable PostgreSQL translation:

```sql
CREATE TABLE public.orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants (id),
  order_number bigint NOT NULL UNIQUE DEFAULT nextval('order_number_seq'),
  status text NOT NULL,
  total_cents integer NOT NULL,
  CONSTRAINT chk_orders_total CHECK (total_cents >= 0)
);
```

Translate known modifiers as follows:

- `pk` -> `PRIMARY KEY`
- `unique` -> `UNIQUE`
- `not null` -> `NOT NULL`
- `default: expr` -> `DEFAULT expr`
- `ref:` -> `REFERENCES ...`
- `delete: restrict|cascade|set null|set default|no action` -> `ON DELETE ...`
- `update: restrict|cascade|set null|set default|no action` -> `ON UPDATE ...`

If PGML includes both an inline `ref:` and a top-level `Ref:` for the same edge, emit only one foreign key definition.

### Indexes

PGML:

```pgml
Index idx_products_search (search) [type: gin]
```

PostgreSQL:

```sql
CREATE INDEX idx_products_search
ON public.products
USING gin (search);
```

If `type` is omitted, use `btree` or the default `CREATE INDEX ...` form.

### Constraints

PGML:

```pgml
Constraint chk_users_email: email <> ''
```

PostgreSQL:

```sql
CONSTRAINT chk_users_email CHECK (email <> '')
```

Prefer `CHECK` unless the task supplies stronger evidence that the expression should become a different constraint class.

### Functions, Procedures, And Triggers

When a block contains `source:`, prefer using that SQL verbatim. That is especially important for PL/pgSQL bodies, trigger semantics, volatility, and security options that may not be fully captured in terse metadata.

Function PGML:

```pgml
Function recalc_order_total(order_uuid uuid) returns void [replace] {
  affects {
    reads: [public.order_items.quantity, public.order_items.unit_price_cents]
    writes: [public.orders.total_cents]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.recalc_order_total(order_uuid uuid)
    RETURNS void AS $$
    BEGIN
      UPDATE public.orders
      SET total_cents = (
        SELECT COALESCE(SUM(quantity * unit_price_cents), 0)
        FROM public.order_items
        WHERE order_id = order_uuid
      )
      WHERE id = order_uuid;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}
```

Trigger PGML:

```pgml
Trigger trg_order_items_total_sync on public.order_items {
  source: $sql$
    CREATE TRIGGER trg_order_items_total_sync
      AFTER INSERT OR UPDATE OR DELETE ON public.order_items
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_order_total();
  $sql$
}
```

Use the embedded SQL as the emitted DDL unless the task explicitly asks for normalization or rewriting.

## Migration Delta Workflow

Only generate exact migration SQL when both the old and new PGML states are available. In versioned PGML, that usually means a selected base snapshot and target snapshot. If only one state exists, describe a likely migration plan instead of inventing a precise diff.

For a real diff:

1. Compare custom types.
2. Compare sequences and defaults that depend on them.
3. Compare tables and columns.
4. Compare constraints and indexes.
5. Compare functions, procedures, and triggers.
6. Compare references and dependency order.

Call out risky operations explicitly:

- dropping or renaming columns
- changing types used by existing data
- changing enum labels
- changing function signatures used by triggers
- changing sequence ownership

If a function or procedure body changes and a `source:` block exists, prefer a `CREATE OR REPLACE` routine update when PostgreSQL semantics allow it.

When the diff spans a forward checkpoint lineage, prefer one migration file per version transition and keep SQL ordering aligned with the version sequence. Apply the same step boundaries to generated Kysely migrations so SQL and Kysely can replay the same history.

## Writing Application Queries From PGML

PGML is also useful for application SQL, not just DDL. Use it as a typed schema map.

### Join Discovery

Use inline refs and top-level `Ref:` edges to choose joins. For example, if PGML declares:

- `public.orders.customer_id -> public.users.id`
- `public.orders.tenant_id -> public.tenants.id`
- `public.order_items.order_id -> public.orders.id`

then valid query shapes include:

```sql
SELECT
  orders.id,
  users.email,
  orders.total_cents
FROM public.orders AS orders
LEFT JOIN public.users AS users
  ON users.id = orders.customer_id
WHERE orders.tenant_id = $1;
```

and:

```sql
SELECT
  items.order_id,
  SUM(items.quantity * items.unit_price_cents) AS computed_total_cents
FROM public.order_items AS items
GROUP BY items.order_id;
```

### Insert And Update Safety

Use `not null`, `unique`, domain types, and defaults to shape DML correctly.

Examples:

- omit a column with `default: now()` when the default should fire
- supply values for `NOT NULL` columns with no default
- avoid duplicate inserts into `UNIQUE` columns unless using an upsert strategy
- cast or validate values meant for domains or enums

### Routine Reuse

If PGML already models a function or procedure for the task, prefer calling it instead of recreating its logic in ad hoc SQL.

Examples:

- use `CALL public.archive_orders($1);` for archival work if the procedure exists
- use `SELECT public.recalc_order_total($1);` if the function is meant to recompute totals

Use `affects` and `docs` to decide whether a routine is the right abstraction for the requested behavior.

## Interpretation Rules For Docs And Affects

`docs {}` and `affects {}` are not direct SQL, but they materially improve SQL generation quality.

Use them to:

- understand intent when naming output files or migration sections
- detect read and write tables for query planning
- detect side effects before proposing application SQL
- explain why a trigger or function exists

Do not turn `docs` or `affects` entries into DDL automatically. They are guidance, not executable syntax.

## Common Failure Modes

Watch for these errors:

- treating `Properties` blocks as part of the schema
- inventing columns not present in PGML
- emitting duplicate foreign keys from repeated refs
- ignoring schema qualification and accidentally joining the wrong table
- replacing a full routine `source:` with a lossy summary
- assuming unknown modifiers have PostgreSQL meaning

When uncertainty remains, separate certain SQL from inferred SQL and label the inference clearly.
