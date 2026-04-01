# PGML Syntax Reference

Use this file when the task needs the currently supported PGML surface area rather than a high-level description.

## Canonical Sources

In this repo, PGML behavior is defined by three complementary sources:

- `app/utils/pgml.ts`: current parser behavior
- `app/utils/pgml-document.ts`: versioned document grammar and root-level metadata
- `README.md`: draft language spec
- `app/pages/spec.vue`: public examples and narrative spec

If those sources appear to disagree, treat the parser and document model as the current truth because that code drives the actual app.

## Versioned Document Root

Persisted PGML documents in this repo are rooted in `VersionSet`.

The document root only allows these nested blocks:

- `SchemaMetadata { ... }`
- `Workspace { ... }`
- `Version <id> { ... }`

Lines starting with `//` are ignored as comments.

Example:

```pgml
VersionSet "Billing schema" {
  SchemaMetadata {
    Table "public.orders" {
      owner: "billing"
    }

    Column "public.orders.total_cents" {
      pii: "none"
    }
  }

  Workspace {
    based_on: v_programs
    updated_at: "2026-03-29T14:12:00Z"
    active_view: view_review

    Snapshot {
      Table public.orders {
        id uuid [pk]
      }
    }

    View "Review" {
      id: view_review
      show_execs: false

      Properties "table:public.orders" {
        x: 320
        y: 140
      }
    }
  }

  Version v_programs {
    name: "Programs implementation sync"
    role: implementation
    parent: v_foundation
    created_at: "2026-03-24T10:30:00Z"
    active_view: view_programs

    Snapshot {
      Table public.orders {
        id uuid [pk]
      }
    }

    View "Implementation" {
      id: view_programs
      show_fields: false
    }
  }
}
```

Important:

- `VersionSet` is the only persisted document root.
- `Workspace` is required exactly once.
- `Workspace` may contain `based_on`, `updated_at`, and `active_view` metadata lines ahead of its nested blocks.
- `Version` blocks are immutable checkpoints in studio behavior.
- `Version` blocks carry `role`, `created_at`, and optional `name`, `parent`, and `active_view` metadata lines ahead of their nested blocks.
- `Workspace.based_on` is required when versions exist.
- `Snapshot` is required exactly once inside each `Workspace` and `Version`.
- `Workspace` and `Version` can each contain zero or more `View "..." { ... }` blocks after `Snapshot`.
- `View` blocks require a quoted name and support only `id`, `show_lines`, `show_execs`, `show_fields`, and nested `Properties` blocks.
- `SchemaMetadata` is optional and lives outside version history.
- Legacy snapshot-level `Properties` blocks still parse, but canonical persisted `VersionSet` documents move them into the active or default `View`.

## SchemaMetadata

`SchemaMetadata` stores arbitrary key/value metadata for tables and columns outside the version graph.

Supported nested blocks:

- `Table "schema.table" { ... }`
- `Column "schema.table.column" { ... }`

Example:

```pgml
SchemaMetadata {
  Table "public.users" {
    owner: "identity"
    sla: "gold"
  }

  Column "public.users.email" {
    pii: "restricted"
    classification: "login-identifier"
  }
}
```

Each body line must be a metadata entry such as `key: "value"` or `key: value`.

## Snapshot Contents

`Snapshot` contains the familiar schema grammar. These are the valid schema blocks or lines inside a snapshot:

- `TableGroup ... { ... }`
- `Table ... { ... }`
- `Enum ... { ... }`
- `Domain ... { ... }`
- `Composite ... { ... }`
- `Function ... { ... }`
- `Procedure ... { ... }`
- `Trigger ... { ... }`
- `Sequence ... { ... }`
- `Ref: ...`
- legacy snapshot-level `Properties "..." { ... }`

The studio can also serialize standalone `Workspace` or `Version` blocks when the raw editor is scoped to one block, but the persisted file format is still `VersionSet`.

Canonical persisted versioned documents store diagram state in `View` blocks rather than directly inside `Snapshot`. Snapshot-level `Properties` blocks are a legacy input form that the document model migrates into the active or default view.

