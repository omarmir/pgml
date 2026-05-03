import { $fetch } from 'ofetch'
import { nanoid } from 'nanoid'
import { readBrowserStorageItem, removeBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'
import { slugifySchemaName, untitledSchemaName } from './studio-browser-schemas'

type GitHubGistApiFile = {
  content?: string
  filename?: string
  raw_url?: string
  truncated?: boolean
  type?: string
}

type GitHubGistApiResponse = {
  files?: Record<string, GitHubGistApiFile | null>
  id?: string
  updated_at?: string
}

export type PgmlGistConnectionMetadata = {
  accountLabel: string
  gistId: string
  lastConnectedAt: string
  selectedFilename: string | null
}

export type PgmlGistFile = {
  filename: string
  gistId: string
  size: number
  updatedAt: string
}

export type LoadedPgmlGistFile = PgmlGistFile & {
  text: string
}

type GithubGistRequestOptions = {
  gistId: string
  token: string
}

export const githubGistConnectionStorageKey = 'pgml-github-gist-connection-v1'
export const githubFineGrainedTokenUrl = 'https://github.com/settings/personal-access-tokens/new?name=PGML+Gists&description=PGML+client-side+Gist+storage&expires_in=90&gists=write'

const githubApiBaseUrl = 'https://api.github.com'
const githubApiVersion = '2022-11-28'

const getGithubHeaders = (token: string) => {
  return {
    'accept': 'application/vnd.github+json',
    'authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': githubApiVersion
  }
}

const normalizeGistId = (value: string) => {
  return value.trim()
}

const isPgmlFilename = (value: string) => {
  return value.toLowerCase().endsWith('.pgml')
}

const pgmlDocumentStartPattern = /^(VersionSet|Table|TableGroup|Enum|Ref|Function|Procedure|Trigger|Sequence|Extension|SchemaMetadata)\b/

const isPgmlContent = (value: string) => {
  return pgmlDocumentStartPattern.test(value.trimStart())
}

const isPgmlGistApiFile = (file: GitHubGistApiFile | null | undefined): file is GitHubGistApiFile => {
  if (!file?.filename) {
    return false
  }

  if (isPgmlFilename(file.filename)) {
    return true
  }

  return typeof file.content === 'string' && isPgmlContent(file.content)
}

const isPgmlGistConnectionMetadata = (value: unknown): value is PgmlGistConnectionMetadata => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PgmlGistConnectionMetadata>

  return (
    typeof candidate.accountLabel === 'string'
    && typeof candidate.gistId === 'string'
    && typeof candidate.lastConnectedAt === 'string'
    && (
      candidate.selectedFilename === null
      || typeof candidate.selectedFilename === 'string'
    )
  )
}

const readGistApiResponse = async (options: GithubGistRequestOptions) => {
  const gistId = normalizeGistId(options.gistId)

  if (gistId.length === 0) {
    throw new Error('Enter a GitHub Gist ID.')
  }

  if (options.token.trim().length === 0) {
    throw new Error('Enter a GitHub token.')
  }

  return await $fetch<GitHubGistApiResponse>(`${githubApiBaseUrl}/gists/${encodeURIComponent(gistId)}`, {
    headers: getGithubHeaders(options.token),
    method: 'GET'
  })
}

const loadGistRawFileContent = async (
  file: GitHubGistApiFile,
  token: string
) => {
  if (!file.raw_url) {
    throw new Error('That PGML file is too large to load from the Gist API response.')
  }

  try {
    const response = await fetch(file.raw_url, {
      headers: getGithubHeaders(token)
    })

    if (!response.ok) {
      throw new Error(String(response.status))
    }

    return await response.text()
  } catch (error) {
    const status = error instanceof Error && /^\d+$/.test(error.message) ? ` (${error.message})` : ''

    throw new Error(`Unable to load the full Gist file content${status}.`)
  }
}

