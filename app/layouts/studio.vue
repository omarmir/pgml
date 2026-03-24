<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StudioSchemaSaveState } from '~/stores/studio-shell'
import {
  appHeaderDesktopMenuContent,
  appHeaderDesktopMenuUi
} from '~/constants/ui'
import { usePrimaryNavigation } from '~/composables/usePrimaryNavigation'
import { useStudioHeaderState } from '~/composables/useStudioHeaderState'
import { useStudioTheme } from '~/composables/useStudioTheme'

const schemaStatusIconByState: Readonly<Record<StudioSchemaSaveState, string>> = Object.freeze({
  error: 'i-lucide-x',
  pending: 'i-lucide-loader-circle',
  saved: 'i-lucide-check',
  saving: 'i-lucide-loader-circle'
})

const schemaStatusClassByState: Readonly<Record<StudioSchemaSaveState, string>> = Object.freeze({
  error: 'text-red-500',
  pending: 'animate-spin text-amber-500',
  saved: 'text-emerald-500',
  saving: 'animate-spin text-[color:var(--studio-shell-label)]'
})

const schemaStatusLabelByState: Readonly<Record<StudioSchemaSaveState, string>> = Object.freeze({
  error: 'Attention',
  pending: 'Queued',
  saved: 'Saved',
  saving: 'Saving'
})

const { navigationItems } = usePrimaryNavigation()
const { centerDetail, centerTitle, headerMenus, isActionLoading, schemaStatusData } = useStudioHeaderState()
const { studioTheme } = useStudioTheme()

const schemaStatusIcon = computed(() => {
  return schemaStatusIconByState[schemaStatusData.value.state]
})

const schemaStatusIconClass = computed(() => {
  return schemaStatusClassByState[schemaStatusData.value.state]
})

const schemaStatusLabel = computed(() => {
  return schemaStatusLabelByState[schemaStatusData.value.state]
})

const mobileMenuGroups = computed<DropdownMenuItem[][]>(() => {
  return headerMenus.value.map((menu) => {
    return [{
      children: menu.items.flat(),
      icon: menu.icon,
      label: menu.label
    }]
  })
})
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    class="h-dvh w-full overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200"
  >
    <header class="fixed inset-x-0 top-0 z-50 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/94 backdrop-blur">
      <div class="relative flex min-h-[3.6rem] items-center justify-between gap-3 px-3 py-2 sm:px-4 lg:px-6">
        <div class="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
          <AppBrandLink />
          <AppPrimaryNavigation :items="navigationItems" />

          <ClientOnly v-if="headerMenus.length">
            <div class="hidden items-center gap-1 lg:flex">
              <UDropdownMenu
                v-for="menu in headerMenus"
                :key="menu.id"
                :items="menu.items"
                :content="appHeaderDesktopMenuContent"
                :ui="appHeaderDesktopMenuUi"
              >
                <button
                  type="button"
                  class="cursor-default border-b border-transparent px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:border-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)] data-[state=open]:border-[color:var(--studio-shell-label)] data-[state=open]:bg-[color:var(--studio-surface-hover)] data-[state=open]:text-[color:var(--studio-shell-text)]"
                  :title="menu.label"
                >
                  <span class="inline-flex items-center gap-2">
                    <UIcon
                      :name="menu.icon"
                      class="h-3.5 w-3.5 shrink-0 text-[color:var(--studio-shell-muted)]"
                    />
                    <span>{{ menu.label }}</span>
                    <UIcon
                      v-if="menu.id === 'export' && isActionLoading"
                      name="i-lucide-loader-circle"
                      class="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--studio-shell-label)]"
                    />
                  </span>
                </button>
              </UDropdownMenu>
            </div>
          </ClientOnly>
        </div>

        <AppHeaderTitleBlock
          :detail="centerDetail"
          :is-studio-schema-name="true"
          :title="centerTitle"
        />

        <div class="flex shrink-0 items-center gap-1.5">
          <div
            v-if="schemaStatusData.visible"
            class="hidden items-center md:inline-flex"
            :data-studio-schema-status="schemaStatusData.state"
            :title="schemaStatusData.detail"
          >
            <UIcon
              :name="schemaStatusIcon"
              class="h-3.5 w-3.5 shrink-0"
              :class="schemaStatusIconClass"
              data-studio-schema-status-icon="true"
            />
            <span class="sr-only">{{ schemaStatusLabel }}</span>
          </div>

          <AppMobileNavigationMenu
            :extra-menu-groups="mobileMenuGroups"
            :navigation-items="navigationItems"
          />
          <AppThemeToggleButton />
        </div>
      </div>
    </header>

    <div class="relative flex h-full w-full min-w-0 flex-col overflow-hidden pt-[3.6rem]">
      <main class="min-h-0 flex-1 overflow-hidden">
        <slot />
      </main>
    </div>
  </div>
</template>