## Diagram Views

`Workspace` and `Version` blocks can both store named `View` blocks. Each view holds diagram layout and visibility state for one snapshot owner.

Example:

```pgml
Workspace {
  based_on: v_programs
  active_view: view_review

  Snapshot {
    Table public.orders {
      id uuid [pk]
    }
  }

  View "Review" {
    id: view_review
    show_lines: false
    show_execs: false
    show_fields: false

    Properties "table:public.orders" {
      x: 320
      y: 140
      color: #f59e0b
    }
  }
}
```

Supported view metadata:

- `id`
- `show_lines`
- `show_execs`
- `show_fields`

Legacy aliases `lines`, `execs`, and `fields` are also accepted by the parser.

Only nested `Properties "..." { ... }` blocks are allowed inside a `View`. `active_view` on the containing `Workspace` or `Version` selects the current view id. If no `active_view` is present, the first view becomes active in studio behavior.

## Naming Rules

Schema-qualified names are supported. When a table name is unqualified, the parser treats it as `public.<table>`.

Examples:

```pgml
Table public.orders {
  id uuid [pk]
}

Table orders {
  id uuid [pk]
}
```

Both parse, but the second becomes `public.orders` in the model.

Reference targets support either:

- `schema.table.column`
- `table.column`

When the schema is omitted, `public` is assumed.

## Tables

Table blocks follow DBML-style structure:

```pgml
Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  total_cents integer [not null]

  Index idx_orders_status (status) [type: btree]
  Constraint chk_orders_total: total_cents >= 0
}
```

The parser reads:

- table name
- optional group label from `Table ... in GroupName`
- columns
- inline references from column modifiers
- inline indexes
- inline constraints
- optional table `Note:`

### Column Syntax

Use this shape:

```pgml
column_name column_type [modifier, modifier, ...]
```

Recognized modifiers include:

- `pk`
- `unique`
- `not null`
- `default: ...`
- `note: ...`
- `ref: > schema.table.column`
- `ref: < schema.table.column`
- `ref: - schema.table.column`

Unknown modifiers are preserved as text. That makes PGML permissive, but it also means unknown modifiers should not be treated as reliable SQL instructions without explicit interpretation.

### Index Syntax

Indexes are currently parsed only inside tables:

```pgml
Index idx_products_search (search) [type: gin]
```

Parsed fields:

- index name
- target columns
- optional `type`

If `type` is omitted, the parser uses `btree` as the default model value.

### Constraint Syntax

Constraints are currently parsed only inside tables:

```pgml
Constraint chk_orders_total: total_cents >= 0
```

The parser stores the name and expression. The current language examples are strongly check-oriented, so interpret these as check constraints unless the task provides a different rule explicitly.

## Table Groups

`TableGroup` keeps DBML-style grouping and supports two forms:

```pgml
TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}
```

```pgml
TableGroup Core {
  tables: [tenants, users, roles]
  Note: Shared identity and account ownership
}
```

A table can also declare group membership inline:

```pgml
Table public.users in Core {
  id uuid [pk]
}
```

When both styles exist, treat them as two ways to describe the same grouping intent.

Important:

- `TableGroup` is not a PostgreSQL schema.
- PostgreSQL schema still comes from the table name itself, such as `public.users` or `billing.invoices`.
- Use groups for source organization and studio layout, not for namespace semantics.

## References

Standalone references use this syntax:

```pgml
Ref: public.orders.customer_id > public.users.id
```

Supported relation tokens:

- `>`
- `<`
- `-`

Inline column refs and top-level `Ref:` lines both become relationship edges in the parsed model. Deduplicate them before emitting SQL if they describe the same foreign-key relationship.

Inline references can also carry foreign-key actions as neighboring modifiers:

```pgml
customer_id uuid [ref: > public.users.id, delete: restrict, update: cascade]
```

`delete:` maps to `ON DELETE ...` and `update:` maps to `ON UPDATE ...` in generated SQL.

## Custom Types

