<script setup lang="ts">
import { useStudioHeaderActions } from './composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from './composables/useStudioSchemaStatus'

const title = 'PGML'
const description = 'A Postgres-first markup language and live diagram studio built on top of DBML ideas.'

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description,
  twitterCard: 'summary_large_image'
})

const navigation = [
  {
    label: 'Spec',
    to: '/'
  },
  {
    label: 'Diagram Studio',
    to: '/diagram'
  }
]

const route = useRoute()
const isStudioRoute = computed(() => route.path.startsWith('/diagram'))
const { studioTheme, studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()
const { state: studioHeaderActions } = useStudioHeaderActions()
const { state: studioSchemaStatus } = useStudioSchemaStatus()
const studioHeaderActionContent = {
  align: 'end' as const,
  side: 'bottom' as const,
  sideOffset: 6
}
const rootClass = computed(() => {
  return isStudioRoute.value
    ? 'h-dvh w-full overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200'
    : 'min-h-screen w-full bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200'
})
const shellContainerClass = computed(() => {
  return isStudioRoute.value
    ? 'relative flex h-full w-full min-w-0 flex-col overflow-hidden'
    : 'relative mx-auto flex min-h-screen w-full max-w-[1480px] min-w-0 flex-col px-4 sm:px-6 lg:px-8'
})
const headerInnerClass = computed(() => {
  return isStudioRoute.value
    ? 'relative flex min-h-[4.25rem] items-center justify-between gap-4 px-4 py-[0.9rem] sm:px-6 lg:px-8'
    : 'flex min-h-[4.25rem] items-center justify-between gap-4 py-[0.9rem]'
})
const mainClass = computed(() => {
  return isStudioRoute.value
    ? 'flex-1 min-h-0 overflow-hidden'
    : 'flex-1 pb-14 pt-8 sm:pt-10'
})

const navLinkClass = (to: string) => {
  const isActive = route.path === to || (to !== '/' && route.path.startsWith(to))

  return isActive
    ? 'border-[color:var(--studio-shell-text)] text-[color:var(--studio-shell-text)]'
    : 'border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:text-[color:var(--studio-shell-text)]'
}

const studioSchemaStatusIcon = computed(() => {
  if (studioSchemaStatus.value.saveState === 'saving') {
    return 'i-lucide-loader-circle'
  }

  if (studioSchemaStatus.value.saveState === 'pending') {
    return 'i-lucide-hard-drive-download'
  }

  if (studioSchemaStatus.value.saveState === 'error') {
    return 'i-lucide-circle-alert'
  }

  if (studioSchemaStatus.value.saveState === 'saved') {
    return 'i-lucide-hard-drive-download'
  }

  return 'i-lucide-loader-circle'
})

const studioSchemaStatusIconClass = computed(() => {
  if (studioSchemaStatus.value.saveState === 'pending') {
    return 'animate-bounce text-emerald-500'
  }

  if (studioSchemaStatus.value.saveState === 'saving') {
    return 'animate-spin text-[color:var(--studio-shell-label)]'
  }

  if (studioSchemaStatus.value.saveState === 'error') {
    return 'text-red-500'
  }

  return 'text-emerald-500'
})
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    :class="rootClass"
  >
    <div
      :class="shellContainerClass"
    >
      <header class="sticky top-0 z-40 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/92 backdrop-blur">
        <div :class="headerInnerClass">
          <div class="flex min-w-0 items-end gap-6">
            <NuxtLink
              to="/"
              class="flex min-w-0 items-end gap-3 text-[color:var(--studio-shell-text)] no-underline"
            >
              <span class="grid h-10 w-10 shrink-0 place-items-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] font-mono text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--studio-shell-label)]">
                PG
              </span>

              <span class="flex min-w-0 flex-col justify-end">
                <span class="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-[color:var(--studio-shell-label)]">
                  PGML
                </span>
                <span class="truncate pb-px text-base font-medium leading-[1.25] text-[color:var(--studio-shell-muted)] sm:text-[1.05rem]">
                  Postgres in markup
                </span>
              </span>
            </NuxtLink>

            <nav class="hidden self-end translate-y-[3px] md:flex md:items-baseline md:gap-3">
              <NuxtLink
                v-for="item in navigation"
                :key="item.to"
                :to="item.to"
                class="border-b px-0 py-1 text-sm leading-none font-medium transition-colors duration-150"
                :class="navLinkClass(item.to)"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>
          </div>

          <div
            v-if="isStudioRoute && studioSchemaStatus.name"
            class="pointer-events-none absolute left-1/2 top-1/2 flex max-w-[26rem] min-w-0 -translate-x-1/2 -translate-y-1/2 px-4 text-center"
            :data-studio-schema-status="studioSchemaStatus.saveState"
            :title="studioSchemaStatus.detail"
          >
            <div class="min-w-0">
              <p
                data-studio-schema-name="true"
                class="truncate font-mono text-sm uppercase tracking-[0.12em] text-[color:var(--studio-shell-text)]"
              >
                {{ studioSchemaStatus.name }}
              </p>
              <p class="inline-flex max-w-full items-center justify-center gap-1.5 truncate text-[0.63rem] text-[color:var(--studio-shell-muted)]">
                <UIcon
                  :name="studioSchemaStatusIcon"
                  class="h-3.5 w-3.5 shrink-0"
                  :class="studioSchemaStatusIconClass"
                  data-studio-schema-status-icon="true"
                />
                {{ studioSchemaStatus.detail }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
            <ClientOnly v-if="isStudioRoute && studioHeaderActions.items.length">
              <UDropdownMenu
                :items="studioHeaderActions.items"
                :content="studioHeaderActionContent"
                :ui="{
                  content: 'min-w-[14rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
                  group: 'p-0',
                  separator: 'my-1 bg-[color:var(--studio-shell-border)]',
                  item: 'rounded-none px-2 py-1.5 text-[0.78rem] text-[color:var(--studio-shell-text)] data-[highlighted]:bg-[color:var(--studio-shell-text)]/12 data-[highlighted]:text-[color:var(--studio-shell-text)]',
                  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
                  itemLabel: 'truncate'
                }"
              >
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  class="rounded-none border border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                  aria-label="Studio actions"
                  :loading="studioHeaderActions.isLoading"
                />
              </UDropdownMenu>
            </ClientOnly>
            <UButton
              :icon="studioThemeIcon"
              color="neutral"
              variant="ghost"
              class="rounded-none border border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              :aria-label="studioThemeLabel"
              :title="studioThemeLabel"
              @click="toggleStudioTheme"
            />
            <UButton
              :to="isStudioRoute ? '/' : '/diagram'"
              :label="isStudioRoute ? 'View Spec' : 'Open Studio'"
              color="neutral"
              trailing-icon="i-lucide-arrow-up-right"
              class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-surface-hover)]"
            />
          </div>
        </div>
      </header>

      <main :class="mainClass">
        <NuxtPage />
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
