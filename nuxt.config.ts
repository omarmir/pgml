import { buildPrerenderRouteRules, resolveGitHubPagesBaseUrl, staticPrerenderRoutes } from './app/utils/site-build'

// https://nuxt.com/docs/api/configuration/nuxt-config
const nitroPreset = process.env.NITRO_PRESET
const appBaseUrl = resolveGitHubPagesBaseUrl({
  explicitBaseUrl: process.env.NUXT_APP_BASE_URL,
  githubRepository: process.env.GITHUB_REPOSITORY,
  useRepositoryBaseUrl: nitroPreset === 'github_pages'
})

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxt/hints',
    '@nuxt/image',
    '@nuxt/test-utils',
    '@nuxtjs/i18n',
    '@vueuse/nuxt'
  ],

  ssr: false,

  devtools: {
    enabled: true
  },

  app: {
    baseURL: appBaseUrl
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    storage: 'cookie'
  },

  routeRules: buildPrerenderRouteRules(staticPrerenderRoutes),

  compatibilityDate: '2025-01-15',

  nitro: nitroPreset ? { preset: nitroPreset } : undefined,

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    defaultLocale: 'en',
    locales: [
      {
        code: 'en',
        language: 'en-CA',
        name: 'English'
      }
    ]
  }
})
