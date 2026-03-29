export type PgmlVersionOptionItem = {
  id: string
  label: string
  parentVersionLabel?: string | null
  parentVersionId: string | null
}

export const buildPgmlWorkspaceCompareOption = () => {
  return {
    label: 'Current workspace',
    value: 'workspace'
  }
}

export const buildPgmlImportBaseVersionDescription = (input: {
  parentVersionId: string | null
  parentVersionLabel?: string | null
}) => {
  if (!input.parentVersionId) {
    return 'Root version'
  }

  return `Continues from ${input.parentVersionLabel || input.parentVersionId}`
}

export const buildPgmlVersionCompareOptions = (versions: PgmlVersionOptionItem[]) => {
  return [
    buildPgmlWorkspaceCompareOption(),
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
      description: buildPgmlImportBaseVersionDescription({
        parentVersionId: version.parentVersionId,
        parentVersionLabel: version.parentVersionLabel
      }),
      label: version.label,
      value: version.id
    }
  })
}
