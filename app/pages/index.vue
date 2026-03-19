<script setup lang="ts">
const pageOutline = [
  { id: 'reasons', label: 'Why PGML' },
  { id: 'dbml', label: 'DBML Compatibility' },
  { id: 'documentation', label: 'Documentation' }
]

const reasons = [
  {
    title: 'Keep schema reviews readable',
    description: 'Use PGML when raw SQL migrations are too noisy for design review and you want one document that explains the shape of the system.'
  },
  {
    title: 'Diff the intent, not just the SQL',
    description: 'PGML keeps structure, behavior, and layout in one textual format, which makes pull request diffs easier to scan so reviewers can see exactly what changed.'
  },
  {
    title: 'Model operational Postgres objects with the tables',
    description: 'Functions, procedures, triggers, sequences, constraints, and custom types stay next to the relational model instead of being scattered across migration files.'
  },
  {
    title: 'Drive the visual studio from the source',
    description: 'The same PGML document powers the diagram canvas, connector routing, local persistence, and saved layout state.'
  },
  {
    title: 'Generate migrations deterministically',
    description: 'Because the schema is captured in a structured document instead of ad hoc SQL edits, PGML can be used as a deterministic input for migration generation and change planning.'
  },
  {
    title: 'Reduce AI ambiguity',
    description: 'PGML gives AI tooling a clearer, schema-specific representation of intent. With a repo-aware PGML skill, that means less room for misreading requirements than working from loosely described SQL changes.'
  },
  {
    title: 'Preserve intent, not just DDL',
    description: 'PGML can keep docs, affects metadata, and embedded Properties blocks so the saved source explains what matters beyond the CREATE statement.'
  }
]

const dbmlComparison = [
  {
    title: 'Stays close to DBML',
    points: [
      'Table blocks keep the familiar DBML shape.',
      'Inline column attributes like pk, unique, not null, and ref stay compact.',
      'TableGroup keeps the one-table-per-line pattern for domain grouping.',
      'The source remains block-based and easy to diff.'
    ]
  },
  {
    title: 'Extends where Postgres needs more',
    points: [
      'Adds first-class functions, procedures, triggers, sequences, and custom types.',
      'Supports source-first executable objects with embedded SQL or PL/pgSQL.',
      'Allows docs and affects blocks when you need explicit narrative or dependency hints.',
      'Persists studio state back into PGML with Properties blocks.'
    ]
  }
]

const documentationExamples = [
  {
    title: 'Tables and references',
    description: 'Start with DBML-like table blocks. Keep columns first, then table-level indexes and constraints.',
    code: `Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  total_cents integer [not null]
  status text [not null]

  Index idx_orders_status (status) [type: btree]
  Constraint chk_total: total_cents >= 0
}`
  },
  {
    title: 'Table groups',
    description: 'Use TableGroup to cluster related tables in source and in the studio canvas.',
    code: `TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}`
  },
  {
    title: 'Executable objects',
    description: 'Use source blocks for the real SQL, then layer docs or affects only when they help explain behavior.',
    code: `Function register_entity(entity_kind text) returns trigger [replace] {
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
}`
  },
  {
    title: 'Layout properties',
    description: 'The studio writes Properties blocks back into PGML so the document can reopen with the same layout and presentation state.',
    code: `Properties "group:Commerce" {
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
}`
  }
]

