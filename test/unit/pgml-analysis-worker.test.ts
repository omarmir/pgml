import { describe, expect, it } from 'vitest'

import { hasBlockingPgmlDiagnostics } from '../../app/utils/pgml-analysis-worker'

describe('pgml analysis worker helpers', () => {
  it('detects blocking diagnostics from worker payloads', () => {
    expect(hasBlockingPgmlDiagnostics([
      {
        code: 'warn',
        from: 0,
        line: 1,
        message: 'warning',
        severity: 'warning',
        to: 1
      },
      {
        code: 'error',
        from: 2,
        line: 2,
        message: 'error',
        severity: 'error',
        to: 3
      }
    ])).toBe(true)
  })

  it('treats warning-only payloads as renderable', () => {
    expect(hasBlockingPgmlDiagnostics([
      {
        code: 'warn',
        from: 0,
        line: 1,
        message: 'warning',
        severity: 'warning',
        to: 1
      }
    ])).toBe(false)
  })
})
