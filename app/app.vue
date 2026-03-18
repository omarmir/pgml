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
</script>

<template>
  <div
    class="app-shell"
    :class="isStudioRoute ? 'app-shell--studio' : ''"
  >
    <header
      v-if="!isStudioRoute"
      class="app-header"
    >
      <NuxtLink
        to="/"
        class="brand-mark"
      >
        <span class="brand-mark__glyph">PG</span>
        <span class="brand-mark__copy">
          <strong>PGML</strong>
          <span>Postgres in markup</span>
        </span>
      </NuxtLink>

      <nav class="main-nav">
        <NuxtLink
          v-for="item in navigation"
          :key="item.to"
          :to="item.to"
          class="main-nav__link"
          active-class="main-nav__link--active"
        >
          {{ item.label }}
        </NuxtLink>
      </nav>

      <UButton
        to="/diagram"
        label="Open Studio"
        trailing-icon="i-lucide-arrow-up-right"
        class="header-cta"
      />
    </header>

    <main
      class="app-main"
      :class="isStudioRoute ? 'app-main--studio' : ''"
    >
      <NuxtPage />
    </main>

    <footer
      v-if="!isStudioRoute"
      class="app-footer"
    >
      <p>PGML is a DBML-style language for Postgres-native structures and relationships.</p>
      <p>Built with Nuxt 4 and Nuxt UI.</p>
    </footer>
  </div>
</template>
