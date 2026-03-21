<script setup lang="ts">
import { useAppHeader } from './composables/useAppHeader'

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
const {
  centerDetail,
  centerTitle,
  desktopMenuContent,
  desktopMenuUi,
  desktopNavigation,
  desktopStatusBadge,
  desktopStudioMenus,
  flatIconButtonClass,
  headerInnerClass,
  headerMenuButtonClass,
  isStudioActionLoading,
  isStudioRoute,
  mainClass,
  mobileMenuContent,
  mobileMenuItems,
  mobileMenuUi,
  resolveNavigationClass,
  rootClass,
  shellContainerClass,
  studioTheme,
  studioThemeIcon,
  studioThemeLabel,
  toggleStudioTheme
} = useAppHeader()
</script>

<template>
  <UApp>
    <div
      :data-studio-theme="studioTheme"
      :class="rootClass"
    >
      <div
        :class="shellContainerClass"
      >
        <header class="sticky top-0 z-40 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/94 backdrop-blur">
          <div :class="headerInnerClass">
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
                  :class="resolveNavigationClass(item.isActive)"
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
                    :content="desktopMenuContent"
                    :ui="desktopMenuUi"
                  >
                    <button
                      type="button"
                      :class="headerMenuButtonClass"
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
                v-if="desktopStatusBadge"
                class="hidden items-center md:inline-flex"
                :data-studio-schema-status="desktopStatusBadge.saveState"
                :title="desktopStatusBadge.detail"
              >
                <UIcon
                  :name="desktopStatusBadge.icon"
                  class="h-3.5 w-3.5 shrink-0"
                  :class="desktopStatusBadge.iconClass"
                  data-studio-schema-status-icon="true"
                />
                <span class="sr-only">{{ desktopStatusBadge.label }}</span>
              </div>

              <UDropdownMenu
                class="lg:hidden"
                :items="mobileMenuItems"
                :content="mobileMenuContent"
                :ui="mobileMenuUi"
              >
                <button
                  type="button"
                  :class="flatIconButtonClass"
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
                :class="flatIconButtonClass"
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
  </UApp>
</template>
