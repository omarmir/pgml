// @ts-expect-error Internal wasm loader path is resolved by Vite but has no published typings.
import PgQueryModule from '../../node_modules/@pgsql/parser/wasm/v15/libpg-query.js'
import wasmUrl from '../../node_modules/@pgsql/parser/wasm/v15/libpg-query.wasm?url'

type PgQueryWasmModule = {
  _free: (ptr: number) => void
  _malloc: (size: number) => number
  _wasm_free_parse_result: (ptr: number) => void
  _wasm_parse_query_raw: (queryPtr: number) => number
  UTF8ToString: (ptr: number) => string
  getValue: (ptr: number, type: string) => number
  lengthBytesUTF8: (value: string) => number
  stringToUTF8: (value: string, ptr: number, maxBytesToWrite: number) => void
}

type PgsqlParserModule = {
  loadModule: () => Promise<void>
  parseSync: (query: string) => {
    stmts?: Array<{
      stmt?: unknown
    }>
  }
}

let wasmModule: PgQueryWasmModule | null = null
const wasmBinaryLocation = import.meta.client
  ? wasmUrl
  : new URL('../../node_modules/@pgsql/parser/wasm/v15/libpg-query.wasm', import.meta.url).href

const initPromise = PgQueryModule({
  locateFile: (path: string) => {
    return path === 'libpg-query.wasm' ? wasmBinaryLocation : path
  }
}).then((module: unknown) => {
  wasmModule = module as PgQueryWasmModule
})

const ensureLoaded = () => {
  if (!wasmModule) {
    throw new Error('WASM module not initialized. Call `loadModule()` first.')
  }

  return wasmModule
}

const stringToPtr = (
  module: PgQueryWasmModule,
  value: string
) => {
  const size = module.lengthBytesUTF8(value) + 1
  const ptr = module._malloc(size)

  try {
    module.stringToUTF8(value, ptr, size)
    return ptr
  } catch (error) {
    module._free(ptr)
    throw error
  }
}

const loadModule = async () => {
  await initPromise
}

const parseSync: PgsqlParserModule['parseSync'] = (query) => {
  if (query === null || query === undefined) {
    throw new Error('Query cannot be null or undefined')
  }

  if (typeof query !== 'string') {
    throw new Error(`Query must be a string, got ${typeof query}`)
  }

  if (query.trim() === '') {
    throw new Error('Query cannot be empty')
  }

  const module = ensureLoaded()
  const queryPtr = stringToPtr(module, query)
  let resultPtr = 0

  try {
    resultPtr = module._wasm_parse_query_raw(queryPtr)

    if (!resultPtr) {
      throw new Error('Failed to allocate memory for parse result')
    }

    const parseTreePtr = module.getValue(resultPtr, 'i32')
    const errorPtr = module.getValue(resultPtr + 8, 'i32')

    if (errorPtr) {
      const messagePtr = module.getValue(errorPtr, 'i32')
      const message = messagePtr ? module.UTF8ToString(messagePtr) : 'Unknown error'

      throw new Error(message)
    }

    if (!parseTreePtr) {
      throw new Error('Parse result is null')
    }

    return JSON.parse(module.UTF8ToString(parseTreePtr)) as ReturnType<PgsqlParserModule['parseSync']>
  } finally {
    module._free(queryPtr)

    if (resultPtr) {
      module._wasm_free_parse_result(resultPtr)
    }
  }
}

export default {
  loadModule,
  parseSync
} satisfies PgsqlParserModule
