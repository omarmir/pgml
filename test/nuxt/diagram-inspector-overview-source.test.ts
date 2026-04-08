import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram inspector overview source', () => {
  it('keeps the empty inspector overview as a plain section instead of wrapping it in an extra card', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(shellFile).toContain('data-inspector-overview="true"')
    expect(shellFile).toContain('class="grid gap-3 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]"')
    expect(shellFile).not.toContain('data-inspector-overview="true"\n          class="grid gap-3 rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]"')
  })
})
