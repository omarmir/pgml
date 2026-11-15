import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  semanticSequenceBaseline,
  semanticSqlFunctionBaseline,
  semanticTriggerBaseline
} from './pgml-executable-parser-fixtures'

afterEach(() => {
  vi.doUnmock('../../app/utils/pgsql-parser-v15')
  vi.resetModules()
})

describe('executable parser readiness', () => {
  it('rebuilds temporary unavailable semantic models after each parser becomes ready', async () => {
    vi.resetModules()
    const parser = await import('../../app/utils/pgml-executable-parser')

    for (const version of [15, 16, 17] as const) {
      expect(parser.isPgmlExecutableParserReady(version)).toBe(false)
      expect(parser.buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline, version)?.status).toBe('unavailable')
      expect(parser.buildPgmlTriggerSemanticModel(semanticTriggerBaseline, version)?.status).toBe('unavailable')
      expect(parser.buildPgmlSequenceSemanticModel(semanticSequenceBaseline, version)?.status).toBe('unavailable')

      await parser.initializePgmlExecutableParser(version)

      expect(parser.isPgmlExecutableParserReady(version)).toBe(true)
      expect(parser.buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline, version)?.status).toBe('parsed')
      expect(parser.buildPgmlTriggerSemanticModel(semanticTriggerBaseline, version)?.status).toBe('parsed')
      expect(parser.buildPgmlSequenceSemanticModel(semanticSequenceBaseline, version)?.status).toBe('parsed')
    }
  })

  it('joins an existing load and publishes readiness only after it completes', async () => {
    vi.resetModules()
    let completeLoad = () => {}
    const loadModule = vi.fn(() => new Promise<void>((resolve) => {
      completeLoad = resolve
    }))
    const module = { loadModule, parseSync: vi.fn(() => ({ stmts: [] })) }
    vi.doMock('../../app/utils/pgsql-parser-v15', () => ({ default: module }))
    const parser = await import('../../app/utils/pgml-executable-parser')

    const first = parser.initializePgmlExecutableParser(15)
    const second = parser.initializePgmlExecutableParser(15)
    await vi.waitFor(() => expect(loadModule).toHaveBeenCalledTimes(1))
    expect(parser.isPgmlExecutableParserReady(15)).toBe(false)

    completeLoad()

    expect(await first).toBe(module)
    expect(await second).toBe(module)
    expect(await parser.initializePgmlExecutableParser(15)).toBe(module)
    expect(loadModule).toHaveBeenCalledTimes(1)
    expect(parser.isPgmlExecutableParserReady(15)).toBe(true)
  })

  it('retains a failed initialization without reporting readiness or retrying', async () => {
    vi.resetModules()
    const failure = new Error('WASM could not load')
    const loadModule = vi.fn().mockRejectedValue(failure)
    vi.doMock('../../app/utils/pgsql-parser-v15', () => ({
      default: { loadModule, parseSync: vi.fn() }
    }))
    const parser = await import('../../app/utils/pgml-executable-parser')

    await expect(parser.initializePgmlExecutableParser(15)).rejects.toBe(failure)
    await expect(parser.initializePgmlExecutableParser(15)).rejects.toBe(failure)

    expect(parser.isPgmlExecutableParserReady(15)).toBe(false)
    expect(loadModule).toHaveBeenCalledTimes(1)
    expect(parser.buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline, 15)?.status).toBe('unavailable')
  })
})
