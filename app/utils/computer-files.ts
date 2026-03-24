import { nanoid } from 'nanoid'

export type PgmlFilePermissionState = 'denied' | 'granted' | 'prompt'

export type PgmlComputerFile = {
  name: string
  text: () => Promise<string>
}

export type PgmlComputerFileWritable = {
  close: () => Promise<void>
  write: (contents: string) => Promise<void>
}

export type PgmlComputerFileHandle = {
  createWritable: () => Promise<PgmlComputerFileWritable>
  getFile: () => Promise<PgmlComputerFile>
  isSameEntry: (other: PgmlComputerFileHandle) => Promise<boolean>
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PgmlFilePermissionState>
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PgmlFilePermissionState>
}

type PgmlFilePickerType = {
  accept: Record<string, string[]>
  description?: string
}

type PgmlOpenFilePickerOptions = {
  excludeAcceptAllOption?: boolean
  multiple?: boolean
  types?: PgmlFilePickerType[]
}

type PgmlSaveFilePickerOptions = {
  excludeAcceptAllOption?: boolean
  suggestedName?: string
  types?: PgmlFilePickerType[]
}

export type PgmlFileSystemAccessApi = {
  showOpenFilePicker: (options?: PgmlOpenFilePickerOptions) => Promise<PgmlComputerFileHandle[]>
  showSaveFilePicker: (options?: PgmlSaveFilePickerOptions) => Promise<PgmlComputerFileHandle>
}

export type PgmlRecentComputerFile = {
  id: string
  name: string
  updatedAt: string
}

export type PgmlComputerFilePermissionMode = 'interactive' | 'passive'

export type PgmlRecentComputerFileWriteResult = {
  entry: PgmlRecentComputerFile
  ok: true
} | {
  ok: false
  reason: 'not-found' | 'permission-denied' | 'unsupported'
}

type StoredPgmlRecentComputerFile = PgmlRecentComputerFile & {
  handle: PgmlComputerFileHandle
}

export type PgmlComputerFileStore = {
  delete: (id: string) => Promise<void>
  getAll: () => Promise<StoredPgmlRecentComputerFile[]>
  getById: (id: string) => Promise<StoredPgmlRecentComputerFile | null>
  put: (record: StoredPgmlRecentComputerFile) => Promise<void>
}

type PgmlComputerFileResult = {
  entry: PgmlRecentComputerFile
  text: string
}

type PgmlComputerFileActionOptions = {
  access?: PgmlFileSystemAccessApi | null
  store?: PgmlComputerFileStore | null
}

type EnsureComputerFilePermissionOptions = {
  interactive?: boolean
}

type WriteRecentComputerPgmlFileOptions = PgmlComputerFileActionOptions & {
  permissionMode?: PgmlComputerFilePermissionMode
}

type PgmlComputerFileWindow = Window & {
  __PGML_COMPUTER_FILE_STORE__?: PgmlComputerFileStore
  __PGML_FILE_SYSTEM_ACCESS__?: PgmlFileSystemAccessApi
  indexedDB?: IDBFactory
  showOpenFilePicker?: PgmlFileSystemAccessApi['showOpenFilePicker']
  showSaveFilePicker?: PgmlFileSystemAccessApi['showSaveFilePicker']
}

type PgmlPassiveRecentComputerFileWriteSupportOptions = {
  userAgent?: string | null
}

const pgmlComputerFileDatabaseName = 'pgml-computer-files-v1'
const pgmlComputerFileStoreName = 'recent-files'
const pgmlFileTypeFilters: PgmlFilePickerType[] = [{
  accept: {
    'text/plain': ['.pgml']
  },
  description: 'PGML schema'
}]
const pgmlFileFallbackName = 'schema.pgml'
let pgmlComputerFileStorePromise: Promise<PgmlComputerFileStore | null> | null = null

const getClientWindow = () => {
  if (!import.meta.client) {
    return null
  }

  return window as PgmlComputerFileWindow
}

const getUserAgent = () => {
  const candidateWindow = getClientWindow()

  return candidateWindow?.navigator.userAgent || ''
}

const getDateValue = (value: string) => {
  const timestamp = new Date(value).getTime()

  return Number.isNaN(timestamp) ? 0 : timestamp
}

