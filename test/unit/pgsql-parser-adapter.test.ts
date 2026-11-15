import { describe, expect, it, vi } from 'vitest'

import { createPgsqlParserAdapter } from '../../app/utils/pgsql-parser-adapter'

const createWasmModule = () => ({
  _free: vi.fn(),
  _malloc: vi.fn(() => 100),
  _wasm_free_parse_result: vi.fn(),
  _wasm_parse_query_raw: vi.fn(() => 200),
  UTF8ToString: vi.fn(() => '{"stmts":[{"stmt":{"SelectStmt":{}}}]}'),
  getValue: vi.fn((ptr: number) => ptr === 200 ? 300 : 0),
  lengthBytesUTF8: vi.fn((value: string) => value.length),
  stringToUTF8: vi.fn()
})

describe('PostgreSQL WASM adapter', () => {
  it('joins initialization and parses only after readiness, releasing both allocations', async () => {
    const module = createWasmModule()
    let completeLoad: (value: unknown) => void = () => {}
    const loadWasm = vi.fn(() => new Promise<unknown>((resolve) => {
      completeLoad = resolve
    }))
    const parser = createPgsqlParserAdapter({ loadWasm })
    const first = parser.loadModule()
    const second = parser.loadModule()

    expect(() => parser.parseSync('select 1')).toThrow('WASM module not initialized')
    completeLoad(module)
    await Promise.all([first, second, parser.loadModule()])

    expect(parser.parseSync('select 1')).toEqual({ stmts: [{ stmt: { SelectStmt: {} } }] })
    expect(loadWasm).toHaveBeenCalledTimes(1)
    expect(module.stringToUTF8).toHaveBeenCalledWith('select 1', 100, 9)
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).toHaveBeenCalledExactlyOnceWith(200)
  })

  it('retains initialization failure and rejects invalid module shapes', async () => {
    const failure = new Error('Could not fetch WASM')
    const loadWasm = vi.fn().mockRejectedValue(failure)
    const parser = createPgsqlParserAdapter({ loadWasm })

    await expect(parser.loadModule()).rejects.toBe(failure)
    await expect(parser.loadModule()).rejects.toBe(failure)
    expect(loadWasm).toHaveBeenCalledTimes(1)
    expect(() => parser.parseSync('select 1')).toThrow('WASM module not initialized')

    const invalidParser = createPgsqlParserAdapter({ loadWasm: async () => ({}) })
    await expect(invalidParser.loadModule()).rejects.toThrow('Invalid PostgreSQL WASM module')
  })

  it.each([
    [null, 'Query cannot be null or undefined'],
    [undefined, 'Query cannot be null or undefined'],
    [12, 'Query must be a string, got number'],
    ['  ', 'Query cannot be empty']
  ])('rejects invalid query %s without allocating memory', async (query, message) => {
    const module = createWasmModule()
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => Reflect.apply(parser.parseSync, undefined, [query])).toThrow(message)
    expect(module._malloc).not.toHaveBeenCalled()
  })

  it('releases the input allocation when string encoding fails', async () => {
    const module = createWasmModule()
    module.stringToUTF8.mockImplementation(() => {
      throw new Error('Encoding failed')
    })
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => parser.parseSync('select 1')).toThrow('Encoding failed')
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).not.toHaveBeenCalled()
  })

  it('releases the input allocation when parsing cannot allocate a result', async () => {
    const module = createWasmModule()
    module._wasm_parse_query_raw.mockReturnValue(0)
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => parser.parseSync('select 1')).toThrow('Failed to allocate memory for parse result')
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).not.toHaveBeenCalled()
  })

  it.each([true, false])('releases allocations for parser errors with a message pointer: %s', async (withMessage) => {
    const module = createWasmModule()
    module.getValue.mockImplementation((ptr) => {
      if (ptr === 208) return 400
      if (ptr === 400 && withMessage) return 500
      return 0
    })
    module.UTF8ToString.mockReturnValue('SQL syntax error')
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => parser.parseSync('broken')).toThrow(withMessage ? 'SQL syntax error' : 'Unknown error')
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).toHaveBeenCalledExactlyOnceWith(200)
  })

  it('releases allocations when the parse tree is missing', async () => {
    const module = createWasmModule()
    module.getValue.mockReturnValue(0)
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => parser.parseSync('select 1')).toThrow('Parse result is null')
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).toHaveBeenCalledExactlyOnceWith(200)
  })

  it.each(['broken JSON', 'null', '{"stmts":3}', '{"stmts":[null]}'])('rejects malformed decoded result %s and frees allocations', async (value) => {
    const module = createWasmModule()
    module.UTF8ToString.mockReturnValue(value)
    const parser = createPgsqlParserAdapter({ loadWasm: async () => module })
    await parser.loadModule()

    expect(() => parser.parseSync('select 1')).toThrow()
    expect(module._free).toHaveBeenCalledExactlyOnceWith(100)
    expect(module._wasm_free_parse_result).toHaveBeenCalledExactlyOnceWith(200)
  })
})
