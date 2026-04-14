<script setup lang="ts">
import StudioAnalysisWorkspacePage from '~/components/studio/StudioAnalysisWorkspacePage.vue'

definePageMeta({
  layout: 'studio',
  middleware: 'require-studio-launch'
})
</script>

<template>
  <StudioAnalysisWorkspacePage />
</template>
