<script setup lang="ts">
import { useStudioTheme } from '~/composables/useStudioTheme'

const { studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()
</script>

<template>
  <button
    type="button"
    class="grid h-7 w-7 place-items-center border border-transparent text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
    :aria-label="studioThemeLabel"
    :title="studioThemeLabel"
    @click="toggleStudioTheme"
  >
    <UIcon
      :name="studioThemeIcon"
      class="h-3.5 w-3.5"
    />
  </button>
</template>
