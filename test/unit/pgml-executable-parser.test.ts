import { beforeAll, describe, expect, it } from 'vitest'

import {
  buildPgmlRoutineSemanticModel,
  buildPgmlSequenceSemanticModel,
  buildPgmlTriggerSemanticModel,
  initializePgmlExecutableParser
} from '../../app/utils/pgml-executable-parser'
import {
  executableParserPortableCorpus,
  semanticPlpgsqlFunctionBaseline,
  semanticPlpgsqlFunctionEquivalent,
  semanticSequenceBaseline,
  semanticSequenceChanged,
  semanticSequenceEquivalent,
  semanticSqlFunctionBaseline,
  semanticSqlFunctionChanged,
  semanticSqlFunctionEquivalent,
  semanticTriggerBaseline,
  semanticTriggerChanged,
  semanticTriggerEquivalent
} from './pgml-executable-parser-fixtures'

describe('PGML executable parser', () => {
  beforeAll(async () => {
    await Promise.all([
      initializePgmlExecutableParser(15),
      initializePgmlExecutableParser(16),
      initializePgmlExecutableParser(17)
    ])
  })

  it('parses the portable executable corpus across PostgreSQL 15, 16, and 17', () => {
    ;([15, 16, 17] as const).forEach((version) => {
      executableParserPortableCorpus.forEach((source) => {
        if (source.includes('CREATE TRIGGER')) {
          expect(buildPgmlTriggerSemanticModel(source, version)?.status).toBe('parsed')
          return
        }

        if (source.includes('CREATE SEQUENCE')) {
          expect(buildPgmlSequenceSemanticModel(source, version)?.status).toBe('parsed')
          return
        }

        expect(buildPgmlRoutineSemanticModel(source, version)?.status).toBe('parsed')
      })
    })
  })

  it('builds a SQL routine semantic fingerprint from parser structure instead of raw text', () => {
    const routine = buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline)

    expect(routine?.status).toBe('parsed')
    expect(routine?.fingerprint).toEqual(expect.objectContaining({
      body: expect.objectContaining({
        kind: 'sql_ast'
      }),
      kind: 'function',
      language: 'sql',
      name: 'public.calc_total',
      parameters: expect.arrayContaining([
        expect.objectContaining({
          defaultValue: expect.any(Object),
          mode: 'in',
          name: 'include_archived',
          type: 'boolean'
        }),
        expect.objectContaining({
          mode: 'out',
          name: 'total',
          type: 'numeric'
        })
      ]),
      returnType: 'numeric'
    }))
  })

  it('treats equivalent SQL function, PL/pgSQL function, trigger, and sequence definitions as semantically equal', () => {
    expect(buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline)?.fingerprint)
      .toEqual(buildPgmlRoutineSemanticModel(semanticSqlFunctionEquivalent)?.fingerprint)
    expect(buildPgmlRoutineSemanticModel(semanticPlpgsqlFunctionBaseline)?.fingerprint)
      .toEqual(buildPgmlRoutineSemanticModel(semanticPlpgsqlFunctionEquivalent)?.fingerprint)
    expect(buildPgmlTriggerSemanticModel(semanticTriggerBaseline)?.fingerprint)
      .toEqual(buildPgmlTriggerSemanticModel(semanticTriggerEquivalent)?.fingerprint)
    expect(buildPgmlSequenceSemanticModel(semanticSequenceBaseline)?.fingerprint)
      .toEqual(buildPgmlSequenceSemanticModel(semanticSequenceEquivalent)?.fingerprint)
  })

  it('surfaces material executable changes in parser fingerprints', () => {
    expect(buildPgmlRoutineSemanticModel(semanticSqlFunctionBaseline)?.fingerprint)
      .not.toEqual(buildPgmlRoutineSemanticModel(semanticSqlFunctionChanged)?.fingerprint)
    expect(buildPgmlTriggerSemanticModel(semanticTriggerBaseline)?.fingerprint)
      .not.toEqual(buildPgmlTriggerSemanticModel(semanticTriggerChanged)?.fingerprint)
    expect(buildPgmlSequenceSemanticModel(semanticSequenceBaseline)?.fingerprint)
      .not.toEqual(buildPgmlSequenceSemanticModel(semanticSequenceChanged)?.fingerprint)
  })
})
