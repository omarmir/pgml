<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { PrimaryNavigationItem } from '~/composables/usePrimaryNavigation'
import {
  appHeaderMobileMenuContent,
  appHeaderMobileMenuUi
} from '~/constants/ui'
import { useStudioTheme } from '~/composables/useStudioTheme'

const { extraMenuGroups = [], navigationItems } = defineProps<{
  extraMenuGroups?: DropdownMenuItem[][]
  navigationItems: PrimaryNavigationItem[]
}>()

const navigationIconByRoute: Readonly<Record<string, string>> = Object.freeze({
  '/': 'i-lucide-house',
  '/spec': 'i-lucide-scroll-text',
  '/diagram': 'i-lucide-workflow'
})

const buildThemeMenuItem = (label: string, icon: string, onSelect: () => void): DropdownMenuItem => {
  return {
    icon,
    label,
    onSelect
  }
}

const { studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()

const mobileMenuItems = computed<DropdownMenuItem[][]>(() => {
  const items: DropdownMenuItem[][] = [
    navigationItems.map((item) => {
      return {
        icon: navigationIconByRoute[item.to],
        label: item.label,
        to: item.to
      }
    })
  ]

  extraMenuGroups.forEach((group) => {
    items.push(group)
  })

  items.push([
    buildThemeMenuItem(studioThemeLabel.value, studioThemeIcon.value, toggleStudioTheme)
  ])

  return items
})
</script>

<template>
  <UDropdownMenu
    class="lg:hidden"
    :items="mobileMenuItems"
    :content="appHeaderMobileMenuContent"
    :ui="appHeaderMobileMenuUi"
  >
    <button
      type="button"
      class="grid h-7 w-7 cursor-default place-items-center border border-transparent text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
      aria-label="Open header menu"
      title="Open header menu"
    >
      <UIcon
        name="i-lucide-menu"
        class="h-3.5 w-3.5"
      />
    </button>
  </UDropdownMenu>
</template>
