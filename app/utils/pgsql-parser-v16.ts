// @ts-expect-error Internal wasm loader path is resolved by Vite but has no published typings.
import PgQueryModule from '../../node_modules/@pgsql/parser/wasm/v16/libpg-query.js'
import wasmUrl from '../../node_modules/@pgsql/parser/wasm/v16/libpg-query.wasm?url'

import { createPgsqlParserAdapter } from './pgsql-parser-adapter'

const wasmBinaryLocation = import.meta.client
  ? wasmUrl
  : new URL('../../node_modules/@pgsql/parser/wasm/v16/libpg-query.wasm', import.meta.url).href

export default createPgsqlParserAdapter({
  loadWasm: () => PgQueryModule({
    locateFile: (path: string) => {
      return path === 'libpg-query.wasm' ? wasmBinaryLocation : path
    }
  })
})
