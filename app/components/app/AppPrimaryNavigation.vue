<script setup lang="ts">
import type { PrimaryNavigationItem } from '~/composables/usePrimaryNavigation'

const { items } = defineProps<{
  items: PrimaryNavigationItem[]
}>()
</script>

<template>
  <nav
    class="hidden items-center gap-1 lg:flex"
    aria-label="Primary"
  >
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="no-underline"
      :class="item.isActive
        ? 'border-b border-[color:var(--studio-shell-label)] px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[color:var(--studio-shell-text)] transition-colors duration-150'
        : 'border-b border-transparent px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:border-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]'"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
