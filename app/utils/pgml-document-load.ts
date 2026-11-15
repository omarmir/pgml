import type { PgmlVersionSetDocument } from './pgml-document'

export type PgmlDocumentLoadWorkerRequest = { documentName: string, rawText: string, revision: number }
export type PgmlDocumentLoadWorkerResponse = { kind: 'loaded', document: PgmlVersionSetDocument, revision: number }
  | { kind: 'failed', message: string, revision: number }
