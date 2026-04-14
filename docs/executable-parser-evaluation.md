# Executable Parser Evaluation

## Candidates

- `@pgsql/parser`
- `@supabase/pg-parser`

## Outcome

`@pgsql/parser` was selected for the shipped integration.

## Why

- It exposes a synchronous parse path after one async WASM preload, which fits the current PGML compare and migration pipeline without rewriting those utilities to async.
- It supports PostgreSQL 15, 16, and 17 via versioned entrypoints.
- It parses the executable corpus used in this branch for functions, triggers, and sequences.

## Why not `@supabase/pg-parser`

- The package API is async-only.
- That would require a wider architectural refactor across `parsePgml`, compare normalization, and migration diff generation to propagate async executable analysis.
- For this branch, that cost was not justified against the semantic-compare goals.

## Important limitation

Neither wrapper exposed a dedicated PL/pgSQL body parser in the JS surface used here. This branch therefore uses:

- AST-backed semantic comparison for executable shells
- AST-backed comparison for SQL-language function bodies when the SQL body is parseable
- normalized text fallback for PL/pgSQL bodies
