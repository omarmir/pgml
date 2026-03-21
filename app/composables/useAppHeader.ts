import type { DropdownMenuItem } from '@nuxt/ui'
import type { StudioSchemaSaveState } from './useStudioSchemaStatus'

import { useStudioHeaderActions } from './useStudioHeaderActions'
import { useStudioSchemaStatus } from './useStudioSchemaStatus'
import { useStudioTheme } from './useStudioTheme'

type AppHeaderNavigationItem = {
  isActive: boolean
  label: string
  to: string
}

type AppHeaderStatusBadge = {
  detail: string
  icon: string
  iconClass: string
  label: string
  saveState: StudioSchemaSaveState
}

const navigationItems = Object.freeze([
  {
    label: 'Spec',
    to: '/'
  },
  {
    label: 'Studio',
    to: '/diagram'
  }
])

const shellModeClasses = Object.freeze({
  page: {
    container: 'relative mx-auto flex min-h-screen w-full max-w-[1480px] min-w-0 flex-col px-4 sm:px-6 lg:px-8',
    headerInner: 'relative flex min-h-[3.6rem] items-center justify-between gap-3 py-2',
    main: 'flex-1 pb-14 pt-8 sm:pt-10',
    root: 'min-h-screen w-full bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200'
  },
  studio: {
    container: 'relative flex h-full w-full min-w-0 flex-col overflow-hidden',
    headerInner: 'relative flex min-h-[3.6rem] items-center justify-between gap-3 px-3 py-2 sm:px-4 lg:px-6',
    main: 'flex-1 min-h-0 overflow-hidden',
    root: 'h-dvh w-full overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] transition-colors duration-200'
  }
} as const)

const studioSchemaStatusIcons: Record<StudioSchemaSaveState, string> = {
  error: 'i-lucide-x',
  pending: 'i-lucide-loader-circle',
  saved: 'i-lucide-check-check',
  saving: 'i-lucide-loader-circle'
}

const studioSchemaStatusIconClasses: Record<StudioSchemaSaveState, string> = {
  error: 'text-red-500',
  pending: 'animate-spin text-amber-500',
  saved: 'text-emerald-500',
  saving: 'animate-spin text-[color:var(--studio-shell-label)]'
}

const studioSchemaStatusLabels: Record<StudioSchemaSaveState, string> = {
  error: 'Attention',
  pending: 'Queued',
  saved: 'Saved',
  saving: 'Saving'
}

const desktopMenuContent = Object.freeze({
  align: 'start' as const,
  side: 'bottom' as const,
  sideOffset: 10
})

const desktopMenuUi = Object.freeze({
  content: 'min-w-[15rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-xl',
  group: 'p-0',
  separator: 'my-1 bg-[color:var(--studio-shell-border)]',
  item: 'rounded-none px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] data-[highlighted]:bg-[color:var(--studio-shell-text)]/10 data-[highlighted]:text-[color:var(--studio-shell-text)]',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemLabel: 'truncate'
})

const mobileMenuContent = Object.freeze({
  align: 'end' as const,
  side: 'bottom' as const,
  sideOffset: 10
})

const mobileMenuUi = Object.freeze({
  ...desktopMenuUi,
  content: 'min-w-[16rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-xl'
})

const baseHeaderLinkClass = 'border-b border-transparent px-3 py-1.5 text-[0.7rem] font-medium tracking-[0.12em] uppercase transition-colors duration-150'
const headerMenuButtonClass = 'border-b border-transparent px-3 py-1.5 text-[0.7rem] font-medium tracking-[0.12em] uppercase text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:border-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)] data-[state=open]:border-[color:var(--studio-shell-label)] data-[state=open]:bg-[color:var(--studio-surface-hover)] data-[state=open]:text-[color:var(--studio-shell-text)]'
const flatIconButtonClass = 'grid h-7 w-7 place-items-center border border-transparent text-[color:var(--studio-shell-muted)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]'

const resolveNavigationIcon = (to: string) => {
  return to === '/' ? 'i-lucide-scroll-text' : 'i-lucide-workflow'
}

const resolveNavigationClass = (isActive: boolean) => {
  return isActive
    ? `${baseHeaderLinkClass} border-[color:var(--studio-shell-label)] text-[color:var(--studio-shell-text)]`
    : `${baseHeaderLinkClass} border-transparent text-[color:var(--studio-shell-muted)] hover:border-[color:var(--studio-shell-label)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]`
}

const buildMobileThemeItem = (label: string, icon: string, onSelect: () => void): DropdownMenuItem => {
  return {
    icon,
    label,
    onSelect
  }
}

export const useAppHeader = () => {
  const route = useRoute()
  const isStudioRoute = computed(() => route.path.startsWith('/diagram'))
  const currentShellMode = computed(() => isStudioRoute.value ? 'studio' : 'page')
  const { studioTheme, studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()
  const { state: studioHeaderActions } = useStudioHeaderActions()
  const { state: studioSchemaStatus } = useStudioSchemaStatus()

  const rootClass = computed(() => {
    return shellModeClasses[currentShellMode.value].root
  })

  const shellContainerClass = computed(() => {
    return shellModeClasses[currentShellMode.value].container
  })

  const headerInnerClass = computed(() => {
    return shellModeClasses[currentShellMode.value].headerInner
  })

  const mainClass = computed(() => {
    return shellModeClasses[currentShellMode.value].main
  })

  const desktopNavigation = computed<AppHeaderNavigationItem[]>(() => {
    return navigationItems.map((item) => {
      const isActive = route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to))

      return {
        isActive,
        label: item.label,
        to: item.to
      }
    })
  })

  const desktopStudioMenus = computed(() => {
    return isStudioRoute.value ? studioHeaderActions.value.menus : []
  })

  const centerTitle = computed(() => {
    if (!isStudioRoute.value) {
      return 'PGML Specification'
    }

    return studioSchemaStatus.value.name.length > 0
      ? studioSchemaStatus.value.name
      : 'Diagram Studio'
  })

  const centerDetail = computed(() => {
    if (!isStudioRoute.value) {
      return 'Postgres-first markup language'
    }

    return studioSchemaStatus.value.detail.length > 0
      ? studioSchemaStatus.value.detail
      : 'Local PGML workspace'
  })

  const desktopStatusBadge = computed<AppHeaderStatusBadge | null>(() => {
    if (!isStudioRoute.value || !studioSchemaStatus.value.visible) {
      return null
    }

    const saveState = studioSchemaStatus.value.saveState

    return {
      detail: studioSchemaStatus.value.detail,
      icon: studioSchemaStatusIcons[saveState],
      iconClass: studioSchemaStatusIconClasses[saveState],
      label: studioSchemaStatusLabels[saveState],
      saveState
    }
  })

  const mobileMenuItems = computed<DropdownMenuItem[][]>(() => {
    const items: DropdownMenuItem[][] = [
      desktopNavigation.value.map((item) => {
        return {
          icon: resolveNavigationIcon(item.to),
          label: item.label,
          to: item.to
        }
      })
    ]

    if (isStudioRoute.value) {
      studioHeaderActions.value.menus.forEach((menu) => {
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

  return {
    centerDetail,
    centerTitle,
    desktopMenuContent,
    desktopMenuUi,
    desktopNavigation,
    isStudioActionLoading: computed(() => {
      return studioHeaderActions.value.isLoading
    }),
    desktopStatusBadge,
    desktopStudioMenus,
    flatIconButtonClass,
    headerInnerClass,
    headerMenuButtonClass,
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
    toggleStudioTheme,
    isStudioRoute
  }
}
