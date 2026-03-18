<script setup lang="ts">
const pageOutline = [
  { id: 'overview', label: 'Overview' },
  { id: 'quick-start', label: 'Quick Start' },
  { id: 'core-blocks', label: 'Core Blocks' },
  { id: 'postgres-objects', label: 'Postgres Objects' },
  { id: 'coverage', label: 'Coverage' }
]

const writingPrinciples = [
  {
    title: 'Stay close to DBML',
    description: 'Reuse familiar DBML shapes where possible, then extend them only when Postgres needs more structure.'
  },
  {
    title: 'Treat Postgres objects as schema assets',
    description: 'Indexes, triggers, sequences, functions, procedures, and types live in the same source artifact as tables.'
  },
  {
    title: 'Author for reading first',
    description: 'The source should be easy to scan, easy to diff, and legible enough to explain the model before any SQL is generated.'
  }
]

const syntaxCards = [
  {
    title: 'Table',
    description: 'Keep table blocks close to DBML: columns first, then table-scoped indexes and constraints.',
    code: `Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  total_cents integer [not null]
  Index idx_orders_status (status) [type: btree]
  Constraint chk_total: total_cents >= 0
}`
  },
  {
    title: 'TableGroup',
    description: 'Use DBML-style group blocks with one table per line so related domains cluster in source and in the studio.',
    code: `TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}`
  },
  {
    title: 'Routine blocks',
    description: 'Functions and procedures are schema objects, not footnotes in migrations.',
    code: `Function recalc_order_total(order_uuid uuid) returns void {
  language: plpgsql
  volatility: volatile
}`
  },
  {
    title: 'Operational objects',
    description: 'Triggers, sequences, enums, domains, and composites describe the operational edge of the schema.',
    code: `Trigger trg_orders_audit on public.orders {
  timing: after
  events: [insert, update]
  execute: audit_order_changes()
}`
  }
]

const quickStartCode = `TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}

Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  customer_id uuid [ref: > public.users.id]
  total_cents integer [not null]
  Constraint chk_orders_total: total_cents >= 0
}

Function recalc_order_total(order_uuid uuid) returns void {
  language: plpgsql
  volatility: volatile
}`

const supportedFeatures = [
  {
    label: 'Tables',
    detail: 'Columns, notes, inline refs, table-level indexes, checks, unique constraints, and keys.'
  },
  {
    label: 'Table groups',
    detail: 'DBML-style table lists used to cluster domains and drive grouped layout on the canvas.'
  },
  {
    label: 'Functions and procedures',
    detail: 'Routine catalog blocks with signature and execution metadata.'
  },
  {
    label: 'Triggers and sequences',
    detail: 'Operational objects that can be traced back to the tables and fields they affect.'
  },
  {
    label: 'Custom Postgres types',
    detail: 'Enums, domains, and composites represented as first-class schema definitions.'
  }
]

