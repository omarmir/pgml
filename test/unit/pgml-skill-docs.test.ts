import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readRepoFile = (relativePath: string) => {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

describe('PGML skill docs', () => {
  it('documents the versioned PGML grammar and history-aware migration workflow', () => {
    const skill = readRepoFile('skills/pgml/SKILL.md')
    const syntaxReference = readRepoFile('skills/pgml/references/pgml-syntax.md')
    const migrationReference = readRepoFile('skills/pgml/references/pgml-diff-and-migrations.md')

    expect(skill).toContain('VersionSet')
    expect(skill).toContain('SchemaMetadata')
    expect(skill).toContain('Workspace')
    expect(skill).toContain('Version')
    expect(skill).toContain('Snapshot')
    expect(skill).toContain('SQL or Kysely')
    expect(skill).toContain('001-')
    expect(syntaxReference).toContain('Versioned Document Root')
    expect(syntaxReference).toContain('SchemaMetadata')
    expect(migrationReference).toContain('one file per version transition')
    expect(migrationReference).toContain('001-')
  })
})