const sortRecentComputerFiles = (files: PgmlRecentComputerFile[]) => {
  return [...files].sort((left, right) => {
    return getDateValue(right.updatedAt) - getDateValue(left.updatedAt)
  })
}

const toRecentComputerFile = (record: StoredPgmlRecentComputerFile): PgmlRecentComputerFile => {
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt
  }
}

export const stripPgmlFileExtension = (value: string) => {
  return value.replace(/\.pgml$/iu, '')
}

export const ensurePgmlFileName = (value: string) => {
  const trimmedValue = value.trim()
  const safeValue = trimmedValue.length > 0 ? trimmedValue : pgmlFileFallbackName

  return safeValue.toLowerCase().endsWith('.pgml') ? safeValue : `${safeValue}.pgml`
}

export const supportsPassiveRecentComputerFileWrites = (
  options?: PgmlPassiveRecentComputerFileWriteSupportOptions
) => {
  const userAgent = options?.userAgent ?? getUserAgent()

  return !/Android/iu.test(userAgent)
}

const isAbortError = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'name' in value && value.name === 'AbortError'
}

const isComputerFilePermissionError = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return false
  }

  return 'name' in value && (
    value.name === 'NotAllowedError'
    || value.name === 'SecurityError'
  )
}

const getDefaultFileSystemAccessApi = () => {
  const candidateWindow = getClientWindow()

  if (!candidateWindow) {
    return null
  }

  if (candidateWindow.__PGML_FILE_SYSTEM_ACCESS__) {
    return candidateWindow.__PGML_FILE_SYSTEM_ACCESS__
  }

  if (
    typeof candidateWindow.showOpenFilePicker !== 'function'
    || typeof candidateWindow.showSaveFilePicker !== 'function'
  ) {
    return null
  }

  return {
    showOpenFilePicker: candidateWindow.showOpenFilePicker.bind(candidateWindow),
    showSaveFilePicker: candidateWindow.showSaveFilePicker.bind(candidateWindow)
  } satisfies PgmlFileSystemAccessApi
}

const runIdbRequest = <T>(request: IDBRequest<T>) => {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onerror = () => {
      reject(request.error)
    }
  })
}

const openPgmlComputerFileDatabase = () => {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const candidateWindow = getClientWindow()

    if (!candidateWindow?.indexedDB) {
      reject(new Error('IndexedDB is not available.'))
      return
    }

    const request = candidateWindow.indexedDB.open(pgmlComputerFileDatabaseName, 1)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains(pgmlComputerFileStoreName)) {
        database.createObjectStore(pgmlComputerFileStoreName, {
          keyPath: 'id'
        })
      }
    }

    request.onsuccess = () => {
      resolve(request.result)
    }

    request.onerror = () => {
      reject(request.error)
    }
  })
}

const createIndexedDbPgmlComputerFileStore = async () => {
  try {
    const database = await openPgmlComputerFileDatabase()

    return {
      delete: async (id: string) => {
        const transaction = database.transaction(pgmlComputerFileStoreName, 'readwrite')

        await runIdbRequest(transaction.objectStore(pgmlComputerFileStoreName).delete(id))
      },
      getAll: async () => {
        const transaction = database.transaction(pgmlComputerFileStoreName, 'readonly')

        return await runIdbRequest(transaction.objectStore(pgmlComputerFileStoreName).getAll())
      },
      getById: async (id: string) => {
        const transaction = database.transaction(pgmlComputerFileStoreName, 'readonly')
        const result = await runIdbRequest(transaction.objectStore(pgmlComputerFileStoreName).get(id))

        return result ?? null
      },
      put: async (record: StoredPgmlRecentComputerFile) => {
        const transaction = database.transaction(pgmlComputerFileStoreName, 'readwrite')

        await runIdbRequest(transaction.objectStore(pgmlComputerFileStoreName).put(record))
      }
    } satisfies PgmlComputerFileStore
  } catch {
    return null
  }
}

const getDefaultPgmlComputerFileStore = async () => {
  const candidateWindow = getClientWindow()

  if (!candidateWindow) {
    return null
  }

  if (candidateWindow.__PGML_COMPUTER_FILE_STORE__) {
    return candidateWindow.__PGML_COMPUTER_FILE_STORE__
  }

  if (pgmlComputerFileStorePromise === null) {
    pgmlComputerFileStorePromise = createIndexedDbPgmlComputerFileStore()
  }

  return await pgmlComputerFileStorePromise
}

