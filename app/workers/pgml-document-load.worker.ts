import {
  preparePgmlDocumentForLoad
} from '../utils/pgml-document'

import type { PgmlDocumentLoadWorkerRequest, PgmlDocumentLoadWorkerResponse } from '../utils/pgml-document-load'

self.onmessage = (event: MessageEvent<PgmlDocumentLoadWorkerRequest>) => {
  try {
    const document = preparePgmlDocumentForLoad({
      documentName: event.data.documentName,
      rawText: event.data.rawText
    })

    self.postMessage({
      kind: 'loaded',
      document,
      revision: event.data.revision
    } satisfies PgmlDocumentLoadWorkerResponse)
  } catch (error) {
    self.postMessage({
      kind: 'failed',
      message: error instanceof Error ? error.message : 'Unable to open that PGML document.',
      revision: event.data.revision
    } satisfies PgmlDocumentLoadWorkerResponse)
  }
}
