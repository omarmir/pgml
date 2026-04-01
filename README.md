# PGML

PGML is a Postgres-first markup language that extends DBML toward real schema documentation and grammar-native schema versioning.

This repository contains:

- the draft PGML language and examples
- a Nuxt-based documentation site at `/`
- a diagram studio at `/diagram` that parses PGML and renders a schema canvas

PGML is designed to read like architecture documentation instead of migration output. It stays close to DBML where possible, then adds Postgres-native objects such as functions, procedures, triggers, sequences, constraints, custom types, view-scoped layout metadata, and versioned document roots.

## Why PGML

Use PGML when the schema is part structure, part behavior, and part documentation.

- Keep schema reviews readable when raw SQL migrations are too noisy for design review.
- Diff the intent, not just the SQL, by keeping structure, behavior, and layout in one document.
- Model operational Postgres objects with the tables instead of scattering them across migrations.
- Drive the visual studio directly from the source PGML.
- Generate migrations deterministically from a structured schema document.
- Reduce AI ambiguity by giving tools a schema-aware representation of intent.
- Preserve docs, affects metadata, and per-view layout state alongside the schema.

## DBML Compatibility

PGML is intentionally close to DBML, then opinionated where Postgres needs more surface area.

### Stays close to DBML

- Table blocks keep the familiar DBML shape.
- Inline column attributes such as `pk`, `unique`, `not null`, `ref`, `delete`, and `update` stay compact.
- `TableGroup` keeps the one-table-per-line grouping pattern for source organization and diagram layout.
- The source remains block-based and easy to diff.

### Extends where Postgres needs more

- Adds first-class functions, procedures, triggers, sequences, constraints, and custom types.
- Supports source-first executable objects with embedded SQL or PL/pgSQL.
- Allows `docs {}` and `affects {}` blocks when narrative or dependency hints matter.
- Persists studio state back into PGML with named `View` blocks and nested `Properties` blocks.
- Stores document history directly in the grammar with `VersionSet`, `Workspace`, `Version`, and `Snapshot`.

## Quick Start

```pgml
TableGroup Commerce {
  public.products
  public.orders
  public.order_items
}

Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id, delete: restrict]
  total_cents integer [not null]
}

Function register_entity(entity_kind text) returns trigger [replace] {
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

## Documentation

The language is block-based, readable, and meant to be learned from examples.

### Versioned documents

PGML documents are rooted in `VersionSet`. The mutable draft lives in `Workspace`, locked checkpoints live in `Version`, schema objects remain inside `Snapshot`, and each workspace or version can keep one or more named diagram `View` blocks.

```pgml
VersionSet "Billing schema" {
  Workspace {
    based_on: v_programs
    updated_at: "2026-03-29T14:12:00Z"
    active_view: view_review

    Snapshot {
      TableGroup Commerce {
        public.orders
      }

      Table public.users {
        id uuid [pk]
        email text [not null]
        status text
      }

      Table public.orders {
        id uuid [pk]
        customer_id uuid [ref: > public.users.id, delete: restrict]
        total_cents integer [not null]
      }
    }

    View "Review" {
      id: view_review
      show_execs: false

      Properties "group:Commerce" {
        x: 540
        y: 120
      }
    }
  }

  Version v_foundation {
    name: "Foundation implementation"
    role: implementation
    created_at: "2026-03-20T15:00:00Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text [not null]
      }
    }
  }

  Version v_programs {
    name: "Programs implementation sync"
    role: implementation
    parent: v_foundation
    created_at: "2026-03-28T15:00:00Z"
    active_view: view_programs

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text [not null]
        status text
      }
    }

    View "Implementation" {
      id: view_programs
      show_fields: false
    }
  }

  Version v_analytics {
    name: "Analytics branch"
    role: design
    parent: v_foundation
    created_at: "2026-03-29T09:15:00Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text [not null]
      }

      Table public.orders {
        id uuid [pk]
        customer_id uuid [ref: > public.users.id, delete: restrict]
        total_cents integer [not null]
      }
    }
  }
}
```

The studio compares `Workspace` against a selected base `Version` to show deltas and generate forward migration SQL. Each workspace or version can keep multiple named views, with node positions plus line, executable, and field visibility persisted per view. Importing DBML or `pg_dump` can infer obvious executable-to-table attachments, pauses for table placement when an imported executable is ambiguous, and replaces `Workspace` only after the import is prepared.

### Tables and references

Start with DBML-like table blocks. Keep columns first, then table-level indexes and constraints.

```pgml
Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id, delete: restrict]
  total_cents integer [not null]
  status text [not null]

  Index idx_orders_status (status) [type: btree]
  Constraint chk_total: total_cents >= 0
}
```

`delete:` and `update:` can sit beside `ref:` to preserve foreign-key actions directly in PGML, for example `customer_id uuid [ref: > public.users.id, delete: restrict, update: cascade]`.

### Table groups

Use `TableGroup` to cluster related tables in source and in the studio canvas. It is a grouping construct, not a PostgreSQL schema declaration, so each group member should stay schema-qualified.

```pgml
TableGroup Commerce {
  public.products
  public.orders
  public.order_items
  Note: Buying flow and inventory edges
}
```

### Executable objects

Use `source:` blocks for the real SQL, then layer `docs {}` or `affects {}` only when they help explain behavior.

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

Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}
```

