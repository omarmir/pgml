import type { PgmlSchemaModel } from './pgml'
import type { PgmlLanguageDiagnostic } from './pgml-language'

export type PgmlAnalysisWorkerRequest = {
  revision: number
  source: string
}

export type PgmlAnalysisWorkerResponse = {
  diagnostics: PgmlLanguageDiagnostic[]
  hasBlockingErrors: boolean
  parsedModel: PgmlSchemaModel
  revision: number
  source: string
}

export const hasBlockingPgmlDiagnostics = (diagnostics: PgmlLanguageDiagnostic[]) => {
  return diagnostics.some(diagnostic => diagnostic.severity === 'error')
}
