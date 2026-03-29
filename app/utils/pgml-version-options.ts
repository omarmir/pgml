export type PgmlVersionOptionItem = {
  id: string
  label: string
  parentVersionId: string | null
}

export const buildPgmlVersionCompareOptions = (versions: PgmlVersionOptionItem[]) => {
  return [
    {
      label: 'Current workspace',
      value: 'workspace'
    },
    ...versions.map((version) => {
      return {
        label: version.label,
        value: version.id
      }
    })
  ]
}

export const buildPgmlImportBaseVersionItems = (versions: PgmlVersionOptionItem[]) => {
  return versions.map((version) => {
    return {
      description: version.parentVersionId
        ? `Continues from ${version.parentVersionId}`
        : 'Root version',
      label: version.label,
      value: version.id
    }
  })
}
