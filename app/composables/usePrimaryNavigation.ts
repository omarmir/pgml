export type PrimaryNavigationItem = {
  isActive: boolean
  label: string
  to: string
}

type PrimaryNavigationDefinition = Omit<PrimaryNavigationItem, 'isActive'>

const primaryNavigationDefinitions: Readonly<PrimaryNavigationDefinition[]> = Object.freeze([
  {
    label: 'Spec',
    to: '/'
  },
  {
    label: 'Studio',
    to: '/diagram'
  }
])

export const usePrimaryNavigation = () => {
  const route = useRoute()

  const navigationItems = computed<PrimaryNavigationItem[]>(() => {
    return primaryNavigationDefinitions.map((item) => {
      const isActive = route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to))

      return {
        isActive,
        label: item.label,
        to: item.to
      }
    })
  })

  return {
    navigationItems
  }
}
