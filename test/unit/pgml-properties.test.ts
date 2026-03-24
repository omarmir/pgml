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
  it('parses group properties blocks without explicit width and height', () => {
    const source = `${baseSource}

Properties "group:Core" {
  color: #14b8a6
  x: 144
  y: 96
  table_columns: 2
}`

    const model = parsePgml(source)

    expect(model.nodeProperties['group:Core']).toEqual({
      color: '#14b8a6',
      x: 144,
      y: 96,
      tableColumns: 2
    })
  })

  it('parses embedded node properties blocks', () => {
    const source = `${baseSource}

Properties "group:Core" {
  color: #14b8a6
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
        color: '#14b8a6',
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
        height: 156
      }
    })
  })

  it('parses custom type properties blocks with layout and collapsed state', () => {
    const source = `${baseSource}

Properties "custom-type:Domain:email_address" {
  color: #14b8a6
  x: 1188
  y: 612
  collapsed: false
}`

    const model = parsePgml(source)

    expect(model.nodeProperties['custom-type:Domain:email_address']).toEqual({
      color: '#14b8a6',
      x: 1188,
      y: 612,
      collapsed: false
    })
  })

  it('parses visibility-only properties blocks for non-node entities', () => {
    const source = `${baseSource}

Properties "public.users" {
  visible: false
}`

    const model = parsePgml(source)

    expect(model.nodeProperties['public.users']).toEqual({
      visible: false
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

Domain email_address {
  base: text
}

Properties "group:Core" {
  x: 12
  y: 18
  width: 320
  height: 180
  table_columns: 1
}`

    const built = buildPgmlWithNodeProperties(sourceWithOldLayout, {
      'group:Core': {
        color: '#14b8a6',
        x: 240,
        y: 180,
        tableColumns: 2
      },
      'custom-type:Domain:email_address': {
        color: '#f97316',
        x: 1188,
        y: 612,
        collapsed: false
      },
      'public.users': {
        visible: false
      },
      'sequence:user_number_seq': {
        x: 1260,
        y: 702,
        width: 308,
        height: 156
      }
    })

    expect(built).not.toContain('Properties "group:Core" {\n  x: 12')
    expect(built).toContain('Properties "group:Core" {')
    expect(built).toContain('color: #14b8a6')
    expect(built).not.toContain('width:')
    expect(built).not.toContain('height:')
    expect(built).toContain('table_columns: 2')
    expect(built).toContain('Properties "custom-type:Domain:email_address" {')
    expect(built).toContain('color: #f97316')
    expect(built).toContain('x: 1188')
    expect(built).toContain('y: 612')
    expect(built).toContain('collapsed: false')
    expect(built).toContain('Properties "public.users" {')
    expect(built).toContain('visible: false')
    expect(built).toContain('Properties "sequence:user_number_seq" {')

    const reparsed = parsePgml(built)

    expect(reparsed.nodeProperties['group:Core']?.x).toBe(240)
    expect(reparsed.nodeProperties['group:Core']?.color).toBe('#14b8a6')
    expect(reparsed.nodeProperties['group:Core']?.tableColumns).toBe(2)
    expect(reparsed.nodeProperties['group:Core']?.width).toBeUndefined()
    expect(reparsed.nodeProperties['custom-type:Domain:email_address']?.collapsed).toBe(false)
    expect(reparsed.nodeProperties['custom-type:Domain:email_address']?.x).toBe(1188)
    expect(reparsed.nodeProperties['custom-type:Domain:email_address']?.y).toBe(612)
    expect(reparsed.nodeProperties['custom-type:Domain:email_address']?.color).toBe('#f97316')
    expect(reparsed.nodeProperties['public.users']?.visible).toBe(false)
    expect(reparsed.nodeProperties['sequence:user_number_seq']?.height).toBeUndefined()
  })

  it('drops stale node properties for unsupported executable entities when rebuilding layout blocks', () => {
    const sourceWithOldLayout = `${baseSource}

Function public.touch_users() returns trigger {
  source: $sql$
    begin
      return new;
    end;
  $sql$
}

Properties "function:public.touch_users" {
  x: 1056
  y: 1920
  color: #c084fc
}`

    const built = buildPgmlWithNodeProperties(sourceWithOldLayout, {
      'group:Core': {
        x: 240,
        y: 180
      },
      'function:public.touch_users': {
        x: 1056,
        y: 1920,
        color: '#c084fc'
      }
    })

    expect(built).toContain('Properties "group:Core" {')
    expect(built).not.toContain('Properties "function:public.touch_users" {')
  })
})
