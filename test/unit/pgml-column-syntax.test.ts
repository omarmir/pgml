import { describe, expect, it } from 'vitest'
import { parsePgml } from '../../app/utils/pgml'
import { analyzePgmlDocument } from '../../app/utils/pgml-language'
import { matchPgmlColumnDefinition } from '../../app/utils/pgml-column-syntax'

describe('PGML column modifier literals', () => {
  it.each([
    `'["docx"]'::jsonb`,
    `'["docx", "pdf"]'::jsonb`,
    `'[]'::jsonb`,
    `'["it''s a document"]'::jsonb`,
    '`\'["docx"]\'::jsonb`'
  ])('preserves the JSONB default %s in the model and language analysis', (defaultValue) => {
    const source = `Table templates {
  egcs_tp_outputformats jsonb [not null, default: ${defaultValue}] // Non-empty set of document formats that users may generate from this template.
}`

    expect(analyzePgmlDocument(source).diagnostics).toEqual([])
    expect(parsePgml(source).tables[0]?.columns).toEqual([
      expect.objectContaining({
        name: 'egcs_tp_outputformats',
        type: 'jsonb',
        modifiers: ['not null', `default: ${defaultValue}`]
      })
    ])
  })

  it('rejects a missing outer modifier bracket', () => {
    expect(matchPgmlColumnDefinition(`formats jsonb [default: '["docx"]'::jsonb`)).toBeNull()
  })
})
