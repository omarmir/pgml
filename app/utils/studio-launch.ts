import type { LocationQuery, LocationQueryValue } from 'vue-router'
import type { PgmlRecentComputerFile } from './computer-files'

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

type FileStudioRecentLaunchRequest = {
  launch: 'recent'
  recentFileId: string
  source: 'file'
}

export type FileStudioLaunchRequest = FileStudioRecentLaunchRequest

export type StudioLaunchRequest = BrowserStudioLaunchRequest | FileStudioLaunchRequest

export type PreloadedFileStudioLaunchPayload = {
  entry: PgmlRecentComputerFile
  text: string
}

type StoredPreloadedFileStudioLaunch = {
  payload: PreloadedFileStudioLaunchPayload
  requestKey: string
}

const studioLaunchAccessStorageKey = 'pgml-studio-launch-access-v1'
const studioLaunchAccessGrantedValue = 'granted'
const preloadedFileStudioLaunchStorageKey = 'pgml-studio-file-launch-v1'

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

export const buildFileStudioRecentQuery = (recentFileId: string) => {
  return {
    file: recentFileId,
    launch: 'recent',
    source: 'file'
  }
}

export const getBrowserStudioLaunchRequestKey = (request: BrowserStudioLaunchRequest) => {
  return request.launch === 'saved'
    ? `browser:saved:${request.schemaId}`
    : `browser:${request.launch}`
}

export const getStudioLaunchRequestKey = (request: StudioLaunchRequest) => {
  if (request.source === 'browser') {
    return getBrowserStudioLaunchRequestKey(request)
  }

  return `file:recent:${request.recentFileId}`
}

const getStudioLaunchSessionStorage = () => {
  if (typeof globalThis.sessionStorage === 'undefined') {
    return null
  }

  return globalThis.sessionStorage
}

export const authorizeStudioLaunchAccess = () => {
  const sessionStorage = getStudioLaunchSessionStorage()

  if (!sessionStorage) {
    return false
  }

  sessionStorage.setItem(studioLaunchAccessStorageKey, studioLaunchAccessGrantedValue)

  return true
}

export const clearStudioLaunchAccess = () => {
  const sessionStorage = getStudioLaunchSessionStorage()

  if (!sessionStorage) {
    return false
  }

  sessionStorage.removeItem(studioLaunchAccessStorageKey)

  return true
}

export const hasStudioLaunchAccess = () => {
  const sessionStorage = getStudioLaunchSessionStorage()

  if (!sessionStorage) {
    return false
  }

  return sessionStorage.getItem(studioLaunchAccessStorageKey) === studioLaunchAccessGrantedValue
}

export const primePreloadedFileStudioLaunch = (
  request: FileStudioLaunchRequest,
  payload: PreloadedFileStudioLaunchPayload
) => {
  const sessionStorage = getStudioLaunchSessionStorage()

  if (!sessionStorage) {
    return
  }

  const storedLaunch: StoredPreloadedFileStudioLaunch = {
    payload,
    requestKey: getStudioLaunchRequestKey(request)
  }

  sessionStorage.setItem(preloadedFileStudioLaunchStorageKey, JSON.stringify(storedLaunch))
}

export const consumePreloadedFileStudioLaunch = (request: FileStudioLaunchRequest) => {
  const sessionStorage = getStudioLaunchSessionStorage()

  if (!sessionStorage) {
    return null
  }

  const rawValue = sessionStorage.getItem(preloadedFileStudioLaunchStorageKey)

  if (!rawValue) {
    return null
  }

  try {
    const storedLaunch = JSON.parse(rawValue) as StoredPreloadedFileStudioLaunch

    if (storedLaunch.requestKey !== getStudioLaunchRequestKey(request)) {
      return null
    }

    sessionStorage.removeItem(preloadedFileStudioLaunchStorageKey)

    return storedLaunch.payload
  } catch {
    sessionStorage.removeItem(preloadedFileStudioLaunchStorageKey)
    return null
  }
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

export const parseStudioLaunchQuery = (query: StudioLaunchQuery): StudioLaunchRequest | null => {
  const browserLaunchRequest = parseBrowserStudioLaunchQuery(query)

  if (browserLaunchRequest) {
    return browserLaunchRequest
  }

  const source = getSingleStudioLaunchQueryValue(query.source)

  if (source !== 'file') {
    return null
  }

  const launch = getSingleStudioLaunchQueryValue(query.launch)

  if (launch !== 'recent') {
    return null
  }

  const recentFileId = getSingleStudioLaunchQueryValue(query.file)

  if (!recentFileId || recentFileId.trim().length === 0) {
    return null
  }

  return {
    launch,
    recentFileId,
    source
  }
}
