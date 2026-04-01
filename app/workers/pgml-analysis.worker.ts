import { parsePgml } from '../utils/pgml'
import { hasBlockingPgmlDiagnostics, type PgmlAnalysisWorkerRequest, type PgmlAnalysisWorkerResponse } from '../utils/pgml-analysis-worker'
import { analyzePgmlDocument } from '../utils/pgml-language'

self.onmessage = (event: MessageEvent<PgmlAnalysisWorkerRequest>) => {
  const analysis = analyzePgmlDocument(event.data.source)
  const response: PgmlAnalysisWorkerResponse = {
    diagnostics: analysis.diagnostics,
    hasBlockingErrors: hasBlockingPgmlDiagnostics(analysis.diagnostics),
    parsedModel: parsePgml(event.data.source),
    revision: event.data.revision,
    source: event.data.source
  }

  self.postMessage(response)
}
