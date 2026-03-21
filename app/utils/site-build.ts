export const staticPrerenderRoutes = ['/', '/spec', '/diagram'] as const

type ResolveGitHubPagesBaseUrlOptions = {
  explicitBaseUrl?: string
  githubRepository?: string
  useRepositoryBaseUrl?: boolean
}

export const normalizeBaseUrl = (value: string) => {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return '/'
  }

  const leadingSlashValue = trimmedValue.startsWith('/') ? trimmedValue : `/${trimmedValue}`

  if (leadingSlashValue.endsWith('/')) {
    return leadingSlashValue
  }

  return `${leadingSlashValue}/`
}

export const resolveGitHubPagesBaseUrl = ({
  explicitBaseUrl,
  githubRepository,
  useRepositoryBaseUrl = false
}: ResolveGitHubPagesBaseUrlOptions) => {
  if (typeof explicitBaseUrl === 'string' && explicitBaseUrl.trim().length > 0) {
    return normalizeBaseUrl(explicitBaseUrl)
  }

  if (!useRepositoryBaseUrl || typeof githubRepository !== 'string' || githubRepository.trim().length === 0) {
    return '/'
  }

  const repositoryParts = githubRepository.trim().split('/')
  const repositoryName = repositoryParts.at(-1)

  if (typeof repositoryName !== 'string' || repositoryName.length === 0) {
    return '/'
  }

  if (repositoryName.toLowerCase().endsWith('.github.io')) {
    return '/'
  }

  return normalizeBaseUrl(repositoryName)
}

export const buildPrerenderRouteRules = (routes: readonly string[]) => {
  const routeRules: Record<string, { prerender: true }> = {}

  for (const route of routes) {
    routeRules[route] = { prerender: true }
  }

  return routeRules
}