const getPgmlComputerFileStore = async (options?: PgmlComputerFileActionOptions) => {
  return options?.store ?? await getDefaultPgmlComputerFileStore()
}

const getPgmlFileSystemAccessApi = (options?: PgmlComputerFileActionOptions) => {
  return options?.access ?? getDefaultFileSystemAccessApi()
}

const getComputerFilePermissionState = async (
  handle: PgmlComputerFileHandle,
  options?: EnsureComputerFilePermissionOptions
) => {
  const permissionOptions = {
    mode: 'readwrite'
  } as const
  let lastKnownPermission: PgmlFilePermissionState = 'granted'

  if (typeof handle.queryPermission === 'function') {
    const existingPermission = await handle.queryPermission(permissionOptions)

    lastKnownPermission = existingPermission

    if (existingPermission === 'granted') {
      return existingPermission
    }

    if (!options?.interactive) {
      return existingPermission
    }
  }

  if (options?.interactive && typeof handle.requestPermission === 'function') {
    return await handle.requestPermission(permissionOptions)
  }

  return lastKnownPermission
}

const ensureComputerFilePermission = async (
  handle: PgmlComputerFileHandle,
  options?: EnsureComputerFilePermissionOptions
) => {
  return await getComputerFilePermissionState(handle, options) === 'granted'
}

const readComputerFileText = async (handle: PgmlComputerFileHandle) => {
  const file = await handle.getFile()

  return {
    name: stripPgmlFileExtension(file.name),
    text: await file.text()
  }
}

const writeComputerFileText = async (handle: PgmlComputerFileHandle, text: string) => {
  const writable = await handle.createWritable()

  await writable.write(text)
  await writable.close()
}

const tryWriteComputerFileText = async (handle: PgmlComputerFileHandle, text: string) => {
  try {
    await writeComputerFileText(handle, text)
    return true
  } catch (error) {
    if (isComputerFilePermissionError(error)) {
      return false
    }

    throw error
  }
}

const findMatchingRecentComputerFileRecord = async (
  handle: PgmlComputerFileHandle,
  records: StoredPgmlRecentComputerFile[]
) => {
  for (const record of records) {
    if (await record.handle.isSameEntry(handle)) {
      return record
    }
  }

  return null
}

const upsertRecentComputerFileRecord = async (
  handle: PgmlComputerFileHandle,
  store: PgmlComputerFileStore
) => {
  const existingRecords = await store.getAll()
  const matchingRecord = await findMatchingRecentComputerFileRecord(handle, existingRecords)
  const file = await handle.getFile()
  const nextRecord: StoredPgmlRecentComputerFile = {
    handle,
    id: matchingRecord?.id || nanoid(),
    name: stripPgmlFileExtension(file.name),
    updatedAt: new Date().toISOString()
  }

  await store.put(nextRecord)

  return nextRecord
}

export const isComputerFilePersistenceSupported = async (options?: PgmlComputerFileActionOptions) => {
  const access = getPgmlFileSystemAccessApi(options)
  const store = await getPgmlComputerFileStore(options)

  return access !== null && store !== null
}

export const listRecentComputerPgmlFiles = async (options?: PgmlComputerFileActionOptions) => {
  const store = await getPgmlComputerFileStore(options)

  if (!store) {
    return []
  }

  const records = await store.getAll()

  return sortRecentComputerFiles(records.map(toRecentComputerFile))
}

export const getRecentComputerPgmlFilePermissionState = async (
  recentFileId: string,
  options?: PgmlComputerFileActionOptions
): Promise<PgmlFilePermissionState | null> => {
  const store = await getPgmlComputerFileStore(options)

  if (!store) {
    return null
  }

  const record = await store.getById(recentFileId)

  if (!record) {
    return null
  }

  return await getComputerFilePermissionState(record.handle, {
    interactive: false
  })
}

