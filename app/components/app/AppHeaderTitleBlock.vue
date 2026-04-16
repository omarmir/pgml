<script setup lang="ts">
const { detail, isStudioSchemaName = false, title } = defineProps<{
  detail: string
  isStudioSchemaName?: boolean
  title: string
}>()
</script>

<template>
  <div class="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[24rem] min-w-0 -translate-x-1/2 -translate-y-1/2 px-2 md:flex">
    <div class="min-w-0 text-center">
      <p
        data-app-header-title="true"
        :data-studio-schema-name="isStudioSchemaName ? 'true' : undefined"
        class="inline-block max-w-full truncate text-[0.82rem] font-semibold tracking-[0.01em] text-[color:var(--studio-shell-text)]"
      >
        {{ title }}
      </p>
      <p class="inline-block max-w-full truncate font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--studio-shell-muted)]">
        {{ detail }}
      </p>
    </div>
  </div>
</template>
