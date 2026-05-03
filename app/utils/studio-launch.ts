import type { LocationQuery, LocationQueryValue } from 'vue-router'
import type { PgmlRecentComputerFile } from './computer-files'

type StudioLaunchQueryValue = LocationQueryValue | LocationQueryValue[] | undefined

type StudioLaunchQuery = LocationQuery

export type StudioWorkspacePage = 'diagram' | 'analysis'

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

type GistStudioFileLaunchRequest = {
  filename: string
  gistId: string
  launch: 'file'
  source: 'gist'
}

export type FileStudioLaunchRequest = FileStudioRecentLaunchRequest

export type GistStudioLaunchRequest = GistStudioFileLaunchRequest

export type StudioLaunchRequest = BrowserStudioLaunchRequest | FileStudioLaunchRequest | GistStudioLaunchRequest

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
const studioWorkspacePathByPage: Readonly<Record<StudioWorkspacePage, string>> = Object.freeze({
  analysis: '/analysis',
  diagram: '/diagram'
})

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

export const buildGistStudioFileQuery = (input: {
  filename: string
  gistId: string
}) => {
  return {
    file: input.filename,
    gist: input.gistId,
    launch: 'file',
    source: 'gist'
  }
}

export const getStudioWorkspacePath = (page: StudioWorkspacePage) => {
  return studioWorkspacePathByPage[page]
}

export const getStudioWorkspacePageFromPath = (path: string): StudioWorkspacePage | null => {
  if (path === studioWorkspacePathByPage.diagram) {
    return 'diagram'
  }

  if (path === studioWorkspacePathByPage.analysis) {
    return 'analysis'
  }

  return null
}

export const isStudioWorkspacePath = (path: string) => {
  return getStudioWorkspacePageFromPath(path) !== null
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

  if (request.source === 'gist') {
    return `gist:file:${request.gistId}:${request.filename}`
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
    if (source !== 'gist') {
      return null
    }

    const launch = getSingleStudioLaunchQueryValue(query.launch)

    if (launch !== 'file') {
      return null
    }

    const gistId = getSingleStudioLaunchQueryValue(query.gist)
    const filename = getSingleStudioLaunchQueryValue(query.file)

    if (
      !gistId
      || gistId.trim().length === 0
      || !filename
      || filename.trim().length === 0
    ) {
      return null
    }

    return {
      filename,
      gistId,
      launch,
      source
    }
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
