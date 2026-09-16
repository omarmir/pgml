// Quoted SQL literals may contain brackets that do not close the modifier list.
export const matchPgmlColumnDefinition = (source: string) => {
  return source.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[((?:[^\]'"`]|'(?:[^'\\]|\\.|'')*'|"(?:[^"\\]|\\.|"")*"|`(?:[^`\\]|\\.)*`)+)\])?$/)
}