export const createComputerPgmlFile = async (
  input: {
    name: string
    text: string
  },
  options?: PgmlComputerFileActionOptions
): Promise<PgmlComputerFileResult | null> => {
  const access = getPgmlFileSystemAccessApi(options)
  const store = await getPgmlComputerFileStore(options)

  if (!access || !store) {
    return null
  }

  try {
    const handle = await access.showSaveFilePicker({
      excludeAcceptAllOption: true,
      suggestedName: ensurePgmlFileName(input.name),
      types: pgmlFileTypeFilters
    })

    if (!await ensureComputerFilePermission(handle, {
      interactive: true
    })) {
      return null
    }

    await writeComputerFileText(handle, input.text)

    const nextRecord = await upsertRecentComputerFileRecord(handle, store)
    const loadedFile = await loadRecentComputerPgmlFile(nextRecord.id, {
      store
    })

    if (!loadedFile) {
      await store.delete(nextRecord.id)
      return null
    }

    return loadedFile
  } catch (error) {
    if (isAbortError(error)) {
      return null
    }

    throw error
  }
}

export const openComputerPgmlFile = async (
  options?: PgmlComputerFileActionOptions
): Promise<PgmlComputerFileResult | null> => {
  const access = getPgmlFileSystemAccessApi(options)
  const store = await getPgmlComputerFileStore(options)

  if (!access || !store) {
    return null
  }

  try {
    const handles = await access.showOpenFilePicker({
      excludeAcceptAllOption: true,
      multiple: false,
      types: pgmlFileTypeFilters
    })
    const handle = handles[0]

    if (!handle || !await ensureComputerFilePermission(handle, {
      interactive: true
    })) {
      return null
    }

    const text = await readComputerFileText(handle)
    const nextRecord = await upsertRecentComputerFileRecord(handle, store)

    return {
      entry: toRecentComputerFile(nextRecord),
      text: text.text
    }
  } catch (error) {
    if (isAbortError(error)) {
      return null
    }

    throw error
  }
}

export const loadRecentComputerPgmlFile = async (
  recentFileId: string,
  options?: PgmlComputerFileActionOptions
): Promise<PgmlComputerFileResult | null> => {
  const store = await getPgmlComputerFileStore(options)

  if (!store) {
    return null
  }

  const record = await store.getById(recentFileId)

  if (!record || !await ensureComputerFilePermission(record.handle, {
    interactive: true
  })) {
    return null
  }

  const file = await readComputerFileText(record.handle)
  const nextRecord: StoredPgmlRecentComputerFile = {
    ...record,
    name: file.name,
    updatedAt: new Date().toISOString()
  }

  await store.put(nextRecord)

  return {
    entry: toRecentComputerFile(nextRecord),
    text: file.text
  }
}

export const writeRecentComputerPgmlFile = async (
  input: {
    recentFileId: string
    text: string
  },
  options?: WriteRecentComputerPgmlFileOptions
): Promise<PgmlRecentComputerFileWriteResult> => {
  const store = await getPgmlComputerFileStore(options)
  const permissionMode = options?.permissionMode ?? 'interactive'

  if (!store) {
    return {
      ok: false,
      reason: 'unsupported'
    }
  }

  const record = await store.getById(input.recentFileId)

  if (!record) {
    return {
      ok: false,
      reason: 'not-found'
    }
  }

  const hasPermission = await ensureComputerFilePermission(record.handle, {
    interactive: permissionMode === 'interactive'
  })

  if (!hasPermission) {
    return {
      ok: false,
      reason: 'permission-denied'
    }
  }

  let didWrite = await tryWriteComputerFileText(record.handle, input.text)

  if (!didWrite) {
    if (permissionMode !== 'interactive') {
      return {
        ok: false,
        reason: 'permission-denied'
      }
    }

    const didRestorePermission = await ensureComputerFilePermission(record.handle, {
      interactive: true
    })

    if (!didRestorePermission) {
      return {
        ok: false,
        reason: 'permission-denied'
      }
    }

    didWrite = await tryWriteComputerFileText(record.handle, input.text)

    if (!didWrite) {
      return {
        ok: false,
        reason: 'permission-denied'
      }
    }
  }

  const file = await record.handle.getFile()
  const nextRecord: StoredPgmlRecentComputerFile = {
    ...record,
    name: stripPgmlFileExtension(file.name),
    updatedAt: new Date().toISOString()
  }

  await store.put(nextRecord)

  return {
    entry: toRecentComputerFile(nextRecord),
    ok: true
  }
}

export const deleteRecentComputerPgmlFile = async (
  recentFileId: string,
  options?: PgmlComputerFileActionOptions
) => {
  const store = await getPgmlComputerFileStore(options)

  if (!store) {
    return false
  }

  await store.delete(recentFileId)

  return true
}
