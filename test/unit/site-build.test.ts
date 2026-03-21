import { describe, expect, it } from 'vitest'
import { buildPrerenderRouteRules, normalizeBaseUrl, resolveGitHubPagesBaseUrl, staticPrerenderRoutes } from '../../app/utils/site-build'

describe('site-build', () => {
  it('normalizes base urls with leading and trailing slashes', () => {
    expect(normalizeBaseUrl('pgml')).toBe('/pgml/')
    expect(normalizeBaseUrl('/pgml')).toBe('/pgml/')
    expect(normalizeBaseUrl('/pgml/')).toBe('/pgml/')
  })

  it('returns the explicit base url when provided', () => {
    expect(resolveGitHubPagesBaseUrl({
      explicitBaseUrl: 'custom/docs',
      githubRepository: 'omarmir/pgml',
      useRepositoryBaseUrl: true
    })).toBe('/custom/docs/')
  })

  it('infers the repository path for project pages builds', () => {
    expect(resolveGitHubPagesBaseUrl({
      githubRepository: 'omarmir/pgml',
      useRepositoryBaseUrl: true
    })).toBe('/pgml/')
  })

  it('uses the root path for user pages repositories', () => {
    expect(resolveGitHubPagesBaseUrl({
      githubRepository: 'omarmir/omarmir.github.io',
      useRepositoryBaseUrl: true
    })).toBe('/')
  })

  it('builds prerender route rules for the static app routes', () => {
    expect(buildPrerenderRouteRules(staticPrerenderRoutes)).toEqual({
      '/': { prerender: true },
      '/spec': { prerender: true },
      '/diagram': { prerender: true }
    })
  })
})
