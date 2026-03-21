<script setup lang="ts">
import { usePrimaryNavigation } from '~/composables/usePrimaryNavigation'
import { useStudioTheme } from '~/composables/useStudioTheme'

const pageTitle = 'PGML'
const pageDetail = 'Postgres-first markup language'
const { navigationItems } = usePrimaryNavigation()
const { studioTheme } = useStudioTheme()
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    class="min-h-screen w-full bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200"
  >
    <div class="relative mx-auto flex min-h-screen w-full min-w-0 max-w-[1480px] flex-col px-4 sm:px-6 lg:px-8">
      <header class="sticky top-0 z-40 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/94 backdrop-blur">
        <div class="relative flex min-h-[3.6rem] items-center justify-between gap-3 py-2">
          <div class="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
            <AppBrandLink />
            <AppPrimaryNavigation :items="navigationItems" />
          </div>

          <AppHeaderTitleBlock
            :detail="pageDetail"
            :title="pageTitle"
          />

          <div class="flex shrink-0 items-center gap-1.5">
            <AppMobileNavigationMenu :navigation-items="navigationItems" />
            <AppThemeToggleButton />
          </div>
        </div>
      </header>

      <main class="flex-1 pb-14 pt-8 sm:pt-10">
        <slot />
      </main>

      <footer class="border-t border-[color:var(--studio-shell-border)] py-5 text-sm text-[color:var(--studio-shell-muted)]">
        PGML extends DBML toward Postgres-native schema design and visual documentation.
      </footer>
    </div>
  </div>
</template>
