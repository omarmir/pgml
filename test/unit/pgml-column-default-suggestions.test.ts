import { describe, expect, it } from 'vitest'

import { usePgmlColumnDefaultSuggestions } from '../../app/composables/usePgmlColumnDefaultSuggestions'

describe('PGML column default suggestions', () => {
  it('returns UUID-focused suggestions for uuid columns', () => {
    const { getColumnDefaultPlaceholder, getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()

    expect(getColumnDefaultPlaceholder('uuid')).toBe('gen_random_uuid()')
    expect(getColumnDefaultSuggestions('uuid')).toEqual([
      {
        description: 'Preferred for pgcrypto-backed UUID defaults.',
        label: 'gen_random_uuid()',
        value: 'gen_random_uuid()'
      },
      {
        description: 'Use when the uuid-ossp extension is enabled.',
        label: 'uuid_generate_v4()',
        value: 'uuid_generate_v4()'
      }
    ])
  })

  it('normalizes timestamp aliases and surfaces current-time expressions', () => {
    const { getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()

    expect(getColumnDefaultSuggestions('timestamp with time zone')).toEqual([
      {
        description: 'Common Postgres function for created-at style columns.',
        label: 'now()',
        value: 'now()'
      },
      {
        description: 'ANSI current timestamp expression.',
        label: 'CURRENT_TIMESTAMP',
        value: 'CURRENT_TIMESTAMP'
      }
    ])
  })

  it('builds array and json suggestions from the exact column type', () => {
    const { getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()

    expect(getColumnDefaultSuggestions('text[]')).toEqual([
      {
        description: 'Start the column with an empty array.',
        label: '\'{}\'::text[]',
        value: '\'{}\'::text[]'
      },
      {
        description: 'Use the explicit Postgres array constructor.',
        label: 'ARRAY[]::text[]',
        value: 'ARRAY[]::text[]'
      }
    ])

    expect(getColumnDefaultSuggestions('jsonb')).toEqual([
      {
        description: 'Default to an empty JSON object.',
        label: '\'{}\'::jsonb',
        value: '\'{}\'::jsonb'
      },
      {
        description: 'Default to an empty JSON array.',
        label: '\'[]\'::jsonb',
        value: '\'[]\'::jsonb'
      }
    ])
  })

  it('falls back to a generic placeholder when the type has no curated suggestions', () => {
    const { getColumnDefaultPlaceholder, getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()

    expect(getColumnDefaultSuggestions('my_custom_domain')).toEqual([])
    expect(getColumnDefaultPlaceholder('my_custom_domain')).toBe('Type a default expression')
  })
})
