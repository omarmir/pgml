import type { Ref } from 'vue'
import { createSharedComposable, useStorage } from '@vueuse/core'
import { studioThemeTokens, type StudioTheme } from '~/constants/theme'

export type { StudioTheme } from '~/constants/theme'

const studioThemeStorageKey = 'pgml-studio-theme'

const applyStudioThemeToDocument = (theme: StudioTheme) => {
  if (!import.meta.client) {
    return
  }

  document.documentElement.dataset.studioTheme = theme

  Object.entries(studioThemeTokens[theme]).forEach(([token, value]) => {
    document.documentElement.style.setProperty(token, value)
  })
}

const normalizeStudioTheme = (value: string | null | undefined): StudioTheme => {
  return value === 'light' ? 'light' : 'dark'
}

const readStoredStudioTheme = () => {
  if (!import.meta.client) {
    return 'dark'
  }

  try {
    return normalizeStudioTheme(window.localStorage.getItem(studioThemeStorageKey))
  } catch {
    return 'dark'
  }
}

const useSharedStudioTheme = createSharedComposable(() => {
  const studioTheme: Ref<StudioTheme> = useStorage<StudioTheme>(
    studioThemeStorageKey,
    'dark',
    undefined,
    {
      serializer: {
        read: value => normalizeStudioTheme(value),
        write: value => value
      }
    }
  )

  watch(studioTheme, (nextValue) => {
    const nextTheme = normalizeStudioTheme(nextValue)

    if (nextValue !== nextTheme) {
      studioTheme.value = nextTheme
      return
    }

    applyStudioThemeToDocument(nextTheme)
  }, {
    immediate: true
  })

  const studioThemeIcon = computed(() => {
    return studioTheme.value === 'dark'
      ? 'i-lucide-sun-medium'
      : 'i-lucide-moon-star'
  })
  const studioThemeLabel = computed(() => {
    return studioTheme.value === 'dark'
      ? 'Switch to light mode'
      : 'Switch to dark mode'
  })

  const toggleStudioTheme = () => {
    studioTheme.value = studioTheme.value === 'dark' ? 'light' : 'dark'
  }

  return {
    studioTheme,
    studioThemeIcon,
    studioThemeLabel,
    toggleStudioTheme
  }
})

export const useStudioTheme = () => {
  const sharedTheme = useSharedStudioTheme()

  if (import.meta.client) {
    const storedTheme = readStoredStudioTheme()

    if (sharedTheme.studioTheme.value !== storedTheme) {
      sharedTheme.studioTheme.value = storedTheme
    }
  }

  return sharedTheme
}
