import { flushPromises } from '@vue/test-utils'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import {
  deleteRecentComputerPgmlFile,
  openComputerPgmlFile,
  type PgmlComputerFileHandle,
  type PgmlFileSystemAccessApi
} from '../../app/utils/computer-files'

type TransactionEvents = {
  error: DOMException | null
  onabort: (() => void) | null
  oncomplete: (() => void) | null
  onerror: (() => void) | null
}

const successfulRequest = <T>(result: T) => {
  const request: {
    error: DOMException | null
    onerror: (() => void) | null
    onsuccess: (() => void) | null
    result: T
  } = {
    error: null,
    onerror: null,
    onsuccess: null,
    result
  }

  queueMicrotask(() => request.onsuccess?.())

  return request
}

describe('computer file IndexedDB transactions', () => {
  const indexedDbDescriptor = Object.getOwnPropertyDescriptor(window, 'indexedDB')
  const writeTransactions: TransactionEvents[] = []
  const writeRequests: ReturnType<typeof successfulRequest<undefined>>[] = []
  const database = {
    transaction: (_store: string, mode: string) => {
      const transaction: TransactionEvents & {
        objectStore: () => {
          delete: () => ReturnType<typeof successfulRequest<undefined>>
          getAll: () => ReturnType<typeof successfulRequest<unknown[]>>
          put: () => ReturnType<typeof successfulRequest<string>>
        }
      } = {
        error: null,
        onabort: null,
        oncomplete: null,
        onerror: null,
        objectStore: () => ({
          delete: () => {
            const request = successfulRequest(undefined)

            writeRequests.push(request)
            return request
          },
          getAll: () => successfulRequest<unknown[]>([]),
          put: () => successfulRequest('stored-file')
        })
      }

      if (mode === 'readwrite') {
        writeTransactions.push(transaction)
      }

      return transaction
    }
  }
  const handle: PgmlComputerFileHandle = {
    createWritable: async () => ({ close: async () => {}, write: async () => {} }),
    getFile: async () => ({ name: 'schema.pgml', text: async () => 'Table users { id int }' }),
    isSameEntry: async () => false
  }
  const access: PgmlFileSystemAccessApi = {
    showOpenFilePicker: async () => [handle],
    showSaveFilePicker: async () => handle
  }

  beforeAll(() => {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      value: { open: () => successfulRequest(database) }
    })
  })

  beforeEach(() => {
    writeTransactions.length = 0
    writeRequests.length = 0
  })

  afterAll(() => {
    if (indexedDbDescriptor) {
      Object.defineProperty(window, 'indexedDB', indexedDbDescriptor)
    } else {
      Reflect.deleteProperty(window, 'indexedDB')
    }
  })

  it.each(['put', 'delete'])('acknowledges %s only after the transaction commits', async (operation) => {
    let settled = false
    const pending = operation === 'put'
      ? openComputerPgmlFile({ access })
      : deleteRecentComputerPgmlFile('recent-file')

    void pending.then(() => {
      settled = true
    })
    await flushPromises()

    expect(writeTransactions).toHaveLength(1)
    expect(settled).toBe(false)

    writeTransactions[0]?.oncomplete?.()
    await pending

    expect(settled).toBe(true)
  })

  it.each(['onabort', 'onerror'] as const)('rejects a successful request followed by transaction %s', async (event) => {
    const pending = deleteRecentComputerPgmlFile('recent-file')
    const outcome = pending.then(
      () => 'incorrectly committed',
      (error: unknown) => error
    )

    await flushPromises()

    const transaction = writeTransactions[0]

    if (!transaction) {
      throw new Error('Expected the delete transaction to start.')
    }

    const error = new DOMException('The transaction was rolled back.', 'QuotaExceededError')

    transaction.error = error
    transaction[event]?.()

    expect(await outcome).toBe(error)
  })

  it('preserves a failed write request error before transaction completion', async () => {
    const pending = deleteRecentComputerPgmlFile('recent-file')
    const outcome = pending.catch((error: unknown) => error)

    await flushPromises()

    const request = writeRequests[0]

    if (!request) {
      throw new Error('Expected the delete request to start.')
    }

    const error = new DOMException('The stored file cannot be deleted.', 'UnknownError')

    request.error = error
    request.onerror?.()

    expect(await outcome).toBe(error)
  })

  it('reports an interrupted transaction even when IndexedDB provides no error', async () => {
    const pending = deleteRecentComputerPgmlFile('recent-file')
    const outcome = pending.catch((error: unknown) => error)

    await flushPromises()
    writeTransactions[0]?.onabort?.()

    expect(await outcome).toEqual(new Error('The computer-file transaction did not commit.'))
  })
})
