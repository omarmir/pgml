<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { StudioSchemaSaveState } from '~/composables/useStudioSchemaStatus'
import { tv } from 'tailwind-variants'
import {
  appHeaderDesktopMenuContent,
  appHeaderDesktopMenuUi,
  appHeaderMobileMenuContent,
  appHeaderMobileMenuUi
} from '~/constants/ui'
import { useAppHeader } from '~/composables/useAppHeader'

const shellModeStyles = tv({
  slots: {
    container: 'relative flex w-full min-w-0 flex-col',
    headerInner: 'relative flex min-h-[3.6rem] items-center justify-between gap-3 py-2',
    main: 'flex-1',
    root: 'w-full bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200'
  },
  variants: {
    mode: {
      page: {
        container: 'mx-auto min-h-screen max-w-[1480px] px-4 sm:px-6 lg:px-8',
        main: 'pb-14 pt-8 sm:pt-10',
        root: 'min-h-screen'
      },
      studio: {
        container: 'h-full overflow-hidden',
        headerInner: 'px-3 sm:px-4 lg:px-6',
        main: 'min-h-0 overflow-hidden',
        root: 'h-dvh overflow-hidden'
      }
    }
  }
})

const navigationIconByRoute: Record<string, string> = {
  '/': 'i-lucide-scroll-text',
  '/diagram': 'i-lucide-workflow'
}

const schemaStatusIconByState: Record<StudioSchemaSaveState, string> = {
  error: 'i-lucide-x',
  pending: 'i-lucide-loader-circle',
  saved: 'i-lucide-check-check',
  saving: 'i-lucide-loader-circle'
}

const schemaStatusClassByState: Record<StudioSchemaSaveState, string> = {
  error: 'text-red-500',
  pending: 'animate-spin text-amber-500',
  saved: 'text-emerald-500',
  saving: 'animate-spin text-[color:var(--studio-shell-label)]'
}

const schemaStatusLabelByState: Record<StudioSchemaSaveState, string> = {
  error: 'Attention',
  pending: 'Queued',
  saved: 'Saved',
  saving: 'Saving'
}

const buildMobileThemeItem = (label: string, icon: string, onSelect: () => void): DropdownMenuItem => {
  return {
    icon,
    label,
    onSelect
  }
}

const {
  centerDetail,
  centerTitle,
  currentShellMode,
  desktopNavigation,
  desktopStudioMenus,
  isStudioActionLoading,
  isStudioRoute,
  schemaStatusData,
  studioTheme,
  studioThemeIcon,
  studioThemeLabel,
  toggleStudioTheme
} = useAppHeader()

const shellClasses = computed(() => shellModeStyles({
  mode: currentShellMode.value
}))

const schemaStatusIcon = computed(() => {
  return schemaStatusIconByState[schemaStatusData.value.state]
})

const schemaStatusIconClass = computed(() => {
  return schemaStatusClassByState[schemaStatusData.value.state]
})

const schemaStatusLabel = computed(() => {
  return schemaStatusLabelByState[schemaStatusData.value.state]
})

const mobileMenuItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[][] = [
    desktopNavigation.value.map((item) => {
      return {
        icon: navigationIconByRoute[item.to],
        label: item.label,
        to: item.to
      }
    })
  ]

  if (isStudioRoute.value) {
    desktopStudioMenus.value.forEach((menu) => {
      items.push([{
        children: menu.items.flat(),
        icon: menu.icon,
        label: menu.label
      }])
    })
  }

  items.push([
    buildMobileThemeItem(studioThemeLabel.value, studioThemeIcon.value, toggleStudioTheme)
  ])

  return items
})
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    :class="shellClasses.root()"
  >
    <div :class="shellClasses.container()">
      <header class="sticky top-0 z-40 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/94 backdrop-blur">
        <div :class="shellClasses.headerInner()">
          <div class="flex min-w-0 flex-1 items-center gap-2 lg:gap-3">
            <NuxtLink
              to="/"
              class="flex min-w-0 items-center gap-2.5 px-1 py-0.5 text-[color:var(--studio-shell-text)] no-underline"
            >
              <span class="grid h-7 w-7 shrink-0 place-items-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] font-mono text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--studio-shell-label)]">
                DB
              </span>

              <span class="font-mono text-[0.78rem] font-semibold uppercase tracking-[0.16em] text-[color:var(--studio-shell-label)]">PGML</span>
            </NuxtLink>

            <nav
              class="hidden items-center gap-1 lg:flex"
              aria-label="Primary"
            >
              <NuxtLink
                v-for="item in desktopNavigation"
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

            <ClientOnly v-if="desktopStudioMenus.length">
              <div class="hidden items-center gap-1 lg:flex">
                <UDropdownMenu
                  v-for="menu in desktopStudioMenus"
                  :key="menu.id"
                  :items="menu.items"
                  :content="appHeaderDesktopMenuContent"
                  :ui="appHeaderDesktopMenuUi"
                >
                  <button
                    type="button"
                    class="border-b border-transparent px-3 py-1.5 text-[0.7rem] font-medium uppercase tracking-[0.12em] text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:border-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)] data-[state=open]:border-[color:var(--studio-shell-label)] data-[state=open]:bg-[color:var(--studio-surface-hover)] data-[state=open]:text-[color:var(--studio-shell-text)]"
                    :title="menu.label"
                  >
                    <span class="inline-flex items-center gap-2">
                      <UIcon
                        :name="menu.icon"
                        class="h-3.5 w-3.5 shrink-0 text-[color:var(--studio-shell-muted)]"
                      />
                      <span>{{ menu.label }}</span>
                      <UIcon
                        v-if="menu.id === 'export' && isStudioActionLoading"
                        name="i-lucide-loader-circle"
                        class="h-3.5 w-3.5 shrink-0 animate-spin text-[color:var(--studio-shell-label)]"
                      />
                    </span>
                  </button>
                </UDropdownMenu>
              </div>
            </ClientOnly>
          </div>

          <div class="pointer-events-none absolute left-1/2 top-1/2 hidden max-w-[30rem] min-w-0 -translate-x-1/2 -translate-y-1/2 px-4 md:flex">
            <div class="min-w-0 text-center">
              <p
                data-app-header-title="true"
                data-studio-schema-name="true"
                class="truncate text-[0.82rem] font-semibold tracking-[0.01em] text-[color:var(--studio-shell-text)]"
              >
                {{ centerTitle }}
              </p>
              <p class="truncate font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--studio-shell-muted)]">
                {{ centerDetail }}
              </p>
            </div>
          </div>

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

            <UDropdownMenu
              class="lg:hidden"
              :items="mobileMenuItems"
              :content="appHeaderMobileMenuContent"
              :ui="appHeaderMobileMenuUi"
            >
              <button
                type="button"
                class="grid h-7 w-7 place-items-center border border-transparent text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                aria-label="Open header menu"
                title="Open header menu"
              >
                <UIcon
                  name="i-lucide-menu"
                  class="h-3.5 w-3.5"
                />
              </button>
            </UDropdownMenu>

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
          </div>
        </div>
      </header>

      <main :class="shellClasses.main()">
        <slot />
      </main>

      <footer
        v-if="!isStudioRoute"
        class="border-t border-[color:var(--studio-shell-border)] py-5 text-sm text-[color:var(--studio-shell-muted)]"
      >
        PGML extends DBML toward Postgres-native schema design and visual documentation.
      </footer>
    </div>
  </div>
</template>
