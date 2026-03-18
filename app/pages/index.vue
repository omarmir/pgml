<script setup lang="ts">
const syntaxCards = [
  {
    title: 'Core block model',
    description: 'PGML extends DBML with Postgres-native object blocks. Keep the syntax readable, diffable, and structured like source code instead of handwritten SQL migrations.',
    code: `Table public.orders in Commerce {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  status text [not null]
  total_cents integer [not null]
  Index idx_orders_status (status) [type: btree]
  Constraint chk_total: total_cents >= 0
}`
  },
  {
    title: 'Group related tables',
    description: 'Table groups influence both organization in source and layout in the diagram studio. Use them to cluster domains like identity, billing, analytics, or fulfillment.',
    code: `TableGroup Commerce {
  tables: [products, orders, order_items]
  Note: buying flow and inventory edges
}`
  },
  {
    title: 'Describe Postgres objects',
    description: 'Functions, procedures, triggers, sequences, enums, domains, and composites are first-class schema assets. The studio catalogs them beside the ER graph.',
    code: `Function recalc_order_total(order_uuid uuid) returns void {
  language: plpgsql
  volatility: volatile
}

Trigger trg_orders_audit on public.orders {
  timing: after
  events: [insert, update]
  execute: audit_order_changes()
}`
  }
]

const supportedFeatures = [
  {
    icon: 'i-lucide-table-properties',
    title: 'Tables, constraints, and indexes',
    description: 'Define columns, primary keys, foreign keys, checks, uniqueness, and Postgres index types in a DBML-like structure.'
  },
  {
    icon: 'i-lucide-layers-3',
    title: 'Table groups and schemas',
    description: 'Model bounded contexts explicitly so the diagram engine lays out tables by domain instead of dumping everything into one grid.'
  },
  {
    icon: 'i-lucide-function-square',
    title: 'Routines and triggers',
    description: 'Capture procedural behavior with functions, procedures, and triggers as schema objects rather than loose migration comments.'
  },
  {
    icon: 'i-lucide-scroll-text',
    title: 'Custom Postgres types',
    description: 'Represent enums, domains, and composite types in the same document so data shape and database behavior stay in one source of truth.'
  }
]

const roadmap = [
  'Tables and partitioned tables',
  'Indexes including B-tree, GIN, GiST, BRIN, and hash',
  'Views and materialized views',
  'Schemas, extensions, and foreign tables',
  'Operators, collations, casts, and rules',
  'Text search dictionaries and configurations',
  'Publications and subscriptions for logical replication'
]
</script>

<template>
  <div class="page-grid">
    <section class="hero-panel glass-panel">
      <span class="eyebrow">DBML-inspired · Postgres-native</span>
      <h1 class="hero-title">
        Define Postgres as markup, not SQL.
      </h1>
      <p class="hero-copy">
        PGML is a schema language for Postgres that starts with DBML ergonomics and grows into Postgres-specific structure.
        It lets you describe tables, indexes, triggers, functions, procedures, sequences, constraints, and custom types in one readable artifact,
        then render the whole database as a grouped visual map.
      </p>

      <div class="hero-actions">
        <UButton
          to="/diagram"
          label="Launch Diagram Studio"
          size="xl"
          trailing-icon="i-lucide-arrow-right"
        />
        <UButton
          to="#syntax"
          label="Read The Spec"
          size="xl"
          color="neutral"
          variant="outline"
        />
      </div>

      <div class="hero-stats">
        <div class="stat-card">
          <strong>Phase 1</strong>
          <span>Postgres core objects</span>
        </div>
        <div class="stat-card">
          <strong>Syntax</strong>
          <span>Readable, block-based, diffable</span>
        </div>
        <div class="stat-card">
          <strong>Layout</strong>
          <span>Table groups drive diagram clusters</span>
        </div>
      </div>
    </section>

    <section class="section-stack">
      <div class="section-title">
        <div>
          <span class="eyebrow">Why PGML</span>
          <h2>Designed for schema authorship, not migration noise</h2>
        </div>
        <p>
          The language is meant to be a source format for architecture and visualization. Write intent once, then derive diagrams,
          documentation, and eventually SQL generation from the same model.
        </p>
      </div>

      <div class="feature-grid">
        <article
          v-for="feature in supportedFeatures"
          :key="feature.title"
          class="feature-card"
        >
          <span class="feature-icon">
            <UIcon :name="feature.icon" />
          </span>
          <h3>{{ feature.title }}</h3>
          <p>{{ feature.description }}</p>
        </article>
      </div>
    </section>

    <section
      id="syntax"
      class="section-stack"
    >
      <div class="section-title">
        <div>
          <span class="eyebrow">Page 1 · Spec</span>
          <h2>How to write PGML</h2>
        </div>
        <p>
          The grammar stays close to DBML concepts where that helps readability, then adds blocks for Postgres-only objects and layout hints.
        </p>
      </div>

      <div class="syntax-grid">
        <article
          v-for="card in syntaxCards"
          :key="card.title"
          class="syntax-card"
        >
          <h3>{{ card.title }}</h3>
          <p>{{ card.description }}</p>
          <pre class="code-block">{{ card.code }}</pre>
        </article>
      </div>
    </section>

    <section class="section-stack">
      <div class="section-title">
        <div>
          <span class="eyebrow">Grammar Outline</span>
          <h2>Proposed language surface</h2>
        </div>
        <p>
          The initial studio is built around these structures now, while the roadmap expands the language toward full Postgres coverage.
        </p>
      </div>

      <div class="feature-grid">
        <article class="feature-card">
          <h3>Supported in this app</h3>
          <div class="muted-list">
            <p><strong>Tables:</strong> columns, notes, indexes, constraints, inline refs</p>
            <p><strong>TableGroup:</strong> layout clustering and domain grouping</p>
            <p><strong>Functions/Procedures:</strong> routine catalog blocks</p>
            <p><strong>Triggers/Sequences:</strong> operational object cataloging</p>
            <p><strong>Custom types:</strong> enums, domains, composites</p>
          </div>
        </article>

        <article class="feature-card">
          <h3>Future PGML roadmap</h3>
          <div class="muted-list">
            <p
              v-for="item in roadmap"
              :key="item"
            >
              {{ item }}
            </p>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
