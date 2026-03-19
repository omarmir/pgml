# PGML

PGML is a Postgres-first markup language that extends DBML toward real schema documentation.

This repository contains:

- the draft PGML specification
- a Nuxt-based documentation page at `/`
- a diagram studio at `/diagram` that parses PGML and renders a grouped schema canvas

PGML is designed to read like architecture documentation instead of migration output. It stays close to DBML where possible, then adds Postgres-native objects such as functions, procedures, triggers, sequences, constraints, and custom types.

## Project Goals

- Keep schema source readable in pull requests.
- Represent tables and operational Postgres objects in one document.
- Let executable SQL or PL/pgSQL remain authoritative via embedded source blocks.
- Drive a visual model directly from PGML.
- Preserve layout when desired by embedding node properties back into the PGML text.

## Stack

- Runtime: Bun
- Framework: Nuxt 4 + Vue 3
- UI: Nuxt UI v4 + Tailwind
- Tests: Vitest + Playwright

## Development

Install dependencies:

```bash
bun install
```

Start the dev server:

```bash
bun run dev
```

Run verification:

```bash
bun run lint
bun run typecheck
bun run test:unit
bun run test:coverage
bun run build
bun run test:e2e
```

## What PGML Covers Today

The current parser and studio support:

- `Table`
- `TableGroup`
- `Ref`
- `Index`
- `Constraint`
- `Function`
- `Procedure`
- `Trigger`
- `Sequence`
- custom types:
  - `Enum`
  - `Domain`
  - `Composite`
- embedded layout via `Properties`

## Design Principles

### 1. Stay close to DBML

Tables, references, and grouping should feel familiar to DBML users.

### 2. Keep source authoritative

Executable objects can embed full `CREATE ...` statements in `source:` blocks. PGML then derives metadata where it can.

### 3. Keep docs optional but structured

Human explanation can live in `docs {}` and explicit graph hints can live in `affects {}`.

### 4. Treat operational objects as first-class schema assets

Indexes, functions, triggers, and sequences belong in the same schema document as tables.

## PGML Spec

## Document Model

A PGML document is a sequence of top-level blocks and references:

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
- `Properties "..." { ... }`

Order is flexible, but grouping blocks near the objects they describe keeps the source easier to read.

## Naming and Qualification

PGML accepts schema-qualified names such as:

```pgml
Table public.orders {
  id uuid [pk]
}
```

When references point to tables or fields, use fully-qualified names when possible:

```pgml
Ref: public.orders.customer_id > public.users.id
```

## Tables

Tables stay close to DBML. A table contains columns, followed by optional inline `Index` and `Constraint` definitions.

```pgml
Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  status text [not null]
  total_cents integer [not null]

  Index idx_orders_status (status) [type: btree]
  Constraint chk_orders_total: total_cents >= 0
}
```

### Column Syntax

Column lines follow this shape:

```pgml
column_name column_type [modifier, modifier, ...]
```

Examples:

```pgml
id uuid [pk]
email email_address [unique, not null]
tenant_id uuid [not null, ref: > public.tenants.id]
created_at timestamptz [default: now()]
search tsvector [note: generated for full text search]
```

### Supported Column Modifiers

The current parser recognizes and preserves modifiers like:

- `pk`
- `unique`
- `not null`
- `default: ...`
- `note: ...`
- `ref: > schema.table.column`
- `ref: < schema.table.column`
- `ref: - schema.table.column`

PGML preserves unknown modifiers as text, which lets the language stay permissive while the spec evolves.

## Table Groups

`TableGroup` uses a DBML-like block with one table name per line.

```pgml
TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}
```

Notes:

- `Note:` is optional.
- Table names inside the block should match table definitions elsewhere in the document.
- Groups drive grouped layout in the studio.

## References

Cross-table relationships can be described inline on columns and also as standalone refs.

```pgml
Ref: public.orders.customer_id > public.users.id
```

Supported relation tokens:

- `>`
- `<`
- `-`

## Indexes

Indexes are declared inside tables.

```pgml
Table public.products {
  id uuid [pk]
  search tsvector [note: generated for full text search]

  Index idx_products_search (search) [type: gin]
}
```

Current structure:

- name
- target columns
- optional bracket metadata such as `type: gin`

## Constraints

Constraints are currently expressed inside tables as named expressions.

```pgml
Table public.users {
  email text [not null]
  Constraint chk_users_email: email <> ''
}
```

Current support is best for check-style expressions, but PGML treats them as first-class schema objects in the visual model.

## Custom Types

### Enum

```pgml
Enum role_kind {
  owner
  analyst
  operator
}
```

### Domain

```pgml
Domain email_address {
  base: text
  check: VALUE ~* '^[^@]+@[^@]+\\.[^@]+$'
}
```

### Composite

```pgml
Composite money_amount {
  amount numeric
  currency text
}
```

## Executable Objects

Functions, procedures, triggers, and sequences follow a source-first model.

Each block can contain:

- metadata lines
- an optional `docs {}` block
- an optional `affects {}` block
- a `source:` block containing verbatim SQL or PL/pgSQL

### Functions

