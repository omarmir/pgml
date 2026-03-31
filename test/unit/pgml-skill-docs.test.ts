import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) => {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('PGML skill docs', () => {
  it('documents versioned views, import behavior, and history-aware migration workflow', () => {
    const readme = readRepoFile('README.md')
    const specPage = readRepoFile('app/pages/spec.vue')
    const skill = readRepoFile('skills/pgml/SKILL.md')
    const syntaxReference = readRepoFile('skills/pgml/references/pgml-syntax.md')
    const migrationReference = readRepoFile('skills/pgml/references/pgml-diff-and-migrations.md')

    expect(readme).toContain('View "Review"')
    expect(readme).toContain('active_view')
    expect(readme).toContain('show_execs')
    expect(readme).toContain('blocking loading state')
    expect(readme).toContain('autocomplete active while typing')
    expect(specPage).toContain('View "Schema focus"')
    expect(specPage).toContain('show_execs: false')
    expect(specPage).toContain('show_fields: false')
    expect(skill).toContain('VersionSet')
    expect(skill).toContain('SchemaMetadata')
    expect(skill).toContain('Workspace')
    expect(skill).toContain('Version')
    expect(skill).toContain('Snapshot')
    expect(skill).toContain('View')
    expect(skill).toContain('active_view')
    expect(skill).toContain('SQL or Kysely')
    expect(skill).toContain('001-')
    expect(syntaxReference).toContain('Versioned Document Root')
    expect(syntaxReference).toContain('SchemaMetadata')
    expect(syntaxReference).toContain('Diagram Views')
    expect(syntaxReference).toContain('show_execs')
    expect(migrationReference).toContain('one file per version transition')
    expect(migrationReference).toContain('active_view')
    expect(migrationReference).toContain('001-')
  })
})
