import type { LocationQuery, LocationQueryValue } from 'vue-router'

type StudioLaunchQueryValue = LocationQueryValue | LocationQueryValue[] | undefined

type StudioLaunchQuery = LocationQuery

type BrowserStudioExampleLaunchRequest = {
  launch: 'example'
  source: 'browser'
}

type BrowserStudioNewLaunchRequest = {
  launch: 'new'
  source: 'browser'
}

type BrowserStudioSavedLaunchRequest = {
  launch: 'saved'
  schemaId: string
  source: 'browser'
}

export type BrowserStudioLaunchRequest = BrowserStudioExampleLaunchRequest
  | BrowserStudioNewLaunchRequest
  | BrowserStudioSavedLaunchRequest

const getSingleStudioLaunchQueryValue = (value: StudioLaunchQueryValue) => {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : null
  }

  return typeof value === 'string' ? value : null
}

export const buildBrowserStudioExampleQuery = () => {
  return {
    launch: 'example',
    source: 'browser'
  }
}

export const buildBrowserStudioNewQuery = () => {
  return {
    launch: 'new',
    source: 'browser'
  }
}

export const buildBrowserStudioSavedQuery = (schemaId: string) => {
  return {
    launch: 'saved',
    schema: schemaId,
    source: 'browser'
  }
}

export const getBrowserStudioLaunchRequestKey = (request: BrowserStudioLaunchRequest) => {
  return request.launch === 'saved'
    ? `browser:saved:${request.schemaId}`
    : `browser:${request.launch}`
}

export const parseBrowserStudioLaunchQuery = (query: StudioLaunchQuery): BrowserStudioLaunchRequest | null => {
  const source = getSingleStudioLaunchQueryValue(query.source)

  if (source !== 'browser') {
    return null
  }

  const launch = getSingleStudioLaunchQueryValue(query.launch)

  if (launch === 'example' || launch === 'new') {
    return {
      launch,
      source
    }
  }

  if (launch !== 'saved') {
    return null
  }

  const schemaId = getSingleStudioLaunchQueryValue(query.schema)

  if (!schemaId || schemaId.trim().length === 0) {
    return null
  }

  return {
    launch,
    schemaId,
    source
  }
}
