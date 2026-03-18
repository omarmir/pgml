import type { Ref } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { readBrowserStorageItem, writeBrowserStorageItem } from '../utils/browser-storage'

export type StudioTheme = 'dark' | 'light'

const studioThemeStorageKey = 'pgml-studio-theme'

const studioThemeTokens: Record<StudioTheme, Record<string, string>> = {
  dark: {
    '--studio-shell-bg': '#0a151d',
    '--studio-shell-border': 'rgba(255, 255, 255, 0.08)',
    '--studio-shell-text': '#e2edf3',
    '--studio-shell-muted': 'rgba(148, 163, 184, 0.88)',
    '--studio-shell-label': '#67e8f9',
    '--studio-shell-error': '#fda4af',
    '--studio-scroll-track': 'rgba(255, 255, 255, 0.03)',
    '--studio-scroll-track-border': 'rgba(255, 255, 255, 0.06)',
    '--studio-scroll-thumb-start': 'rgba(121, 227, 234, 0.58)',
    '--studio-scroll-thumb-end': 'rgba(139, 92, 246, 0.52)',
    '--studio-scroll-thumb-border': 'rgba(7, 17, 25, 0.92)',
    '--studio-surface-hover': 'rgba(255, 255, 255, 0.05)',
    '--studio-canvas-bg': '#07131b',
    '--studio-canvas-dot': 'rgba(255, 255, 255, 0.05)',
    '--studio-control-bg': 'rgba(8, 20, 29, 0.94)',
    '--studio-control-border': 'rgba(255, 255, 255, 0.08)',
    '--studio-input-bg': 'rgba(255, 255, 255, 0.05)',
    '--studio-rail': 'rgba(255, 255, 255, 0.1)',
    '--studio-ring': 'rgba(255, 255, 255, 0.22)',
    '--studio-node-surface-top': 'rgba(8, 20, 29, 0.98)',
    '--studio-node-surface-bottom': 'rgba(8, 20, 29, 0.98)',
    '--studio-group-surface': 'rgba(255, 255, 255, 0.018)',
    '--studio-group-surface-soft': 'rgba(255, 255, 255, 0.03)',
    '--studio-table-surface': 'rgba(8, 20, 29, 0.92)',
    '--studio-row-surface': '#07131b',
    '--studio-divider': 'rgba(255, 255, 255, 0.06)',
    '--studio-subtle': 'rgba(255, 255, 255, 0.03)',
    '--studio-node-border-neutral': 'rgba(255, 255, 255, 0.2)',
    '--studio-node-accent-mix': 'white',
    '--studio-floating-shadow': '0 20px 40px rgba(0, 0, 0, 0.28)',
    '--studio-modal-bg': '#0f1b24',
    '--studio-modal-overlay': 'rgba(3, 9, 14, 0.72)'
  },
  light: {
    '--studio-shell-bg': '#f4f1ea',
    '--studio-shell-border': 'rgba(15, 23, 42, 0.1)',
    '--studio-shell-text': '#17212b',
    '--studio-shell-muted': 'rgba(71, 85, 105, 0.88)',
    '--studio-shell-label': '#0f766e',
    '--studio-shell-error': '#b91c1c',
    '--studio-scroll-track': 'rgba(15, 23, 42, 0.05)',
    '--studio-scroll-track-border': 'rgba(15, 23, 42, 0.08)',
    '--studio-scroll-thumb-start': 'rgba(14, 165, 233, 0.45)',
    '--studio-scroll-thumb-end': 'rgba(245, 158, 11, 0.5)',
    '--studio-scroll-thumb-border': 'rgba(244, 241, 234, 0.96)',
    '--studio-surface-hover': 'rgba(15, 23, 42, 0.06)',
    '--studio-canvas-bg': '#f8fafc',
    '--studio-canvas-dot': 'rgba(37, 99, 235, 0.08)',
    '--studio-control-bg': 'rgba(255, 255, 255, 0.92)',
    '--studio-control-border': 'rgba(15, 23, 42, 0.1)',
    '--studio-input-bg': 'rgba(255, 255, 255, 0.86)',
    '--studio-rail': 'rgba(15, 23, 42, 0.12)',
    '--studio-ring': 'rgba(37, 99, 235, 0.2)',
    '--studio-node-surface-top': 'rgba(255, 255, 255, 0.96)',
    '--studio-node-surface-bottom': 'rgba(248, 250, 252, 0.98)',
    '--studio-group-surface': 'rgba(255, 255, 255, 0.82)',
    '--studio-group-surface-soft': 'rgba(255, 255, 255, 0.78)',
    '--studio-table-surface': 'rgba(255, 255, 255, 0.94)',
    '--studio-row-surface': 'rgba(250, 251, 252, 0.98)',
    '--studio-divider': 'rgba(15, 23, 42, 0.08)',
    '--studio-subtle': 'rgba(15, 23, 42, 0.04)',
    '--studio-node-border-neutral': 'rgba(15, 23, 42, 0.14)',
    '--studio-node-accent-mix': 'black',
    '--studio-floating-shadow': '0 22px 44px rgba(148, 163, 184, 0.24)',
    '--studio-modal-bg': '#fffdf8',
    '--studio-modal-overlay': 'rgba(148, 163, 184, 0.34)'
  }
}

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
  return normalizeStudioTheme(readBrowserStorageItem(studioThemeStorageKey))
}

const useSharedStudioTheme = createSharedComposable(() => {
  const studioTheme: Ref<StudioTheme> = ref(import.meta.client ? readStoredStudioTheme() : 'dark')

  if (import.meta.client) {
    watch(studioTheme, (nextValue) => {
      const nextTheme = normalizeStudioTheme(studioTheme.value)

      if (nextValue !== nextTheme) {
        studioTheme.value = nextTheme
        return
      }

      applyStudioThemeToDocument(nextTheme)
      writeBrowserStorageItem(studioThemeStorageKey, nextTheme)
    }, {
      immediate: true
    })
  }

  const studioThemeStyles = computed(() => studioThemeTokens[studioTheme.value])
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
    studioThemeStyles,
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