const roadmap = [
  'Partitioned tables',
  'GIN, GiST, BRIN, hash, and more index families',
  'Views and materialized views',
  'Schemas and extensions',
  'Foreign tables and FDWs',
  'Operators and operator classes',
  'Collations and text search configuration',
  'Rules, casts, publications, and subscriptions'
]
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
            PGML starts with DBML ergonomics, then adds the Postgres objects that matter once a schema becomes real:
            indexes, triggers, functions, procedures, sequences, constraints, and custom types. The source stays compact enough
            to read in a pull request and structured enough to drive a full visual model.
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
            to="#quick-start"
            label="Read the syntax"
            color="neutral"
            variant="ghost"
            class="rounded-none border border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          />
        </div>

        <div class="grid gap-3 sm:grid-cols-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-3">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
              Format
            </div>
            <p class="mt-2 text-sm text-[color:var(--studio-shell-text)]">
              DBML-like blocks with Postgres-native objects.
            </p>
          </div>

          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-3">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
              Studio
            </div>
            <p class="mt-2 text-sm text-[color:var(--studio-shell-text)]">
              Grouped canvas with object-to-table impact lines.
            </p>
          </div>

          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-3">
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
              Direction
            </div>
            <p class="mt-2 text-sm text-[color:var(--studio-shell-text)]">
              Documentation first, SQL generation later.
            </p>
          </div>
        </div>
      </div>

      <div class="min-w-0 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]">
        <div class="flex items-center justify-between border-b border-[color:var(--studio-shell-border)] px-4 py-3">
          <div>
            <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
              Quick Start
            </div>
            <p class="mt-1 text-sm text-[color:var(--studio-shell-muted)]">
              A minimal PGML document with group, table, constraint, and function.
            </p>
          </div>
          <span class="border border-[color:var(--studio-shell-border)] px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-[color:var(--studio-shell-muted)]">
            Spec Draft
          </span>
        </div>

        <pre class="max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]">{{ quickStartCode }}</pre>
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
          id="overview"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
            <div class="flex flex-col gap-4">
              <div>
                <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                  Overview
                </div>
                <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                  PGML is meant to read like architecture, not migration output.
                </h2>
              </div>

              <p class="max-w-3xl text-sm leading-7 text-[color:var(--studio-shell-muted)]">
                The goal is a source format that captures the shape of a Postgres system in one place. Tables and relationships remain central,
                but the surrounding operational objects stay visible too, so a diagram can show what changes data, what constrains it, and what depends on it.
              </p>
            </div>

            <div class="grid gap-3">
              <div
                v-for="principle in writingPrinciples"
                :key="principle.title"
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-3"
              >
                <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                  {{ principle.title }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                  {{ principle.description }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="quick-start"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="flex flex-col gap-4">
            <div>
              <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                Quick Start
              </div>
              <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                Start with groups, then declare tables and Postgres objects around them.
              </h2>
            </div>

            <div class="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
              <div class="min-w-0 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]">
                <div class="border-b border-[color:var(--studio-shell-border)] px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                  Example
                </div>
                <pre class="max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]">{{ quickStartCode }}</pre>
              </div>

              <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] p-4">
                <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                  Reading order
                </div>
                <div class="mt-4 flex flex-col gap-4 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                  <p><span class="text-[color:var(--studio-shell-text)]">1.</span> Use <span class="font-mono text-[color:var(--studio-shell-text)]">TableGroup</span> to describe the domain cluster.</p>
                  <p><span class="text-[color:var(--studio-shell-text)]">2.</span> Define the tables with inline refs and local constraints.</p>
                  <p><span class="text-[color:var(--studio-shell-text)]">3.</span> Add routines, triggers, sequences, and types as sibling schema objects.</p>
                  <p><span class="text-[color:var(--studio-shell-text)]">4.</span> Open the studio to inspect connector impact and grouped layout.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="core-blocks"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="flex flex-col gap-4">
            <div>
              <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                Core Blocks
              </div>
              <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                The current language surface stays compact and block-based.
              </h2>
            </div>

            <div class="grid gap-4 xl:grid-cols-2">
              <article
                v-for="card in syntaxCards"
                :key="card.title"
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]"
              >
                <div class="border-b border-[color:var(--studio-shell-border)] px-4 py-3">
                  <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                    {{ card.title }}
                  </h3>
                  <p class="mt-2 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                    {{ card.description }}
                  </p>
                </div>

                <pre class="max-w-full overflow-x-auto px-4 py-4 font-mono text-[0.77rem] leading-6 text-[color:var(--studio-shell-text)] sm:text-[0.8rem]">{{ card.code }}</pre>
              </article>
            </div>
          </div>
        </section>

        <section
          id="postgres-objects"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="flex flex-col gap-4">
            <div>
              <div class="font-mono text-[0.72rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                Postgres Objects
              </div>
              <h2 class="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                Model the objects that shape behavior around the tables.
              </h2>
            </div>

            <div class="grid gap-3 lg:grid-cols-2">
              <div
                v-for="feature in supportedFeatures"
                :key="feature.label"
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-4 py-4"
              >
                <h3 class="text-sm font-semibold text-[color:var(--studio-shell-text)]">
                  {{ feature.label }}
                </h3>
                <p class="mt-2 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                  {{ feature.detail }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="coverage"
          class="scroll-mt-24 border-t border-[color:var(--studio-shell-border)] pt-6"
        >
          <div class="grid gap-4 lg:grid-cols-2">
            <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-4">
              <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                In This App Today
              </div>
              <div class="mt-4 flex flex-col gap-3 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                <p>Tables with columns, notes, inline refs, constraints, and indexes.</p>
                <p>DBML-style table groups for domain clustering and grouped layout.</p>
                <p>Functions, procedures, triggers, sequences, enums, domains, and composite types.</p>
                <p>Canvas visualization that shows how non-table objects attach back to the relational model.</p>
              </div>
            </div>

            <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] p-4">
              <div class="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">
                Coverage Roadmap
              </div>
              <div class="mt-4 flex flex-col gap-3 text-sm leading-6 text-[color:var(--studio-shell-muted)]">
                <p
                  v-for="item in roadmap"
                  :key="item"
                >
                  {{ item }}
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
