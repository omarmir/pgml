import type { PgmlLanguageDiagnostic } from './pgml-language'

export type PgmlDiagnosticGroup = {
  diagnostics: PgmlLanguageDiagnostic[]
  key: string
  lineEntries: Array<{
    diagnostic: PgmlLanguageDiagnostic
    line: number
  }>
  message: string
  severity: PgmlLanguageDiagnostic['severity']
}

export const groupPgmlDiagnostics = (diagnostics: PgmlLanguageDiagnostic[]) => {
  const groups: PgmlDiagnosticGroup[] = []
  const groupsByKey = new Map<string, PgmlDiagnosticGroup>()

  diagnostics.forEach((diagnostic) => {
    const key = `${diagnostic.severity}:${diagnostic.code}:${diagnostic.message}`
    const lineNumbers = diagnostic.lines && diagnostic.lines.length > 0
      ? diagnostic.lines
      : [diagnostic.line]
    let group = groupsByKey.get(key)

    if (!group) {
      group = {
        diagnostics: [],
        key,
        lineEntries: [],
        message: diagnostic.message,
        severity: diagnostic.severity
      }
      groupsByKey.set(key, group)
      groups.push(group)
    }

    group.diagnostics.push(diagnostic)

    lineNumbers.forEach((lineNumber) => {
      if (!group?.lineEntries.some(entry => entry.line === lineNumber)) {
        group?.lineEntries.push({
          diagnostic,
          line: lineNumber
        })
      }
    })
  })

  groups.forEach((group) => {
    group.lineEntries.sort((left, right) => left.line - right.line)
  })

  return groups
}
