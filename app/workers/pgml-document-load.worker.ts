import {
  preparePgmlDocumentForLoad,
  type PgmlVersionSetDocument
} from '../utils/pgml-document'

type PgmlDocumentLoadWorkerRequest = {
  documentName: string
  rawText: string
  revision: number
}

type PgmlDocumentLoadWorkerResponse = {
  document: PgmlVersionSetDocument | null
  error: string | null
  revision: number
}

self.onmessage = (event: MessageEvent<PgmlDocumentLoadWorkerRequest>) => {
  try {
    const document = preparePgmlDocumentForLoad({
      documentName: event.data.documentName,
      rawText: event.data.rawText
    })

    self.postMessage({
      document,
      error: null,
      revision: event.data.revision
    } satisfies PgmlDocumentLoadWorkerResponse)
  } catch (error) {
    self.postMessage({
      document: null,
      error: error instanceof Error ? error.message : 'Unable to open that PGML document.',
      revision: event.data.revision
    } satisfies PgmlDocumentLoadWorkerResponse)
  }
}
