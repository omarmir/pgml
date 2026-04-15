<script setup lang="ts">
import StudioWorkspacePage from '~/components/studio/StudioWorkspacePage.vue'

definePageMeta({
  layout: 'studio',
  middleware: 'require-studio-launch'
})
</script>

<template>
  <StudioWorkspacePage workspace-mode="analysis" />
</template>
