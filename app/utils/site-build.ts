export const staticPrerenderRoutes = ['/', '/spec', '/diagram'] as const
export const defaultViteAllowedHosts = ['localhost', '.localhost', '127.0.0.1', '::1'] as const

type ResolveGitHubPagesBaseUrlOptions = {
  explicitBaseUrl?: string
  githubRepository?: string
  useRepositoryBaseUrl?: boolean
}

type ResolveViteAllowedHostsOptions = {
  extraAllowedHosts?: string
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

export const resolveViteAllowedHosts = ({ extraAllowedHosts }: ResolveViteAllowedHostsOptions = {}) => {
  const allowedHosts: string[] = [...defaultViteAllowedHosts]

  if (typeof extraAllowedHosts !== 'string' || extraAllowedHosts.trim().length === 0) {
    return allowedHosts
  }

  const parsedHosts = extraAllowedHosts
    .split(',')
    .map(host => host.trim())
    .filter(host => host.length > 0)

  for (const host of parsedHosts) {
    if (!allowedHosts.includes(host)) {
      allowedHosts.push(host)
    }
  }

  return allowedHosts
}
