import { describe, expect, it } from 'vitest'

import { buildDiagramConnectionPreviewLayers } from '../../app/utils/diagram-connection-preview'

describe('diagram connection preview utilities', () => {
  it('keeps every connection static when no drag preview is active', () => {
    const lines = [
      {
        key: 'ref:public.orders:customer_id:public.users:id',
        zIndex: 1001,
        fromOwnerNodeId: 'group:Core',
        toOwnerNodeId: 'group:CRM'
      },
      {
        key: 'ref:public.users:tenant_id:public.tenants:id',
        zIndex: 1001,
        fromOwnerNodeId: 'group:CRM',
        toOwnerNodeId: 'group:CRM'
      }
    ]

    expect(buildDiagramConnectionPreviewLayers(lines, null)).toEqual([
      {
        zIndex: 1001,
        staticLines: lines,
        bridgedLines: [],
        translatedLines: []
      }
    ])
  })

  it('translates fully owned lines while isolating partially attached lines for bridge previews', () => {
    const internalLine = {
      key: 'ref:public.users:tenant_id:public.tenants:id',
      zIndex: 1001,
      fromOwnerNodeId: 'group:CRM',
      toOwnerNodeId: 'group:CRM'
    }
    const crossGroupLine = {
      key: 'ref:public.orders:customer_id:public.users:id',
      zIndex: 1001,
      fromOwnerNodeId: 'group:CRM',
      toOwnerNodeId: 'group:Sales'
    }
    const unaffectedLine = {
      key: 'custom-type:Domain:email_address->public.users:email',
      zIndex: 2147483646,
      fromOwnerNodeId: 'custom-type:Domain:email_address',
      toOwnerNodeId: 'group:Sales'
    }

    expect(buildDiagramConnectionPreviewLayers(
      [internalLine, crossGroupLine, unaffectedLine],
      {
        nodeId: 'group:CRM',
        deltaX: 54,
        deltaY: 36
      }
    )).toEqual([
      {
        zIndex: 1001,
        staticLines: [],
        bridgedLines: [crossGroupLine],
        translatedLines: [internalLine]
      },
      {
        zIndex: 2147483646,
        staticLines: [unaffectedLine],
        bridgedLines: [],
        translatedLines: []
      }
    ])
  })

  it('treats a zero-distance drag as an inactive preview state', () => {
    const lines = [
      {
        key: 'ref:public.orders:customer_id:public.users:id',
        zIndex: 1001,
        fromOwnerNodeId: 'group:Core',
        toOwnerNodeId: 'group:CRM'
      }
    ]

    expect(buildDiagramConnectionPreviewLayers(lines, {
      nodeId: 'group:Core',
      deltaX: 0,
      deltaY: 0
    })).toEqual([
      {
        zIndex: 1001,
        staticLines: lines,
        bridgedLines: [],
        translatedLines: []
      }
    ])
  })
})