export const readPgmlGistConnectionMetadata = () => {
  const rawValue = readBrowserStorageItem(githubGistConnectionStorageKey)

  if (!rawValue) {
    return null
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown

    if (!isPgmlGistConnectionMetadata(parsedValue)) {
      return null
    }

    const gistId = normalizeGistId(parsedValue.gistId)

    return {
      ...parsedValue,
      accountLabel: gistId,
      gistId
    }
  } catch {
    return null
  }
}

export const persistPgmlGistConnectionMetadata = (metadata: PgmlGistConnectionMetadata | null) => {
  if (metadata === null) {
    return removeBrowserStorageItem(githubGistConnectionStorageKey)
  }

  return writeBrowserStorageItem(githubGistConnectionStorageKey, JSON.stringify(metadata))
}

export const createPgmlGistConnectionMetadata = (input: {
  gistId: string
  selectedFilename?: string | null
}) => {
  const gistId = normalizeGistId(input.gistId)

  return {
    accountLabel: gistId,
    gistId,
    lastConnectedAt: new Date().toISOString(),
    selectedFilename: input.selectedFilename || null
  } satisfies PgmlGistConnectionMetadata
}

export const listPgmlGistFilesFromResponse = (gist: GitHubGistApiResponse, gistId: string) => {
  const updatedAt = gist.updated_at || new Date().toISOString()

  return Object.values(gist.files || {})
    .filter(isPgmlGistApiFile)
    .map((file) => {
      return {
        filename: file.filename || untitledSchemaName,
        gistId,
        size: typeof file.content === 'string' ? file.content.length : 0,
        updatedAt
      } satisfies PgmlGistFile
    })
    .sort((left, right) => left.filename.localeCompare(right.filename))
}

export const loadPgmlGistFiles = async (options: GithubGistRequestOptions) => {
  const gist = await readGistApiResponse(options)
  const gistId = gist.id || normalizeGistId(options.gistId)

  return listPgmlGistFilesFromResponse(gist, gistId)
}

export const loadPgmlGistFile = async (options: GithubGistRequestOptions & {
  filename: string
}) => {
  const gist = await readGistApiResponse(options)
  const file = gist.files?.[options.filename] || null
  const gistId = gist.id || normalizeGistId(options.gistId)

  if (!isPgmlGistApiFile(file)) {
    throw new Error('That PGML file was not found in the connected Gist.')
  }

  const content = file.truncated
    ? await loadGistRawFileContent(file, options.token)
    : file.content

  if (typeof content !== 'string') {
    throw new Error('That PGML file did not include readable content.')
  }

  const filename = file.filename || options.filename

  return {
    filename,
    gistId,
    size: content.length,
    text: content,
    updatedAt: gist.updated_at || new Date().toISOString()
  } satisfies LoadedPgmlGistFile
}

export const savePgmlGistFile = async (options: GithubGistRequestOptions & {
  filename: string
  text: string
}) => {
  const gist = await $fetch<GitHubGistApiResponse>(`${githubApiBaseUrl}/gists/${encodeURIComponent(normalizeGistId(options.gistId))}`, {
    body: {
      files: {
        [options.filename]: {
          content: options.text
        }
      }
    },
    headers: getGithubHeaders(options.token),
    method: 'PATCH'
  })
  const updatedFile = gist.files?.[options.filename] || null

  return {
    filename: updatedFile?.filename || options.filename,
    gistId: gist.id || normalizeGistId(options.gistId),
    size: options.text.length,
    updatedAt: gist.updated_at || new Date().toISOString()
  } satisfies PgmlGistFile
}

export const buildUniquePgmlGistFilename = (input: {
  existingFilenames: string[]
  name: string
}) => {
  const baseName = slugifySchemaName(input.name)
  const existingNames = new Set(input.existingFilenames.map(filename => filename.toLowerCase()))
  const initialFilename = `${baseName}.pgml`

  if (!existingNames.has(initialFilename.toLowerCase())) {
    return initialFilename
  }

  for (let index = 2; index < 100; index += 1) {
    const filename = `${baseName}-${index}.pgml`

    if (!existingNames.has(filename.toLowerCase())) {
      return filename
    }
  }

  return `${baseName}-${nanoid(8)}.pgml`
}
