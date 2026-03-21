import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'

const projectRoot = resolve(process.cwd())

const getSourceFilePath = (relativePath: string) => {
  const sourceFilePath = resolve(projectRoot, relativePath)
  const relativeSourcePath = relative(projectRoot, sourceFilePath)

  if (relativeSourcePath.startsWith('..') || isAbsolute(relativeSourcePath)) {
    throw new Error(`Source test path must stay within the project root: ${relativePath}`)
  }

  return sourceFilePath
}

export const readSourceFile = (relativePath: string) => {
  const sourceFilePath = getSourceFilePath(relativePath)

  try {
    return readFileSync(sourceFilePath, 'utf8')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    throw new Error(`Unable to read source file "${relativePath}" at "${sourceFilePath}": ${message}`)
  }
}

export const sourceFileExists = (relativePath: string) => {
  return existsSync(getSourceFilePath(relativePath))
}
