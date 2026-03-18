import { describe, expect, it } from 'vitest'

import {
  buildPgmlWithNodeProperties,
  parsePgml,
  stripPgmlPropertiesBlocks
} from '../../app/utils/pgml'

const baseSource = `TableGroup Core {
  users
  Note: Shared identity and account ownership
}

Table public.users {
  id uuid [pk]
  email text [not null]
}

Sequence user_number_seq {
  source: $sql$
    CREATE SEQUENCE public.user_number_seq;
  $sql$
}`

describe('PGML node properties', () => {
  it('parses embedded node properties blocks', () => {
    const source = `${baseSource}

Properties "group:Core" {
  x: 144
  y: 96
  width: 480
  height: 320
  table_columns: 2
}

Properties "sequence:user_number_seq" {
  x: 1188
  y: 612
  width: 308
  height: 156
}`

    const model = parsePgml(source)

    expect(model.nodeProperties).toEqual({
      'group:Core': {
        x: 144,
        y: 96,
        width: 480,
        height: 320,
        tableColumns: 2
      },
      'sequence:user_number_seq': {
        x: 1188,
        y: 612,
        width: 308,
        height: 156,
        tableColumns: null
      }
    })
  })

  it('strips embedded node properties blocks from PGML text', () => {
    const source = `${baseSource}

Properties "group:Core" {
  x: 144
  y: 96
  width: 480
  height: 320
  table_columns: 2
}`

    expect(stripPgmlPropertiesBlocks(source)).toBe(baseSource)
  })

  it('builds self-contained PGML with fresh node properties blocks', () => {
    const sourceWithOldLayout = `${baseSource}

Properties "group:Core" {
  x: 12
  y: 18
  width: 320
  height: 180
  table_columns: 1
}`

    const built = buildPgmlWithNodeProperties(sourceWithOldLayout, {
      'group:Core': {
        x: 240,
        y: 180,
        width: 520,
        height: 420,
        tableColumns: 2
      },
      'sequence:user_number_seq': {
        x: 1260,
        y: 702,
        width: 308,
        height: 156,
        tableColumns: null
      }
    })

    expect(built).not.toContain('Properties "group:Core" {\n  x: 12')
    expect(built).toContain('Properties "group:Core" {')
    expect(built).toContain('table_columns: 2')
    expect(built).toContain('Properties "sequence:user_number_seq" {')

    const reparsed = parsePgml(built)

    expect(reparsed.nodeProperties['group:Core']?.x).toBe(240)
    expect(reparsed.nodeProperties['group:Core']?.tableColumns).toBe(2)
    expect(reparsed.nodeProperties['sequence:user_number_seq']?.height).toBe(156)
  })
})
