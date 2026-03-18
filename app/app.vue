<script setup lang="ts">
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

const navLinkClass = (to: string) => {
  const isActive = route.path === to || (to !== '/' && route.path.startsWith(to))

  return isActive
    ? 'border-[color:var(--studio-shell-text)] text-[color:var(--studio-shell-text)]'
    : 'border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-border)] hover:text-[color:var(--studio-shell-text)]'
}
</script>

<template>
  <div
    :data-studio-theme="studioTheme"
    class="min-h-screen w-full bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200"
  >
    <main
      v-if="isStudioRoute"
      class="h-screen w-full overflow-hidden"
    >
      <NuxtPage />
    </main>

    <div
      v-else
      class="relative mx-auto flex min-h-screen w-full max-w-[1480px] flex-col px-4 sm:px-6 lg:px-8"
    >
      <header class="sticky top-0 z-40 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)]/92 backdrop-blur">
        <div class="flex min-h-16 items-center justify-between gap-4 py-3">
          <div class="flex min-w-0 items-center gap-5">
            <NuxtLink
              to="/"
              class="flex min-w-0 items-center gap-3 text-[color:var(--studio-shell-text)] no-underline"
            >
              <span class="grid h-10 w-10 shrink-0 place-items-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] font-mono text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-[color:var(--studio-shell-label)]">
                PG
              </span>

              <span class="flex min-w-0 flex-col">
                <span class="font-mono text-[0.72rem] uppercase tracking-[0.14em] text-[color:var(--studio-shell-label)]">
                  PGML
                </span>
                <span class="truncate text-sm text-[color:var(--studio-shell-muted)]">
                  Postgres in markup
                </span>
              </span>
            </NuxtLink>

            <nav class="hidden items-center gap-2 md:flex">
              <NuxtLink
                v-for="item in navigation"
                :key="item.to"
                :to="item.to"
                class="border-b px-0 py-2 text-sm font-medium transition-colors duration-150"
                :class="navLinkClass(item.to)"
              >
                {{ item.label }}
              </NuxtLink>
            </nav>
          </div>

          <div class="flex shrink-0 items-center gap-1.5">
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
              to="/diagram"
              label="Open Studio"
              color="neutral"
              trailing-icon="i-lucide-arrow-up-right"
              class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-surface-hover)]"
            />
          </div>
        </div>
      </header>

      <main class="flex-1 pb-14 pt-8 sm:pt-10">
        <NuxtPage />
      </main>

      <footer class="border-t border-[color:var(--studio-shell-border)] py-5 text-sm text-[color:var(--studio-shell-muted)]">
        PGML extends DBML toward Postgres-native schema design and visual documentation.
      </footer>
    </div>
  </div>
</template>