PGML currently supports three custom-type block kinds.

### Enum

```pgml
Enum role_kind {
  owner
  analyst
  operator
}
```

The parser stores the kind, name, and trimmed detail lines.

### Domain

```pgml
Domain email_address {
  base: text
  check: VALUE ~* '^[^@]+@[^@]+\\.[^@]+$'
}
```

The parser preserves the detail lines and does not attempt deeper semantic validation.

### Composite

```pgml
Composite money_amount {
  amount numeric
  currency text
}
```

Composite field lines are preserved as details.

## Executable Objects

Functions, procedures, triggers, and sequences are source-first objects. Their blocks can contain:

- metadata lines like `language: plpgsql`
- an optional `docs {}` block
- an optional `affects {}` block
- an optional dollar-quoted `source:` block

The parser also accepts `definition:` as an alias for `source:`.

### Functions

Example:

```pgml
Function register_entity(entity_kind text) returns trigger [replace] {
  docs {
    summary: "Allocates a Common_Entity row and assigns NEW.id."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)
    RETURNS trigger AS $$
    BEGIN
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}
```

From `source:`, the parser can derive routine metadata such as:

- name
- signature
- language
- volatility
- security

### Procedures

Procedures follow the same executable-body rules:

```pgml
Procedure archive_orders(retention_days integer) {
  language: plpgsql
  source: $sql$
    CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
    END;
    $$;
  $sql$
}
```

### Triggers

Trigger headers can include the table directly:

```pgml
Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}
```

From `source:`, the parser can derive:

- trigger name
- target table
- timing
- events
- level
- function
- trigger arguments

### Sequences

Sequences can be described declaratively, but the parser derives the richest metadata from `source:`:

```pgml
Sequence order_number_seq {
  source: $sql$
    CREATE SEQUENCE public.order_number_seq
      AS bigint
      START WITH 1200
      INCREMENT BY 1
      CACHE 20
      OWNED BY public.orders.order_number;
  $sql$
}
```

Derived metadata includes:

- `as`
- `start`
- `increment`
- `min`
- `max`
- `cache`
- `cycle`
- `owned_by`

## `docs {}` Blocks

`docs {}` captures human-readable explanation:

```pgml
docs {
  summary: "Short explanation."
  purpose: "Why this exists."
  caveat: "Important operational detail."
}
```

`summary` is special in the parsed model. Other entries are preserved as documentation entries.

## `affects {}` Blocks

`affects {}` captures graph and behavior hints:

```pgml
affects {
  writes: [public.orders.total_cents]
  reads: [public.order_items.quantity, public.order_items.unit_price_cents]
  calls: [recalc_order_total]
  depends_on: [public.orders, public.order_items]
}
```

Known keys map into structured arrays:

- `writes`
- `sets`
- `depends_on`
- `reads`
- `calls`
- `uses`
- `owned_by`

Unknown keys are preserved as extra entries rather than discarded.

## `Properties` Blocks

`Properties "..." { ... }` stores studio layout metadata and should normally be ignored for SQL tasks. In the current canonical document format, these blocks live inside `View` blocks.

Example:

```pgml
View "Operations" {
  id: view_operations
  show_execs: false

  Properties "group:Commerce" {
    x: 540
    y: 120
    color: #f59e0b
    table_columns: 1
  }
}
```

Supported parsed fields include:

- `x`
- `y`
- `width`
- `height`
- `color`
- `collapsed`
- `table_columns`

These blocks are for visualization persistence, not PostgreSQL behavior.
When `Properties` appears directly inside a `Snapshot`, treat it as legacy input that the document model will migrate into a `View`.

## Practical Parsing Caveats

Keep these caveats in mind when building tooling or writing SQL from PGML:

- The current parser is permissive and text-preserving; not every preserved token has first-class semantics.
- Equivalent refs can appear twice, once inline and once top-level.
- Parser support is stronger for reading executable metadata than for reconstructing exact DDL from terse headers alone.
- The current app examples are the safest guide for authoring valid PGML surface syntax.
