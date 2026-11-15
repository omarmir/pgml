export type PgsqlParserResult = {
  stmts?: Array<{ stmt?: unknown }>
}

export type PgsqlParserModule = {
  loadModule: () => Promise<void>
  parseSync: (query: string) => PgsqlParserResult
}

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

type WasmState = { kind: 'loading', promise: Promise<void> }
  | { kind: 'ready', module: PgQueryWasmModule }
  | { kind: 'failed', error: unknown }

const isWasmModule = (value: unknown): value is PgQueryWasmModule => {
  return typeof value === 'object' && value !== null
    && '_free' in value && typeof value._free === 'function'
    && '_malloc' in value && typeof value._malloc === 'function'
    && '_wasm_free_parse_result' in value && typeof value._wasm_free_parse_result === 'function'
    && '_wasm_parse_query_raw' in value && typeof value._wasm_parse_query_raw === 'function'
    && 'UTF8ToString' in value && typeof value.UTF8ToString === 'function'
    && 'getValue' in value && typeof value.getValue === 'function'
    && 'lengthBytesUTF8' in value && typeof value.lengthBytesUTF8 === 'function'
    && 'stringToUTF8' in value && typeof value.stringToUTF8 === 'function'
}

const isParseResult = (value: unknown): value is PgsqlParserResult => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && (!('stmts' in value) || value.stmts === undefined || (
      Array.isArray(value.stmts)
      && value.stmts.every(statement => typeof statement === 'object' && statement !== null)
    ))
}

const stringToPtr = (module: PgQueryWasmModule, value: string) => {
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

export const createPgsqlParserAdapter = (options: {
  loadWasm: () => Promise<unknown>
}): PgsqlParserModule => {
  const promise = options.loadWasm().then((module: unknown) => {
    if (!isWasmModule(module)) {
      throw new Error('Invalid PostgreSQL WASM module.')
    }

    state = { kind: 'ready', module }
  }).catch((error: unknown) => {
    state = { kind: 'failed', error }
    throw error
  })
  let state: WasmState = { kind: 'loading', promise }

  const loadModule = async () => {
    switch (state.kind) {
      case 'loading':
        await state.promise
        return
      case 'ready':
        return
      case 'failed':
        throw state.error
    }
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

    if (state.kind !== 'ready') {
      throw new Error('WASM module not initialized. Call `loadModule()` first.')
    }

    const module = state.module
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

      const result: unknown = JSON.parse(module.UTF8ToString(parseTreePtr))

      if (!isParseResult(result)) {
        throw new Error('Invalid PostgreSQL parse result.')
      }

      return result
    } finally {
      module._free(queryPtr)

      if (resultPtr) {
        module._wasm_free_parse_result(resultPtr)
      }
    }
  }

  return { loadModule, parseSync }
}
