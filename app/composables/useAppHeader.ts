import type { StudioSchemaSaveState } from './useStudioSchemaStatus'

import { useStudioHeaderActions } from './useStudioHeaderActions'
import { useStudioSchemaStatus } from './useStudioSchemaStatus'
import { useStudioTheme } from './useStudioTheme'

export type AppHeaderNavigationItem = {
  isActive: boolean
  label: string
  to: string
}

type AppHeaderNavigationDefinition = Omit<AppHeaderNavigationItem, 'isActive'>

export type AppHeaderSchemaStatusData = {
  detail: string
  state: StudioSchemaSaveState
  visible: boolean
}

export type AppShellMode = 'page' | 'studio'

const navigationItems: Readonly<AppHeaderNavigationDefinition[]> = Object.freeze([
  {
    label: 'Spec',
    to: '/'
  },
  {
    label: 'Studio',
    to: '/diagram'
  }
])

export const useAppHeader = () => {
  const route = useRoute()
  const isStudioRoute = computed(() => route.path.startsWith('/diagram'))
  const currentShellMode = computed<AppShellMode>(() => isStudioRoute.value ? 'studio' : 'page')
  const { studioTheme, studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()
  const { state: studioHeaderActions } = useStudioHeaderActions()
  const { state: studioSchemaStatus } = useStudioSchemaStatus()

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

  const schemaStatusData = computed<AppHeaderSchemaStatusData>(() => {
    return {
      detail: studioSchemaStatus.value.detail,
      state: studioSchemaStatus.value.saveState,
      visible: isStudioRoute.value && studioSchemaStatus.value.visible
    }
  })

  return {
    centerDetail,
    centerTitle,
    desktopNavigation,
    currentShellMode,
    desktopStudioMenus,
    isStudioActionLoading: computed(() => {
      return studioHeaderActions.value.isLoading
    }),
    isStudioRoute,
    schemaStatusData,
    studioTheme,
    studioThemeIcon,
    studioThemeLabel,
    toggleStudioTheme
  }
}