```pgml
Function register_entity(entity_kind text) returns trigger [replace] {
  docs {
    summary: "Allocates a Common_Entity row and assigns NEW.id."
    purpose: "Used by BEFORE INSERT triggers on entity-backed program tables."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
    depends_on: [entity_type, common_entity_id_seq]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)
    RETURNS trigger AS $$
    DECLARE
      allocated_id bigint;
    BEGIN
      INSERT INTO public.common_entity (entity_type)
      VALUES (entity_kind::entity_type)
      RETURNING id INTO allocated_id;

      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}
```

### Procedures

```pgml
Procedure archive_orders(retention_days integer) {
  language: plpgsql

  source: $sql$
    CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      -- procedure body
    END;
    $$;
  $sql$
}
```

### Triggers

```pgml
Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  docs {
    summary: "Registers a shared entity id before insert."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
    depends_on: [register_entity]
  }

  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}
```

### Sequences

```pgml
Sequence order_number_seq {
  docs {
    summary: "Allocates user-facing order numbers."
  }

  affects {
    owned_by: [public.orders.order_number]
  }

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

## `docs {}` Blocks

`docs {}` is for human-readable documentation.

```pgml
docs {
  summary: "Short explanation."
  purpose: "Why this exists."
  caveat: "Important operational detail."
}
```

Rules:

- `summary` is treated specially by the UI.
- all other keys are preserved as documentation entries
- values are plain strings

## `affects {}` Blocks

`affects {}` is for explicit graph hints and operational impact.

Known keys:

- `writes`
- `sets`
- `depends_on`
- `reads`
- `calls`
- `uses`
- `owned_by`

Example:

```pgml
affects {
  writes: [public.orders.total_cents]
  reads: [public.order_items.quantity, public.order_items.unit_price_cents]
  calls: [recalc_order_total]
  depends_on: [public.orders, public.order_items]
}
```

Unknown keys are preserved as extra effect entries.

## `source:` Blocks

`source:` embeds verbatim SQL or PL/pgSQL using a dollar-quoted payload.

```pgml
source: $sql$
  CREATE OR REPLACE FUNCTION ...
$sql$
```

The parser currently derives metadata from source for:

- functions
- procedures
- triggers
- sequences

This lets PGML keep executable truth in one place while still rendering a useful schema graph.

## Metadata Extraction

PGML derives as much as it safely can from executable source.

Examples of derivation:

- function/procedure name
- routine signature
- trigger name
- trigger table
- sequence name
- trigger timing and events when expressed in source
- routine language when present in source
- sequence ownership and sequence options when present in source

Use `docs {}` and `affects {}` when:

- intent matters more than syntax
- dynamic SQL hides dependencies
- you need explicit writes/sets/reads for the visual graph
- you want to override what is merely inferred

## Layout Properties

PGML can embed canvas layout so a saved schema is self-contained.

```pgml
Properties "group:Commerce" {
  x: 540
  y: 120
  table_columns: 1
}
```

Supported properties:

- `x`
- `y`
- `width` for floating nodes
- `height` for floating nodes
- `collapsed` for persisted open/closed node state
- `table_columns`

These blocks are intended for studio persistence, not hand-authoring.

## Full Example

```pgml
TableGroup Programs {
  common_entity
  funding_opportunity_profile
  Note: Shared entity registration hooks for programs
}

Enum entity_type {
  fundingopportunity
  order
  user
}

Sequence common_entity_id_seq {
  docs {
    summary: "Primary allocator for rows in Common_Entity."
  }

  source: $sql$
    CREATE SEQUENCE public.common_entity_id_seq
      AS bigint
      START WITH 1000
      INCREMENT BY 1
      CACHE 25
      OWNED BY public.common_entity.id;
  $sql$
}

Table public.common_entity {
  id bigint [pk, default: nextval('common_entity_id_seq')]
  entity_type entity_type [not null]
  created_at timestamptz [default: now()]
}

Table public.funding_opportunity_profile {
  id bigint [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  owner_id uuid [ref: > public.users.id]
  title text [not null]
  status text [not null]
}

Function register_entity(entity_kind text) returns trigger [replace] {
  docs {
    summary: "Allocates a Common_Entity row and assigns NEW.id."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
    depends_on: [entity_type, common_entity_id_seq]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)
    RETURNS trigger AS $$
    DECLARE
      allocated_id bigint;
    BEGIN
      INSERT INTO public.common_entity (entity_type)
      VALUES (entity_kind::entity_type)
      RETURNING id INTO allocated_id;

      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  docs {
    summary: "Registers a shared entity id before insert."
  }

  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}
```

## Studio Features

The diagram studio currently supports:

- grouped table layout
- field-level table references
- dotted impact lines from non-table objects back to affected tables and fields
- drag, resize, and group column adjustments
- collapse/expand for non-table entities
- PNG export at `1x`, `2x`, `3x`, `4x`, and `8x`
- SVG export
- save/load from browser storage
- download PGML as a self-contained `.pgml` file
- optional embedding of layout back into PGML

## Planned Coverage

The long-term direction for PGML includes:

- partitioned tables
- more index families:
  - `gin`
  - `gist`
  - `brin`
  - `hash`
  - others
- views
- materialized views
- schemas
- extensions
- foreign tables and FDWs
- operators and operator classes
- collations
- text search configurations
- publications and subscriptions
- rules
- casts

## Current Status

This repository should be treated as a working specification draft plus reference visualizer.

The language is intentionally permissive in places while the syntax settles. The canonical implementation for the currently supported grammar lives in [app/utils/pgml.ts](./app/utils/pgml.ts).
