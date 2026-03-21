import type { Page } from '@playwright/test'

const testComputerFileStorageKey = 'pgml-test-computer-files'
type MockComputerFilePermissionState = 'denied' | 'granted' | 'prompt'

export type MockComputerFileState = {
  files: Record<string, {
    fileName: string
    text: string
  }>
  nextId: number
  openQueue: string[]
  permissions: Record<string, {
    query: MockComputerFilePermissionState
    request: MockComputerFilePermissionState
  }>
  recent: Array<{
    handleId: string
    id: string
    name: string
    updatedAt: string
  }>
  saveQueue: Array<{
    fileId: string
    fileName: string
  }>
}

export const installMockComputerFiles = async (page: Page) => {
  await page.addInitScript((storageKey: string) => {
    type StoredFile = {
      fileName: string
      text: string
    }

    type StoredRecentEntry = {
      handleId: string
      id: string
      name: string
      updatedAt: string
    }

    type PickerState = {
      files: Record<string, StoredFile>
      nextId: number
      recent: StoredRecentEntry[]
      saveQueue: Array<{
        fileId: string
        fileName: string
      }>
      openQueue: string[]
      permissions: Record<string, {
        query: MockComputerFilePermissionState
        request: MockComputerFilePermissionState
      }>
    }

    type TestComputerFileWindow = Window & {
      __PGML_COMPUTER_FILE_STORE__?: {
        delete: (id: string) => Promise<void>
        getAll: () => Promise<Array<{
          handle: unknown
          id: string
          name: string
          updatedAt: string
        }>>
        getById: (id: string) => Promise<{
          handle: unknown
          id: string
          name: string
          updatedAt: string
        } | null>
        put: (record: {
          handle: {
            getFile: () => Promise<{
              name: string
            }>
          }
          id: string
          name: string
          updatedAt: string
        }) => Promise<void>
      }
      __PGML_FILE_SYSTEM_ACCESS__?: {
        showOpenFilePicker: () => Promise<unknown[]>
        showSaveFilePicker: () => Promise<unknown>
      }
      __PGML_TEST_COMPUTER_FILES__?: {
        primeFile: (input: {
          fileId?: string
          fileName: string
          text: string
          updatedAt?: string
        }) => string
        queueOpenFile: (fileId: string) => void
        queueSaveFile: (fileName: string, fileId?: string) => string
        readState: () => PickerState
        setPermission: (input: {
          fileId: string
          queryPermission: MockComputerFilePermissionState
          requestPermission?: MockComputerFilePermissionState
        }) => void
      }
    }

    const typedWindow = window as TestComputerFileWindow

    const readState = (): PickerState => {
      const rawState = window.localStorage.getItem(storageKey)

      if (!rawState) {
        return {
          files: {},
          nextId: 1,
          recent: [],
          saveQueue: [],
          openQueue: [],
          permissions: {}
        }
      }

      const parsedState = JSON.parse(rawState) as PickerState

      return {
        ...parsedState,
        openQueue: parsedState.openQueue || [],
        permissions: parsedState.permissions || {},
        recent: parsedState.recent || [],
        saveQueue: parsedState.saveQueue || []
      }
    }

    const writeState = (state: PickerState) => {
      window.localStorage.setItem(storageKey, JSON.stringify(state))
    }

    const upsertRecentEntry = (state: PickerState, entry: StoredRecentEntry) => {
      state.recent = [
        entry,
        ...state.recent.filter(existingEntry => existingEntry.id !== entry.id)
      ]
    }

    const ensurePermissionState = (state: PickerState, fileId: string) => {
      if (!state.permissions[fileId]) {
        state.permissions[fileId] = {
          query: 'granted',
          request: 'granted'
        }
      }

      return state.permissions[fileId]
    }

    const createHandle = (fileId: string) => {
      return {
        __pgmlFileId: fileId,
        createWritable: async () => {
          let nextText = ''

          return {
            close: async () => {
              const state = readState()
              const storedFile = state.files[fileId]

              if (storedFile) {
                storedFile.text = nextText
                writeState(state)
              }
            },
            write: async (contents: string) => {
              nextText = String(contents)
            }
          }
        },
        getFile: async () => {
          const state = readState()
          const storedFile = state.files[fileId]

          if (!storedFile) {
            throw new Error(`Unknown mock computer file: ${fileId}`)
          }

          return {
            name: storedFile.fileName,
            text: async () => storedFile.text
          }
        },
        isSameEntry: async (other: unknown) => {
          return typeof other === 'object'
            && other !== null
            && '__pgmlFileId' in other
            && other.__pgmlFileId === fileId
        },
        queryPermission: async () => {
          const state = readState()

          return ensurePermissionState(state, fileId).query
        },
        requestPermission: async () => {
          const state = readState()
          const permissionState = ensurePermissionState(state, fileId)

          permissionState.query = permissionState.request
          writeState(state)

          return permissionState.request
        }
      }
    }

    typedWindow.__PGML_TEST_COMPUTER_FILES__ = {
      primeFile: (input) => {
        const state = readState()
        const fileId = input.fileId || `mock-file-${state.nextId}`

        state.nextId += 1
        state.files[fileId] = {
          fileName: input.fileName,
          text: input.text
        }
        ensurePermissionState(state, fileId)
        upsertRecentEntry(state, {
          handleId: fileId,
          id: fileId,
          name: input.fileName.replace(/\.pgml$/iu, ''),
          updatedAt: input.updatedAt || new Date().toISOString()
        })
        writeState(state)

        return fileId
      },
      queueOpenFile: (fileId) => {
        const state = readState()

        state.openQueue.push(fileId)
        writeState(state)
      },
      queueSaveFile: (fileName, fileId) => {
        const state = readState()
        const nextFileId = fileId || `mock-file-${state.nextId}`

        state.nextId += 1
        state.files[nextFileId] = {
          fileName,
          text: state.files[nextFileId]?.text || ''
        }
        ensurePermissionState(state, nextFileId)
        state.saveQueue.push({
          fileId: nextFileId,
          fileName
        })
        writeState(state)

        return nextFileId
      },
      readState: () => readState(),
      setPermission: (input) => {
        const state = readState()
        const permissionState = ensurePermissionState(state, input.fileId)

        permissionState.query = input.queryPermission
        permissionState.request = input.requestPermission || input.queryPermission
        writeState(state)
      }
    }

    typedWindow.__PGML_COMPUTER_FILE_STORE__ = {
      delete: async (id) => {
        const state = readState()

        state.recent = state.recent.filter(entry => entry.id !== id)
        writeState(state)
      },
      getAll: async () => {
        const state = readState()

        return state.recent.map((entry) => {
          return {
            ...entry,
            handle: createHandle(entry.handleId)
          }
        })
      },
      getById: async (id) => {
        const state = readState()
        const entry = state.recent.find(candidate => candidate.id === id)

        if (!entry) {
          return null
        }

        return {
          ...entry,
          handle: createHandle(entry.handleId)
        }
      },
      put: async (record) => {
        const state = readState()
        const file = await record.handle.getFile()
        const recordHandle = record.handle as {
          __pgmlFileId?: string
        }
        const handleId = typeof recordHandle.__pgmlFileId === 'string'
          ? recordHandle.__pgmlFileId
          : record.id

        state.files[handleId] = {
          fileName: file.name,
          text: state.files[handleId]?.text || ''
        }
        upsertRecentEntry(state, {
          handleId,
          id: record.id,
          name: record.name,
          updatedAt: record.updatedAt
        })
        writeState(state)
      }
    }

    typedWindow.__PGML_FILE_SYSTEM_ACCESS__ = {
      showOpenFilePicker: async () => {
        const state = readState()
        const nextFileId = state.openQueue.shift()

        writeState(state)

        if (!nextFileId) {
          throw new DOMException('No mock computer file queued for open.', 'AbortError')
        }

        return [createHandle(nextFileId)]
      },
      showSaveFilePicker: async () => {
        const state = readState()
        const nextRequest = state.saveQueue.shift()

        writeState(state)

        if (!nextRequest) {
          throw new DOMException('No mock computer file queued for save.', 'AbortError')
        }

        return createHandle(nextRequest.fileId)
      }
    }
  }, testComputerFileStorageKey)
}

