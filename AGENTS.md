# GCS-SSC Agent Operating Manual

This file is the canonical operating guide for AI agents and developers working in this repository.

**CRITICAL:** Read this file before starting any task. If it conflicts with external docs, this file wins.

---

## Project Context

`pgml` is a an extension to DBML. This app codes the specifications and provides a visualizer.

---

## Critical Rules (Read First)

1. **Do not deviate from the project stack.**
   - Runtime: Bun
   - Framework: Nuxt 4 + Vue 3 (Composition API, `<script setup lang="ts">`) + client-side rendered app
   - UI: Nuxt UI v4 (Tailwind-based)
   - Data fetching: `useFetch` / `$fetch`
   - Linting: ESLint (flat config)

2. **Testing is mandatory for new behavior.**
   - Feature work is incomplete without corresponding automated tests.

3. **NEVER USE JSX**
   - Always use the usual HTML type `<template></template> type SFC.

4. **Prefer explicit**
   - Use explicit props/defaults instead of relying on fallback operators (`??` or `||`) when possible.
   - Use optional chaining (`?.`) only when access can legitimately be absent.

5. **ALWAYS add tests to 80% coverage**
   - Testing is mandatory for new behavior; feature work is incomplete without corresponding automated tests and must maintain 80%+ coverage.

6. **Avoid writable computed properties**
   - When possible, do not implement writable computed properties (getters/setters) to update state. Try using ref/reactive.

7. **Prefer reactive props destructure in `<script setup>`**
   - `const { agencyId } = defineProps<{ agencyId: string }>()`
   - `const { showButton = true } = defineProps<{ showButton?: boolean }>()`
   - Avoid `withDefaults(defineProps())` when destructuring in this codebase due to Nuxt typecheck instability.

8. **Prefer nanoid for unique keys**
   - When iterating without a stable key in a v-for or if you need a temporary key, use nanoid instead of `crypto.randomUUID()`, `crypto.getRandomValues()`, or Node crypto UUID/byte generators.
   - Do not call `nanoid()` inside template/render paths (for example directly in `v-for` keys); generate once when creating/loading the item and store it so keys stay stable across re-renders.

---

## Delivery Workflow (Required Sequence)

### Before Coding

- If requirements are unclear, clarify before implementation.
- Try to split tasks into smaller chunks and re-read this file before beginning a new task to prioritize and refresh your context
- If you run out of context and compact the existing context then re-read this file

## Coding and Style Standards (**YOU MUST FOLLOW THESE**)

### Zod Guardrails

- Do not call `.partial()` on schemas already using `.refine()`/`.superRefine()`.
- Required pattern:
  - `Base = z.object({...})`
  - `Create = Base.refine(...)`
  - `Patch = Base.partial().superRefine(...)`

### Function Style

- **HEAVILY PREFER arrow functions over the `function` keyword**: Use `const myFn = (...) => { ... }` for all local and exported functions.
  - **Apply to**: Composables, utilities, helper functions inside components, and server logic.
  - **Why**: Ensures architectural consistency, provides cleaner syntax, and avoids legacy `this` binding behavior.
  - **Example**:
    - Good: `export const useMyComposable = () => { ... }`
    - Bad: `export function useMyComposable() { ... }`

### Variable Typing Style

Use explicit type annotation on the variable, not generic on `ref(...)` call.

- Good: `const data: Ref<T | null> = ref(null)`
- Bad: `const data = ref<T | null>(null)`
- Good: `const selectedAgency: Ref<Partial<AgencyProfileItem> | null> = ref(null)`
- Bad: `const selectedAgency = ref<Partial<AgencyProfileItem> | null>(null)`

For form state, use `Partial<T>` to support empty initialization while preserving type safety.

### Initial Item Pattern (Null vs. Empty Object)

Prefer `null` as the initial value for reactive refs that hold form state or selected items (e.g., in modals or wizards).

- **Why**:
  - **Explicit Lifecycle**: `null` signals that no item is currently being worked on.
  - **Template Control**: Enables `v-if="state"` in templates to prevent sub-components from rendering with partial or invalid data, ensuring a clean state upon every activation.
  - **Validation Isolation**: Prevents Zod validation from running against an "empty" object before the user has even interacted with the form.
  - **Clean Reset**: Closing a modal or cancelling an action simply requires setting the ref back to `null`, which is cleaner than trying to "zero out" an existing object.
- **Pattern**:
  - Initialize as `null`: `const state: Ref<T | null> = ref(null)`
- Do not create `*Initial` form objects with empty-string placeholders for modal/wizard item creation. Prefer null-first state and assign values only when the user creates/edits an item.

### UI Interaction Standards

- Cursor behavior:
  - buttons/UI controls: `cursor: default`
  - text links: `cursor: pointer`
- Icons: Lucide via Nuxt UI (`i-lucide-...`)
- Save actions: use `CommonSaveButton` by default so save icon, loading state, and disabled behavior stay consistent across the app. Only use raw `UButton` for save actions when there is a deliberate exception.

---

## Maintainability Refactor Guidance (Behavior-Preserving)

When touching existing logic, apply additive refactors that reduce duplication without changing behavior.

- Prefer typed maps/records over long `switch` or `if/else` chains for step labels, guidance, and error-prefix routing.
- In `Zod.superRefine(...)`, extract shared uniqueness logic into a small local helper (for example `validateUniqueByKey(...)`) when pattern repeats.
- If utility files duplicate common primitives (for example text normalization or duplicate detection), extract shared primitives into a common utility module and keep domain-specific key builders local.
- Preserve API contracts and behavior unless explicitly asked to change them:
  - response shape
  - error codes/keys
  - validation paths
  - user-visible behavior

---

# Completion Gate

- Add regression tests for each new failure mode (validation, auth, business rule).
- Run full local verification:
  - `bun run lint`
  - `bun run typecheck`
  - `bun run test:unit`
  - `bun run test:coverage`
  - relevant Playwright e2e using the `test:e2e:fast` or `test:e2e:fast:spec` command
- If any step is skipped, explicitly state what and why.
