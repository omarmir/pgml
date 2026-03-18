import { describe, expect, it } from 'vitest'

import {
  normalizeSchemaName,
  parseSavedPgmlSchemas,
  slugifySchemaName
} from '../../app/composables/usePgmlStudioSchemas'

describe('PGML studio schema helpers', () => {
  it('keeps only valid saved schemas from browser storage payloads', () => {
    expect(parseSavedPgmlSchemas(null)).toEqual([])
    expect(parseSavedPgmlSchemas('not json')).toEqual([])
    expect(parseSavedPgmlSchemas(JSON.stringify({
      id: 'invalid'
    }))).toEqual([])

    expect(parseSavedPgmlSchemas(JSON.stringify([
      {
        id: 'schema-1',
        name: 'Orders',
        text: 'Table orders {}',
        updatedAt: '2026-03-18T12:00:00.000Z'
      },
      {
        id: 12,
        name: 'Broken'
      }
    ]))).toEqual([
      {
        id: 'schema-1',
        name: 'Orders',
        text: 'Table orders {}',
        updatedAt: '2026-03-18T12:00:00.000Z'
      }
    ])
  })

  it('normalizes and slugifies schema names for saves and downloads', () => {
    expect(normalizeSchemaName('  ')).toBe('Untitled schema')
    expect(normalizeSchemaName('  Orders  ')).toBe('Orders')
    expect(slugifySchemaName('Revenue & Growth')).toBe('revenue-growth')
    expect(slugifySchemaName('   ')).toBe('untitled-schema')
  })
})
