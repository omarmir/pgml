---
name: PGML
description: This skill should be used when the user asks to parse or understand versioned PGML, explain checkpoints or SchemaMetadata, translate PGML to PostgreSQL SQL, write PostgreSQL queries from PGML, review a PGML schema, diff PGML versions, or generate ordered SQL or Kysely migrations from PGML.
version: 0.2.0
---

# PGML

Use this skill to interpret PGML documents in this repository and turn them into accurate PostgreSQL understanding, DDL, migration plans, or query SQL.

Treat PGML as a Postgres-first extension of DBML with grammar-native versioning. Persisted documents in this repo are rooted in `VersionSet`, keep the mutable draft in `Workspace`, store immutable checkpoints in `Version`, and place schema objects inside nested `Snapshot` blocks. Root-level `SchemaMetadata` stores arbitrary table and column metadata outside the version graph, so those annotations persist while versions evolve.

Keep the language close to DBML for table structure, then extend the mental model for Postgres-native objects such as functions, procedures, triggers, sequences, constraints, custom types, compare, and migrations. Favor the current parser and document-model behavior over speculative syntax. In this repo, the canonical runtime behavior lives in `app/utils/pgml.ts`, `app/utils/pgml-document.ts`, and `app/utils/pgml-version-migration.ts`; the public language narrative lives in `README.md` and `app/pages/spec.vue`.

Treat `TableGroup` as a source-organization and studio-layout concept, not as a PostgreSQL schema namespace. PostgreSQL schema is carried by the table name itself, for example `public.orders` or `billing.invoices`. A group like `TableGroup Commerce { ... }` does not create, rename, or imply a PostgreSQL schema. When authoring or editing PGML, keep `TableGroup` members schema-qualified, for example `public.orders`, so same-named tables in different schemas cannot collapse into one group entry.

## When To Use This Skill

Load this skill when the task involves any of the following:

- Parse or explain a `.pgml` file.
- Parse or explain a `VersionSet` document, one locked `Version`, or the current `Workspace`.
- Explain checkpoints, branches, compare pairs, or root-level `SchemaMetadata`.
- Extract schema structure from PGML.
- Translate PGML into PostgreSQL DDL.
- Write application SQL against a schema described in PGML.
- Review PGML for correctness, completeness, or ambiguity.
- Diff a changed `.pgml` file against the committed copy.
- Diff one version against another or compare a version against the workspace draft.
- Plan migrations from one PGML version to another.
- Create ordered SQL or Kysely migration files from PGML deltas.

## Working Model

Start by classifying the request into one of five modes:

1. Schema understanding: explain tables, types, routines, triggers, relationships, or domain boundaries.
2. Version-history understanding: explain `VersionSet`, `Workspace`, `Version`, `Snapshot`, lineage, checkpoints, compare scope, or `SchemaMetadata`.
3. DDL generation: produce `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`, and related SQL.
4. Query authoring: write `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or `CALL` statements grounded in the schema.
5. Diff or migration planning: compare PGML states, identify semantic schema changes, and generate delta SQL or Kysely when requested.

State the chosen mode when ambiguity matters. If the user asks for "SQL from PGML", resolve whether the requested output is:

- full schema DDL
- a migration delta
- application queries
- a mixed result

If the mode is unclear and the difference changes the result materially, ask a short clarifying question. Otherwise, make the smallest reasonable assumption and continue.

## Core Workflow

Follow this sequence:

1. Read the PGML source.
2. Detect the document scope:
   - full `VersionSet` document
   - standalone `Workspace` block
   - standalone `Version` block
   - plain `Snapshot` content or editor excerpt
3. If the source is versioned, choose the relevant snapshot scope before reasoning further:
   - `Workspace.snapshot.source` for the active draft
   - one selected `Version.snapshot.source` for a locked checkpoint
   - two snapshots when the task is compare or migration planning
4. Ignore `Properties` blocks unless layout persistence is part of the task.
5. Inventory the schema objects:
   - groups
   - tables
   - columns
   - inline references
   - top-level `Ref:` relations
   - indexes
   - constraints
   - custom types
   - sequences
   - functions
   - procedures
   - triggers
6. Normalize names:
   - treat unqualified table names as `public.<table>`
   - treat two-part reference targets as `public.<table>.<column>`
7. Deduplicate relationships if the same foreign-key edge appears both inline and as a top-level `Ref:`.
8. Decide which content is authoritative:
   - table and custom-type blocks are declarative structure
   - `docs {}` and `affects {}` are annotations, not DDL
   - root `SchemaMetadata` is persistent document metadata, not versioned schema structure
   - executable `source:` blocks are authoritative for functions, procedures, triggers, and often sequences
9. Generate or explain SQL from the normalized object inventory.
10. Validate dependencies before finalizing the answer.

When the task is a diff or migration task, insert this extra step between inventory and SQL generation:

1. If the request names a base and target version, use those exact snapshots.
2. Otherwise, for a `VersionSet`, default to `Workspace.based_on` versus `Workspace`.
3. Fall back to committed-versus-working-tree diffing only when the task is about repo changes rather than version history inside one PGML document.
4. Strip `Properties` blocks before semantic diffing unless the user explicitly asks about layout changes.
5. Compare the old and new PGML object inventories by object kind.
6. Separate documentation-only changes, schema-metadata-only changes, and layout-only changes from database changes.
7. Generate migration SQL only from the database changes.

## Authoritative Source Rules

Use these precedence rules:

- Prefer explicit executable `source:` SQL over reconstructed SQL when `source:` exists.
- Prefer parser-supported syntax over informal assumptions.
- Prefer `docs {}` and `affects {}` to infer intent, graph edges, and operational semantics.
- Prefer exact names from PGML over idiomatic renaming.

When reconstructing SQL from declarative PGML instead of embedded source, mark that SQL as inferred. When reusing embedded `source:` text, treat it as authored truth and preserve behavior unless the task explicitly asks for a rewrite.

## PGML Semantics That Matter

Keep these distinctions straight:

- `VersionSet` is the persisted document root.
- `Workspace` is the mutable draft and carries `based_on`.
- `Version` is an immutable checkpoint with `role: design | implementation`.
- `Snapshot` contains the familiar schema grammar.
- `SchemaMetadata` stores arbitrary table and column metadata outside version history.
- `Table`, `Enum`, `Domain`, `Composite`, `Sequence`, `Function`, `Procedure`, and `Trigger` describe schema assets.
- `TableGroup` organizes tables in source and in the diagram studio; it does not map to a PostgreSQL schema.
- `TableGroup` members should use `schema.table` names, not bare table names.
- `docs {}` explains why an asset exists.
- `affects {}` describes operational impact and dependency hints.
- `Properties "..." {}` persists studio layout and presentation state; it is not database DDL.
- Unknown column modifiers are preserved as text by the parser; do not silently assign SQL meaning unless the modifier is explicitly known.

Use `references/pgml-syntax.md` for the supported syntax surface and parser-derived caveats.

## Writing PostgreSQL DDL From PGML

When the task is schema DDL, follow this order unless a migration constraint requires otherwise:

1. Create custom types:
   - `Enum`
   - `Domain`
   - `Composite`
2. Create sequences used by defaults.
3. Create tables and columns.
4. Add primary keys, unique constraints, check constraints, and foreign keys.
5. Create indexes.
6. Create functions and procedures.
7. Create triggers after the referenced trigger function exists.

Prefer schema-qualified names in emitted SQL. Use `public.` explicitly unless the task or PGML uses a different schema. Keep foreign keys and ownership edges aligned with the declared PGML names rather than abbreviated aliases.

Apply these translation rules:

- `pk` -> `PRIMARY KEY`
- `unique` -> `UNIQUE`
- `not null` -> `NOT NULL`
- `default: expr` -> `DEFAULT expr`
- `ref: > target` or equivalent standalone `Ref:` -> foreign key edge
- `delete: action` next to a `ref:` -> `ON DELETE ACTION`
- `update: action` next to a `ref:` -> `ON UPDATE ACTION`
- `Index idx_name (col) [type: gin]` -> `CREATE INDEX idx_name ON schema.table USING gin (col);`
- `Constraint chk_name: expr` -> `CONSTRAINT chk_name CHECK (expr)` unless the expression clearly indicates a different constraint form

Treat `note:` as documentation, not automatic SQL. Only emit `COMMENT ON` statements if the task explicitly asks for comment DDL.
Do not emit `CREATE SCHEMA` or infer table namespace changes from `TableGroup`; schema comes from the qualified table name, not group membership.

Use `references/pgml-to-postgres-sql.md` for fuller translation rules and output ordering.

## Writing Application SQL From PGML

When the task is query authoring rather than DDL, use PGML as a schema contract:

- Use tables, columns, and refs to determine valid join paths.
- Use `not null`, `unique`, domains, and enums to infer constraints on filters and inserts.
- Use `docs.summary` and other docs entries to understand business purpose.
- Use `affects` to understand what routines read, write, set, call, or depend on.
- Use embedded routine `source:` to learn existing server-side behavior before proposing duplicate logic in application SQL.

Prefer joins that follow declared references instead of guessed relationships. Prefer calling an existing routine when PGML already models the operation as a `Function` or `Procedure`. Do not invent tables, archive targets, or helper functions unless PGML or embedded SQL actually declares them.

## Review And Migration Guidance

When reviewing PGML or planning a migration:

- Verify that the `VersionSet` root only contains `SchemaMetadata`, `Workspace`, and `Version`.
- Verify that `Workspace.based_on` references an existing version when versions exist.
- Verify that each `Version.parent` references an existing version and does not form a cycle.
- Treat `SchemaMetadata` changes as persistent annotations, not versioned schema changes.
- Verify that every `ref:` and `Ref:` target exists.
- Verify that sequence defaults reference created sequences.
- Verify that triggers refer to existing functions and target tables.
- Verify that custom types referenced by columns exist.
- Verify that inferred groups and `in GroupName` declarations do not drift.
- Flag executable objects whose `docs` or `affects` claims are contradicted by `source:`.
- Distinguish between current parser support and aspirational language design.

When generating a migration delta, avoid claiming exact `ALTER` statements unless both the old and new PGML states are available. If only one state is available, generate full DDL or describe the likely migration steps instead of pretending a diff exists.

When the user asks what changed in PGML:

- Diff the selected version pair when the PGML document already contains version history.
- Diff the working `.pgml` file against `HEAD` only when the user is asking about repo changes rather than in-document version history.
- Report semantic schema deltas rather than only line-level text diffs.
- Ignore pure `Properties` changes unless layout changes are the point of the task.
- Ignore pure `SchemaMetadata` changes unless the user is specifically asking about persistent metadata.
- Call out destructive changes separately from additive changes.
- Treat `docs` and `affects` changes as documentation or graph deltas unless the executable `source:` also changed.

When the user asks for a migration file from PGML changes:

- Derive the old state from the selected base snapshot and the new state from the selected target snapshot.
- For forward version lineage, prefer one migration file per version transition instead of one monolithic delta.
- Use sortable numeric prefixes such as `001-`, `002-`, and `003-` so files replay in order.
- Prefer a delta migration over full schema recreation.
- Follow the repo migration convention if one exists.
- If no convention exists and the user explicitly asks for a file, create `migrations/<timestamp>_pgml_delta.sql`.
- Default to a forward-only migration unless the repo convention or user request requires a down migration.
- Mark ambiguous rename-like changes as needing confirmation instead of silently treating them as renames.

## Guardrails

Do not do the following:

- Do not treat `Properties` blocks as database structure.
- Do not infer columns, relationships, or schemas that are not present.
- Do not rewrite executable `source:` into a simplified form and present it as authoritative.
- Do not assume unknown modifiers have valid PostgreSQL semantics.
- Do not emit duplicate foreign keys when PGML repeats an edge inline and at top level.
- Do not confuse documentation text with executable behavior.

When ambiguity remains, call it out directly and explain which result is certain versus inferred.

## Repo-Specific Grounding

Use repo sources in this order when the language behavior is uncertain:

1. `app/utils/pgml.ts` for actual parser behavior.
2. `app/utils/pgml-document.ts` for versioned document grammar, checkpoints, and `SchemaMetadata`.
3. `app/utils/pgml-version-migration.ts` for history-aware SQL and Kysely migration behavior.
4. `README.md` and `app/pages/spec.vue` for the draft spec and supported objects.
5. `test/unit/pgml-model.test.ts` and related PGML tests for supported edge cases.

Keep the parser first because the app behavior is what downstream agents will actually hit in this repository.

## Additional Resources

Consult these bundled references as needed:

- `references/pgml-syntax.md` for the current PGML surface area, object syntax, and parser caveats.
- `references/pgml-to-postgres-sql.md` for DDL ordering, translation rules, migration planning, and query-authoring guidance.
- `references/pgml-diff-and-migrations.md` for version-aware compare workflow, semantic change classification, and ordered migration-file generation.