### Diagram views and layout properties

The studio writes named `View` blocks back into PGML so each workspace or version can reopen with the same layout and presentation state. `active_view` selects the current view, and each view persists its own node positions plus `show_lines`, `show_execs`, and `show_fields`.

```pgml
View "Operations" {
  id: view_operations
  show_lines: false
  show_execs: false
  show_fields: false

  Properties "group:Commerce" {
    x: 540
    y: 120
    color: #f59e0b
    masonry: true
    table_columns: 1
  }

  Properties "custom-type:Domain:email_address" {
    x: 1180
    y: 460
    color: #14b8a6
    collapsed: false
  }
}
```

### Studio behavior

The studio keeps the language features above wired into the editor and import flow:

- DBML and `pg_dump` imports show a blocking loading state while PGML parses the source and prepares the replacement workspace.
- Executable imports can attach obvious functions, triggers, procedures, or sequences to tables automatically and pause for table placement when the attachment is ambiguous.
- The raw PGML editor keeps autocomplete active while typing, including large drafts, so `VersionSet`, `View`, `active_view`, and the rest of the grammar stay discoverable from the editor itself.

## Current PGML Surface Area

The current parser and studio support:

- `VersionSet`
- `Workspace`
- `Version`
- `Snapshot`
- `View`
- `Table`
- `TableGroup`
- `Ref`
- `Index`
- `Constraint`
- `Function`
- `Procedure`
- `Trigger`
- `Sequence`
- `Enum`
- `Domain`
- `Composite`
- `SchemaMetadata`
- view-scoped layout via `View` and `Properties`

## Development

Install dependencies:

```bash
bun install
```

Start the local dev server:

```bash
bun run dev
```

Local app routes:

- `/` contains the PGML overview, compatibility notes, and examples.
- `/diagram` contains the PGML editor, diagram canvas, and export tooling.

Run verification:

```bash
bun run lint
bun run typecheck
bun run test:unit
bun run test:coverage
bun run build
bun run test:e2e
```

Build the static GitHub Pages bundle locally:

```bash
NUXT_APP_BASE_URL=/pgml/ bun run build:pages
```

If you are building for a user or organization Pages repository such as `owner.github.io`, use:

```bash
NUXT_APP_BASE_URL=/ bun run build:pages
```

## GitHub Pages Deployment

This repository now includes a manual GitHub Actions workflow at `.github/workflows/deploy-pages.yml` that publishes the app to GitHub Pages.

One-time repository setup:

1. Open GitHub repository settings.
2. Go to `Settings -> Pages`.
3. Set the build and deployment source to `GitHub Actions`.

Run the deployment:

1. Open the `Actions` tab in GitHub.
2. Choose `Deploy GitHub Pages`.
3. Click `Run workflow`.

For a project Pages repository, the workflow publishes under:

```text
https://<owner>.github.io/<repo>/
```

For this repository, that means:

```text
https://omarmir.github.io/pgml/
```

The workflow builds with Nuxt's `github_pages` preset and explicitly sets `NUXT_APP_BASE_URL` from the repository name during the build step. If you ever need to override that path manually for a local or custom build, set `NUXT_APP_BASE_URL` yourself.
