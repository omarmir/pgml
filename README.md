# PGML

PGML is a Postgres-first markup language that extends DBML toward real schema documentation.

This repository contains:

- the draft PGML language and examples
- a Nuxt-based documentation site at `/`
- a diagram studio at `/diagram` that parses PGML and renders a schema canvas

PGML is designed to read like architecture documentation instead of migration output. It stays close to DBML where possible, then adds Postgres-native objects such as functions, procedures, triggers, sequences, constraints, custom types, and layout metadata.

## Why PGML

Use PGML when the schema is part structure, part behavior, and part documentation.

- Keep schema reviews readable when raw SQL migrations are too noisy for design review.
- Diff the intent, not just the SQL, by keeping structure, behavior, and layout in one document.
- Model operational Postgres objects with the tables instead of scattering them across migrations.
- Drive the visual studio directly from the source PGML.
- Generate migrations deterministically from a structured schema document.
- Reduce AI ambiguity by giving tools a schema-aware representation of intent.
- Preserve docs, affects metadata, and embedded layout state alongside the schema.

## DBML Compatibility

PGML is intentionally close to DBML, then opinionated where Postgres needs more surface area.

### Stays close to DBML

- Table blocks keep the familiar DBML shape.
- Inline column attributes such as `pk`, `unique`, `not null`, and `ref` stay compact.
- `TableGroup` keeps the one-table-per-line grouping pattern for source organization and diagram layout.
- The source remains block-based and easy to diff.

### Extends where Postgres needs more

- Adds first-class functions, procedures, triggers, sequences, constraints, and custom types.
- Supports source-first executable objects with embedded SQL or PL/pgSQL.
- Allows `docs {}` and `affects {}` blocks when narrative or dependency hints matter.
- Persists studio state back into PGML with `Properties` blocks.

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
  customer_id uuid [ref: > public.users.id]
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

### Tables and references

Start with DBML-like table blocks. Keep columns first, then table-level indexes and constraints.

```pgml
Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  total_cents integer [not null]
  status text [not null]

  Index idx_orders_status (status) [type: btree]
  Constraint chk_total: total_cents >= 0
}
```

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

### Layout properties

The studio writes `Properties` blocks back into PGML so the document can reopen with the same layout and presentation state.

```pgml
Properties "group:Commerce" {
  x: 540
  y: 120
  color: #f59e0b
  table_columns: 1
}

Properties "custom-type:Domain:email_address" {
  x: 1180
  y: 460
  color: #14b8a6
  collapsed: false
}
```

## Current PGML Surface Area

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
- `Enum`
- `Domain`
- `Composite`
- embedded layout via `Properties`

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
