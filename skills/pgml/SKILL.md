---
name: PGML
description: This skill should be used when the user asks to "parse PGML", "understand a .pgml schema", "translate PGML to Postgres SQL", "write PostgreSQL SQL from PGML", "write PostgreSQL queries from PGML", "review a PGML schema", "see what's changed in the PGML", "diff the PGML", "create a migration from the PGML changes", or "generate migrations from PGML".
version: 0.1.0
---

# PGML

Use this skill to interpret PGML documents in this repository and turn them into accurate PostgreSQL understanding, DDL, migration plans, or query SQL.

Treat PGML as a Postgres-first extension of DBML. Keep the language close to DBML for table structure, then extend the mental model for Postgres-native objects such as functions, procedures, triggers, sequences, constraints, and custom types. Favor the current parser behavior over speculative syntax. In this repo, the canonical runtime behavior lives in `app/utils/pgml.ts`; the public language narrative lives in `README.md` and the homepage examples in `app/pages/index.vue`.

Treat `TableGroup` as a source-organization and studio-layout concept, not as a PostgreSQL schema namespace. PostgreSQL schema is carried by the table name itself, for example `public.orders` or `billing.invoices`. A group like `TableGroup Commerce { ... }` does not create, rename, or imply a PostgreSQL schema.

## When To Use This Skill

Load this skill when the task involves any of the following:

- Parse or explain a `.pgml` file.
- Extract schema structure from PGML.
- Translate PGML into PostgreSQL DDL.
- Write application SQL against a schema described in PGML.
- Review PGML for correctness, completeness, or ambiguity.
- Diff a changed `.pgml` file against the committed copy.
- Plan migrations from one PGML version to another.
- Create a migration file from PGML deltas.

## Working Model

Start by classifying the request into one of four modes:

1. Schema understanding: explain tables, types, routines, triggers, relationships, or domain boundaries.
2. DDL generation: produce `CREATE TYPE`, `CREATE TABLE`, `ALTER TABLE`, `CREATE FUNCTION`, `CREATE TRIGGER`, and related SQL.
3. Query authoring: write `SELECT`, `INSERT`, `UPDATE`, `DELETE`, or `CALL` statements grounded in the schema.
4. Diff or migration planning: compare PGML states, identify semantic schema changes, and generate delta SQL when requested.

State the chosen mode when ambiguity matters. If the user asks for "SQL from PGML", resolve whether the requested output is:

- full schema DDL
- a migration delta
- application queries
- a mixed result

If the mode is unclear and the difference changes the result materially, ask a short clarifying question. Otherwise, make the smallest reasonable assumption and continue.

## Core Workflow

Follow this sequence:

1. Read the PGML source.
2. Ignore `Properties` blocks unless layout persistence is part of the task.
3. Inventory the schema objects:
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
4. Normalize names:
   - treat unqualified table names as `public.<table>`
   - treat two-part reference targets as `public.<table>.<column>`
5. Deduplicate relationships if the same foreign-key edge appears both inline and as a top-level `Ref:`.
6. Decide which content is authoritative:
   - table and custom-type blocks are declarative structure
   - `docs {}` and `affects {}` are annotations, not DDL
   - executable `source:` blocks are authoritative for functions, procedures, triggers, and often sequences
7. Generate or explain SQL from the normalized object inventory.
8. Validate dependencies before finalizing the answer.

When the task is a diff or migration task, insert this extra step between inventory and SQL generation:

1. Load the committed PGML source from `HEAD` by default.
2. Treat the current working-tree PGML as the new state.
3. Strip `Properties` blocks before semantic diffing unless the user explicitly asks about layout changes.
4. Compare the old and new PGML object inventories by object kind.
5. Separate documentation-only changes from database changes.
6. Generate migration SQL only from the database changes.

## Authoritative Source Rules

Use these precedence rules:

- Prefer explicit executable `source:` SQL over reconstructed SQL when `source:` exists.
- Prefer parser-supported syntax over informal assumptions.
- Prefer `docs {}` and `affects {}` to infer intent, graph edges, and operational semantics.
- Prefer exact names from PGML over idiomatic renaming.

When reconstructing SQL from declarative PGML instead of embedded source, mark that SQL as inferred. When reusing embedded `source:` text, treat it as authored truth and preserve behavior unless the task explicitly asks for a rewrite.

## PGML Semantics That Matter

Keep these distinctions straight:

- `Table`, `Enum`, `Domain`, `Composite`, `Sequence`, `Function`, `Procedure`, and `Trigger` describe schema assets.
- `TableGroup` organizes tables in source and in the diagram studio; it does not map to a PostgreSQL schema.
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

- Verify that every `ref:` and `Ref:` target exists.
- Verify that sequence defaults reference created sequences.
- Verify that triggers refer to existing functions and target tables.
- Verify that custom types referenced by columns exist.
- Verify that inferred groups and `in GroupName` declarations do not drift.
- Flag executable objects whose `docs` or `affects` claims are contradicted by `source:`.
- Distinguish between current parser support and aspirational language design.

When generating a migration delta, avoid claiming exact `ALTER` statements unless both the old and new PGML states are available. If only one state is available, generate full DDL or describe the likely migration steps instead of pretending a diff exists.

When the user asks what changed in PGML:

- Diff the working `.pgml` file against `HEAD` unless the user names a different revision.
- Report semantic schema deltas rather than only line-level text diffs.
- Ignore pure `Properties` changes unless layout changes are the point of the task.
- Call out destructive changes separately from additive changes.
- Treat `docs` and `affects` changes as documentation or graph deltas unless the executable `source:` also changed.

When the user asks for a migration file from PGML changes:

- Derive the old state from the committed PGML and the new state from the working-tree PGML.
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
2. `README.md` for the draft spec and supported objects.
3. `app/pages/index.vue` for the concrete examples shown at `/`.
4. `test/unit/pgml-model.test.ts` and related PGML tests for supported edge cases.

Keep the parser first because the app behavior is what downstream agents will actually hit in this repository.

## Additional Resources

Consult these bundled references as needed:

- `references/pgml-syntax.md` for the current PGML surface area, object syntax, and parser caveats.
- `references/pgml-to-postgres-sql.md` for DDL ordering, translation rules, migration planning, and query-authoring guidance.
- `references/pgml-diff-and-migrations.md` for committed-vs-working diff workflow, semantic change classification, and migration-file generation.