export const queueMockComputerSave = async (page: Page, fileName: string, fileId?: string) => {
  return await page.evaluate(({ nextFileId, nextFileName }) => {
    const typedWindow = window as Window & {
      __PGML_TEST_COMPUTER_FILES__?: {
        queueSaveFile: (fileName: string, fileId?: string) => string
      }
    }

    return typedWindow.__PGML_TEST_COMPUTER_FILES__?.queueSaveFile(nextFileName, nextFileId) || null
  }, {
    nextFileId: fileId,
    nextFileName: fileName
  })
}

export const queueMockComputerOpen = async (page: Page, fileId: string) => {
  await page.evaluate((nextFileId) => {
    const typedWindow = window as Window & {
      __PGML_TEST_COMPUTER_FILES__?: {
        queueOpenFile: (fileId: string) => void
      }
    }

    typedWindow.__PGML_TEST_COMPUTER_FILES__?.queueOpenFile(nextFileId)
  }, fileId)
}

export const primeMockComputerFile = async (
  page: Page,
  input: {
    fileId?: string
    fileName: string
    text: string
    updatedAt?: string
  }
) => {
  return await page.evaluate((nextFile) => {
    const typedWindow = window as Window & {
      __PGML_TEST_COMPUTER_FILES__?: {
        primeFile: (input: {
          fileId?: string
          fileName: string
          text: string
          updatedAt?: string
        }) => string
      }
    }

    return typedWindow.__PGML_TEST_COMPUTER_FILES__?.primeFile(nextFile) || null
  }, input)
}

export const readMockComputerFileState = async (page: Page) => {
  return await page.evaluate(() => {
    const typedWindow = window as Window & {
      __PGML_TEST_COMPUTER_FILES__?: {
        readState: () => MockComputerFileState
      }
    }

    return typedWindow.__PGML_TEST_COMPUTER_FILES__?.readState() || null
  }) as MockComputerFileState | null
}

export const setMockComputerFilePermission = async (
  page: Page,
  input: {
    fileId: string
    queryPermission: MockComputerFilePermissionState
    requestPermission?: MockComputerFilePermissionState
  }
) => {
  await page.evaluate((nextPermission) => {
    const typedWindow = window as Window & {
      __PGML_TEST_COMPUTER_FILES__?: {
        setPermission: (input: {
          fileId: string
          queryPermission: MockComputerFilePermissionState
          requestPermission?: MockComputerFilePermissionState
        }) => void
      }
    }

    typedWindow.__PGML_TEST_COMPUTER_FILES__?.setPermission(nextPermission)
  }, input)
}