const heroQuickStartCode = `TableGroup Commerce {
  products
  orders
  order_items
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
}`
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-12 lg:gap-16">
    <section class="grid min-w-0 items-start gap-8 border-b border-[color:var(--studio-shell-border)] pb-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] lg:gap-10 lg:pb-12">
      <div class="flex min-w-0 flex-col gap-5">
        <div class="flex flex-col gap-3">
          <span class="font-mono text-[0.9rem] font-semibold uppercase tracking-[0.22em] text-[color:var(--studio-shell-label)] sm:text-[1rem]">
            PGML
          </span>
          <h1 class="max-w-3xl text-3xl font-semibold tracking-[-0.03em] text-[color:var(--studio-shell-text)] sm:text-4xl">
            Write Postgres as a readable schema document instead of raw SQL.
          </h1>
          <p class="max-w-2xl text-sm leading-7 text-[color:var(--studio-shell-muted)] sm:text-[0.97rem]">
            PGML stays close to DBML for tables and references, then extends it for the Postgres objects that shape real systems:
            functions, procedures, triggers, sequences, constraints, custom types, and embedded layout state. The goal is simple:
            one source file that is easy to read in a pull request and useful enough to drive the diagram studio directly.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <UButton
            to="/diagram"
            label="Open Diagram Studio"
            trailing-icon="i-lucide-arrow-right"
            color="neutral"
            class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-surface-hover)]"
          />
          <UButton
            to="#documentation"
            label="Read the docs"
            color="neutral"
            variant="ghost"
            class="rounded-none border border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          />
        </div>
      </div>

      <div class="min-w-0 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]">
        <div class="flex items-center justify-between border-b border-[color:var(--studio-shell-border)] px-4 py-3">
          <div>
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
              Example
            </div>
            <p class="mt-1 text-sm text-[color:var(--studio-shell-muted)]">
              A compact PGML draft with groups, tables, and executable source.
            </p>
          </div>
          <span class="border border-[color:var(--studio-shell-border)] px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[color:var(--studio-shell-muted)]">
            Spec
          </span>
        </div>

        <pre
          data-testid="hero-quick-start"
          class="spec-code-block max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]"
        >{{ heroQuickStartCode }}</pre>
      </div>
    </section>

    <div class="grid min-w-0 gap-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      <aside class="lg:sticky lg:top-24 lg:self-start">
        <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-4">
          <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
            On This Page
          </div>

          <nav class="mt-4 flex flex-col gap-2">
            <a
              v-for="item in pageOutline"
              :key="item.id"
              :href="`#${item.id}`"
              class="border-l border-transparent pl-3 text-sm text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:border-[color:var(--studio-shell-border)] hover:text-[color:var(--studio-shell-text)]"
            >
              {{ item.label }}
            </a>
          </nav>
        </div>
      </aside>

      <div class="flex min-w-0 flex-col gap-10">
        <section
          id="reasons"
          class="scroll-mt-24 pt-0"
        >
          <div class="flex flex-col gap-6">
            <div class="flex flex-col gap-4">
              <div>
                <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                  Why PGML
                </div>
                <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                  Use PGML when the schema is part structure, part behavior, and part documentation.
                </h2>
              </div>

              <p class="max-w-4xl text-sm leading-7 text-[color:var(--studio-shell-muted)]">
                DBML is strong for relational structure. PGML is for the point where that structure is no longer enough on its own:
                Postgres-specific behavior starts mattering, the diagram needs to stay in sync with the source, and the document needs
                to explain more than tables and foreign keys. It is also much easier to diff in reviews, can act as a deterministic
                source for migration generation, and gives AI tooling a format that carries intent more explicitly than free-form schema discussions.
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <article
                v-for="reason in reasons"
                :key="reason.title"
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-4"
              >
                <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                  {{ reason.title }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                  {{ reason.description }}
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          id="dbml"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="flex flex-col gap-4">
            <div>
              <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                DBML Compatibility
              </div>
              <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                PGML is intentionally close to DBML, then opinionated where Postgres needs more surface area.
              </h2>
            </div>

            <div class="grid gap-4 lg:grid-cols-2">
              <article
                v-for="section in dbmlComparison"
                :key="section.title"
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-4"
              >
                <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                  {{ section.title }}
                </h3>
                <div class="mt-4 flex flex-col gap-3 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                  <p
                    v-for="point in section.points"
                    :key="point"
                  >
                    {{ point }}
                  </p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section
          id="documentation"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="flex flex-col gap-4">
            <div>
              <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                Documentation
              </div>
              <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                The language is block-based, readable, and meant to be learned from examples.
              </h2>
              <p class="mt-3 max-w-3xl text-sm leading-7 text-[color:var(--studio-shell-muted)]">
                Start with table structure, add groups to cluster domains, use source blocks for executable objects, and let the studio
                persist layout back into the same document with Properties. The examples below cover the current surface area used by this app.
              </p>
            </div>

            <div class="flex flex-col gap-4">
              <article
                v-for="example in documentationExamples"
                :key="example.title"
                class="grid gap-0 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] xl:grid-cols-[minmax(240px,0.34fr)_minmax(0,0.66fr)]"
              >
                <div class="border-b border-[color:var(--studio-shell-border)] px-4 py-4 xl:border-r xl:border-b-0">
                  <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                    {{ example.title }}
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                    {{ example.description }}
                  </p>
                </div>

                <pre class="spec-code-block max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]">{{ example.code }}</pre>
              </article>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
