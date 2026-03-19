# PGML Diff And Migrations

Use this file when the task is to explain what changed in a `.pgml` file or to create a migration from PGML deltas.

## Default Diff Baseline

Compare the current working-tree PGML against the committed copy at `HEAD` unless the user explicitly names another revision, branch, or merge base.

Use these rules:

- working tree file = new state
- `HEAD:path/to/file.pgml` = old state
- untracked `.pgml` file = all-added schema
- deleted `.pgml` file = all-removed schema
- renamed file with the same schema content = file move, not schema change

If the user asks about changes across a branch or commit range instead of the current working tree, compare against the revision they named rather than defaulting to `HEAD`.

## File Discovery

When the user does not name a specific `.pgml` file, discover candidate files before diffing.

Useful commands:

```bash
git diff --name-only HEAD -- '*.pgml'
git ls-files --others --exclude-standard -- '*.pgml'
rg --files -g '*.pgml'
```

If multiple `.pgml` files changed, diff each file and then aggregate the semantic changes into one report or one migration plan.

## Raw Diff Workflow

Use raw git diff to confirm what changed textually:

```bash
git diff --no-ext-diff -- path/to/file.pgml
git show HEAD:path/to/file.pgml
```

Use the raw diff as supporting evidence, not as the final schema analysis. A useful PGML diff must be semantic, not only textual.

## Semantic Diff Workflow

Follow this sequence:

1. Load the old PGML source from the committed revision.
2. Load the new PGML source from the working tree.
3. Strip `Properties` blocks from both sources unless the user explicitly asks about layout or diagram changes.
4. Parse or inventory both PGML states by object kind.
5. Compare the following categories:
   - custom types
   - sequences
   - tables
   - columns
   - inline and top-level references
   - constraints
   - indexes
   - functions
   - procedures
   - triggers
6. Classify each change as one of:
   - added
   - removed
   - modified
   - documentation-only
   - layout-only
7. Call out destructive changes separately from additive or compatible changes.

## Ignore Non-Database Deltas By Default

Do not generate migration SQL for these changes unless the user explicitly asks for them:

- `Properties` block changes
- `docs {}` changes by themselves
- `affects {}` changes by themselves

Those changes matter for understanding intent and graph shape, but they do not change PostgreSQL schema state on their own.

## Change Classification Rules

Use these default interpretations when classifying semantic changes.

### Tables

- new table -> `CREATE TABLE`
- removed table -> `DROP TABLE`
- apparent rename -> treat as drop plus create unless the user explicitly confirms a rename

Do not guess renames purely from similarity. Renames are migration-sensitive and can destroy data if guessed incorrectly.

### Columns

- added column -> `ALTER TABLE ... ADD COLUMN`
- removed column -> `ALTER TABLE ... DROP COLUMN`
- type change -> `ALTER TABLE ... ALTER COLUMN ... TYPE ...`
- nullable change -> `SET NOT NULL` or `DROP NOT NULL`
- default change -> `SET DEFAULT` or `DROP DEFAULT`
- `unique` change -> add or drop a unique constraint
- `ref:` change -> add or drop a foreign key

Treat a removed column plus an added column as a rename only when the user or surrounding task explicitly states that intent.

### Constraints And Indexes

- added constraint -> `ALTER TABLE ... ADD CONSTRAINT ...`
- removed constraint -> `ALTER TABLE ... DROP CONSTRAINT ...`
- changed check expression -> drop and recreate constraint unless the repo convention specifies another pattern
- added index -> `CREATE INDEX`
- removed index -> `DROP INDEX`
- changed index method or columns -> drop and recreate index

### Custom Types

- added enum -> `CREATE TYPE ... AS ENUM`
- added enum label -> `ALTER TYPE ... ADD VALUE`
- removed enum label, reordered enum labels, or renamed enum labels -> flag as manual or high-risk migration work
- added domain -> `CREATE DOMAIN`
- changed domain base or check -> treat as explicit domain migration work and call out data risk
- added composite -> `CREATE TYPE ... AS (...)`
- changed composite fields -> treat as explicit type migration work and call out compatibility risk

### Sequences

- added sequence -> `CREATE SEQUENCE`
- removed sequence -> `DROP SEQUENCE`
- changed options -> `ALTER SEQUENCE` when feasible
- changed ownership -> `ALTER SEQUENCE ... OWNED BY ...`

### Functions And Procedures

Use these rules:

- signature unchanged, body changed -> prefer `CREATE OR REPLACE`
- signature changed -> treat as drop plus create unless PostgreSQL-compatible replacement semantics are certain
- metadata changed only because it was derived from `source:` -> emit SQL from the updated `source:`

Prefer embedded routine `source:` over reconstructing function or procedure SQL from summary metadata.

### Triggers

Treat most trigger changes as drop plus create:

- new trigger -> `CREATE TRIGGER`
- removed trigger -> `DROP TRIGGER ... ON ...`
- changed timing, events, target table, function, or arguments -> drop and recreate trigger

## Migration File Workflow

When the user asks to create a migration file, follow this sequence:

1. Compute the semantic PGML diff.
2. Check the repo for an existing migration location and naming convention.
3. Follow the repo convention if present.
4. If no convention exists and the user explicitly asked for a file, create:

```text
migrations/<timestamp>_pgml_delta.sql
```

Use a sortable timestamp format such as `YYYYMMDDHHMMSS`.

Default to forward-only migration content unless:

- the repo clearly uses up/down pairs
- the user explicitly asks for a rollback migration

## Repo Convention Discovery

Check for migration conventions before inventing one.

Useful commands:

```bash
rg --files -g 'migrations/**' -g 'db/migrations/**' -g 'sql/**' -g '*.sql'
rg -n "migration|migrations|ALTER TABLE|CREATE TABLE" .
```

Look for:

- migration directory names
- filename timestamp patterns
- SQL headers or transaction wrappers
- one-file versus up/down conventions

## Suggested Migration File Shape

When no stronger convention exists, use a simple forward migration format:

```sql
-- Derived from PGML diff against HEAD
-- Source file: path/to/schema.pgml
-- Summary:
-- - add public.orders.status
-- - drop public.orders.old_total_cents

BEGIN;

-- SQL deltas here

COMMIT;
```

If a change is destructive or ambiguous, add a short comment above it rather than hiding the risk.

## Reporting What Changed

When the user asks for a change summary rather than a migration file, report changes in semantic categories:

- added schema objects
- removed schema objects
- modified schema objects
- documentation-only changes
- layout-only changes
- risky or destructive changes

Keep line-level git diff excerpts secondary. Lead with the schema meaning of the diff.
