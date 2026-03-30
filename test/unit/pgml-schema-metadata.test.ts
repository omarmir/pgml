import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import {
  applyPgmlDocumentSchemaMetadataToModel,
  clonePgmlDocumentSchemaMetadata,
  createEmptyPgmlDocumentSchemaMetadata,
  removePgmlColumnSchemaMetadataForTable,
  replacePgmlColumnSchemaMetadataEntries,
  replacePgmlTableSchemaMetadataEntries
} from '../../app/utils/pgml-schema-metadata'

describe('PGML schema metadata helpers', () => {
  it('attaches document-level table and column metadata onto parsed schema models', () => {
    const model = parsePgml(`Table public.users {
  id uuid [pk]
  email text
}`)
    const schemaMetadata = replacePgmlColumnSchemaMetadataEntries(
      replacePgmlTableSchemaMetadataEntries(
        createEmptyPgmlDocumentSchemaMetadata(),
        'public.users',
        [
          {
            key: 'owner',
            value: 'identity'
          }
        ]
      ),
      'public.users',
      'email',
      [
        {
          key: 'pii',
          value: 'restricted'
        }
      ]
    )

    const hydratedModel = applyPgmlDocumentSchemaMetadataToModel(model, schemaMetadata)

    expect(hydratedModel.tables[0]?.customMetadata).toEqual([
      {
        key: 'owner',
        value: 'identity'
      }
    ])
    expect(hydratedModel.tables[0]?.columns[1]?.customMetadata).toEqual([
      {
        key: 'pii',
        value: 'restricted'
      }
    ])
    expect(hydratedModel.tables[0]?.columns[0]?.customMetadata).toEqual([])
  })

  it('replaces and clears column metadata for one table without touching other tables', () => {
    const initialSchemaMetadata = replacePgmlColumnSchemaMetadataEntries(
      replacePgmlColumnSchemaMetadataEntries(
        createEmptyPgmlDocumentSchemaMetadata(),
        'public.users',
        'email',
        [
          {
            key: 'pii',
            value: 'restricted'
          }
        ]
      ),
      'public.accounts',
      'status',
      [
        {
          key: 'domain',
          value: 'billing'
        }
      ]
    )

    const nextSchemaMetadata = removePgmlColumnSchemaMetadataForTable(initialSchemaMetadata, 'public.users')

    expect(nextSchemaMetadata.columns).toEqual([
      {
        columnName: 'status',
        entries: [
          {
            key: 'domain',
            value: 'billing'
          }
        ],
        tableId: 'public.accounts'
      }
    ])
  })

  it('normalizes and drops empty schema metadata blocks deterministically', () => {
    const schemaMetadata = clonePgmlDocumentSchemaMetadata({
      columns: [
        {
          columnName: ' email ',
          entries: [
            { key: ' pii ', value: ' restricted ' },
            { key: '   ', value: 'ignored' }
          ],
          tableId: ' public.users '
        },
        {
          columnName: 'status',
          entries: [],
          tableId: 'public.accounts'
        }
      ],
      tables: [
        {
          entries: [
            { key: ' owner ', value: ' identity ' }
          ],
          tableId: ' public.users '
        },
        {
          entries: [],
          tableId: 'public.empty'
        }
      ]
    })

    expect(schemaMetadata).toEqual({
      columns: [
        {
          columnName: 'email',
          entries: [
            {
              key: 'pii',
              value: 'restricted'
            }
          ],
          tableId: 'public.users'
        }
      ],
      tables: [
        {
          entries: [
            {
              key: 'owner',
              value: 'identity'
            }
          ],
          tableId: 'public.users'
        }
      ]
    })
  })
})
