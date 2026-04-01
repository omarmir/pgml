import { nanoid } from 'nanoid'
import type {
  PgmlAffects,
  PgmlConstraint,
  PgmlDocumentation,
  PgmlIndex,
  PgmlMetadataEntry,
  PgmlRoutine,
  PgmlSequence,
  PgmlTrigger
} from '~/utils/pgml'

export type PgmlDetailMetadataDraftKind = 'constraint'
  | 'function'
  | 'index'
  | 'procedure'
  | 'sequence'
  | 'trigger'

export type PgmlDetailMetadataListItem = {
  id: string
  value: string
}

export type PgmlDetailMetadataKeyValueItem = {
  id: string
  key: string
  value: string
}

export type PgmlDetailMetadataAffectsDraft = {
  calls: PgmlDetailMetadataListItem[]
  dependsOn: PgmlDetailMetadataListItem[]
  extras: PgmlDetailMetadataKeyValueItem[]
  ownedBy: PgmlDetailMetadataListItem[]
  reads: PgmlDetailMetadataListItem[]
  sets: PgmlDetailMetadataListItem[]
  uses: PgmlDetailMetadataListItem[]
  writes: PgmlDetailMetadataListItem[]
}

export type PgmlDetailMetadataKnownDraft = {
  constraintExpression: string
  indexColumns: PgmlDetailMetadataListItem[]
  indexType: string
  language: string
  security: string
  sequenceAs: string
  sequenceCache: string
  sequenceCycle: '' | 'false' | 'true'
  sequenceIncrement: string
  sequenceMax: string
  sequenceMin: string
  sequenceOwnedBy: string
  sequenceStart: string
  triggerArguments: PgmlDetailMetadataListItem[]
  triggerEvents: PgmlDetailMetadataListItem[]
  triggerFunction: string
  triggerLevel: string
  triggerTiming: string
  volatility: string
}

export type PgmlDetailPopoverMetadataDraft = {
  affects: PgmlDetailMetadataAffectsDraft
  customMetadata: PgmlDetailMetadataKeyValueItem[]
  docsEntries: PgmlDetailMetadataKeyValueItem[]
  docsSummary: string
  kind: PgmlDetailMetadataDraftKind
  known: PgmlDetailMetadataKnownDraft
}

const normalizeMetadataKey = (value: string) => value.trim().toLowerCase().replaceAll(/[^\w]+/g, '_')

const getMetadataValue = (metadata: PgmlMetadataEntry[], key: string) => {
  return metadata.find(entry => normalizeMetadataKey(entry.key) === normalizeMetadataKey(key))?.value || ''
}

const parseListValue = (value: string) => {
  const trimmed = value.trim()
  const listMatch = trimmed.match(/^\[(.*)\]$/)

  if (listMatch) {
    return (listMatch[1] || '')
      .split(',')
      .map(entry => entry.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1'))
      .filter(entry => entry.length > 0)
  }

  return trimmed.length > 0 ? [trimmed] : []
}

const createListItems = (values: string[]) => {
  return values
    .map(value => value.trim())
    .filter(value => value.length > 0)
    .map(value => ({
      id: nanoid(),
      value
    }))
}

const createKeyValueItems = (entries: Array<{ key: string, value: string }>) => {
  return entries
    .map((entry) => {
      return {
        id: nanoid(),
        key: entry.key.trim(),
        value: entry.value.trim()
      }
    })
    .filter(entry => entry.key.length > 0 || entry.value.length > 0)
}

const createAffectsDraft = (affects: PgmlAffects | null): PgmlDetailMetadataAffectsDraft => {
  return {
    calls: createListItems(affects?.calls || []),
    dependsOn: createListItems(affects?.dependsOn || []),
    extras: createKeyValueItems(
      (affects?.extras || []).map((entry) => {
        return {
          key: entry.key,
          value: entry.values.join(', ')
        }
      })
    ),
    ownedBy: createListItems(affects?.ownedBy || []),
    reads: createListItems(affects?.reads || []),
    sets: createListItems(affects?.sets || []),
    uses: createListItems(affects?.uses || []),
    writes: createListItems(affects?.writes || [])
  }
}

const createDocsDraft = (docs: PgmlDocumentation | null) => {
  return {
    docsEntries: createKeyValueItems(docs?.entries || []),
    docsSummary: docs?.summary || ''
  }
}

const createKnownDraft = (): PgmlDetailMetadataKnownDraft => {
  return {
    constraintExpression: '',
    indexColumns: [],
    indexType: '',
    language: '',
    security: '',
    sequenceAs: '',
    sequenceCache: '',
    sequenceCycle: '',
    sequenceIncrement: '',
    sequenceMax: '',
    sequenceMin: '',
    sequenceOwnedBy: '',
    sequenceStart: '',
    triggerArguments: [],
    triggerEvents: [],
    triggerFunction: '',
    triggerLevel: '',
    triggerTiming: '',
    volatility: ''
  }
}

const createBaseDraft = (kind: PgmlDetailMetadataDraftKind): PgmlDetailPopoverMetadataDraft => {
  return {
    affects: createAffectsDraft(null),
    customMetadata: [],
    docsEntries: [],
    docsSummary: '',
    kind,
    known: createKnownDraft()
  }
}

const routineKnownMetadataKeys = new Set(['language', 'security', 'volatility'])
const triggerKnownMetadataKeys = new Set(['arguments', 'events', 'function', 'level', 'timing'])
const sequenceKnownMetadataKeys = new Set(['as', 'cache', 'cycle', 'increment', 'max', 'min', 'owned_by', 'start'])

export const clonePgmlDetailPopoverMetadataDraft = (draft: PgmlDetailPopoverMetadataDraft) => {
  const cloneListItems = (entries: PgmlDetailMetadataListItem[]) => {
    return entries.map((entry) => {
      return {
        id: entry.id,
        value: entry.value
      }
    })
  }
  const cloneKeyValueItems = (entries: PgmlDetailMetadataKeyValueItem[]) => {
    return entries.map((entry) => {
      return {
        id: entry.id,
        key: entry.key,
        value: entry.value
      }
    })
  }

  return {
    affects: {
      calls: cloneListItems(draft.affects.calls),
      dependsOn: cloneListItems(draft.affects.dependsOn),
      extras: cloneKeyValueItems(draft.affects.extras),
      ownedBy: cloneListItems(draft.affects.ownedBy),
      reads: cloneListItems(draft.affects.reads),
      sets: cloneListItems(draft.affects.sets),
      uses: cloneListItems(draft.affects.uses),
      writes: cloneListItems(draft.affects.writes)
    },
    customMetadata: cloneKeyValueItems(draft.customMetadata),
    docsEntries: cloneKeyValueItems(draft.docsEntries),
    docsSummary: draft.docsSummary,
    kind: draft.kind,
    known: {
      constraintExpression: draft.known.constraintExpression,
      indexColumns: cloneListItems(draft.known.indexColumns),
      indexType: draft.known.indexType,
      language: draft.known.language,
      security: draft.known.security,
      sequenceAs: draft.known.sequenceAs,
      sequenceCache: draft.known.sequenceCache,
      sequenceCycle: draft.known.sequenceCycle,
      sequenceIncrement: draft.known.sequenceIncrement,
      sequenceMax: draft.known.sequenceMax,
      sequenceMin: draft.known.sequenceMin,
      sequenceOwnedBy: draft.known.sequenceOwnedBy,
      sequenceStart: draft.known.sequenceStart,
      triggerArguments: cloneListItems(draft.known.triggerArguments),
      triggerEvents: cloneListItems(draft.known.triggerEvents),
      triggerFunction: draft.known.triggerFunction,
      triggerLevel: draft.known.triggerLevel,
      triggerTiming: draft.known.triggerTiming,
      volatility: draft.known.volatility
    }
  }
}

export const createPgmlDetailMetadataDraftFromRoutine = (
  kind: 'function' | 'procedure',
  routine: PgmlRoutine
) => {
  const draft = createBaseDraft(kind)
  const docsDraft = createDocsDraft(routine.docs)

  draft.affects = createAffectsDraft(routine.affects)
  draft.docsEntries = docsDraft.docsEntries
  draft.docsSummary = docsDraft.docsSummary
  draft.known.language = getMetadataValue(routine.metadata, 'language')
  draft.known.security = getMetadataValue(routine.metadata, 'security')
  draft.known.volatility = getMetadataValue(routine.metadata, 'volatility')
  draft.customMetadata = createKeyValueItems(
    routine.metadata.filter(entry => !routineKnownMetadataKeys.has(normalizeMetadataKey(entry.key)))
  )

  return draft
}

export const createPgmlDetailMetadataDraftFromTrigger = (trigger: PgmlTrigger) => {
  const draft = createBaseDraft('trigger')
  const docsDraft = createDocsDraft(trigger.docs)

  draft.affects = createAffectsDraft(trigger.affects)
  draft.docsEntries = docsDraft.docsEntries
  draft.docsSummary = docsDraft.docsSummary
  draft.known.triggerArguments = createListItems(parseListValue(getMetadataValue(trigger.metadata, 'arguments')))
  draft.known.triggerEvents = createListItems(parseListValue(getMetadataValue(trigger.metadata, 'events')))
  draft.known.triggerFunction = getMetadataValue(trigger.metadata, 'function')
  draft.known.triggerLevel = getMetadataValue(trigger.metadata, 'level')
  draft.known.triggerTiming = getMetadataValue(trigger.metadata, 'timing')
  draft.customMetadata = createKeyValueItems(
    trigger.metadata.filter(entry => !triggerKnownMetadataKeys.has(normalizeMetadataKey(entry.key)))
  )

  return draft
}

export const createPgmlDetailMetadataDraftFromSequence = (sequence: PgmlSequence) => {
  const draft = createBaseDraft('sequence')
  const docsDraft = createDocsDraft(sequence.docs)

  draft.affects = createAffectsDraft(sequence.affects)
  draft.docsEntries = docsDraft.docsEntries
  draft.docsSummary = docsDraft.docsSummary
  draft.known.sequenceAs = getMetadataValue(sequence.metadata, 'as')
  draft.known.sequenceCache = getMetadataValue(sequence.metadata, 'cache')
  draft.known.sequenceCycle = (getMetadataValue(sequence.metadata, 'cycle') || '') as '' | 'false' | 'true'
  draft.known.sequenceIncrement = getMetadataValue(sequence.metadata, 'increment')
  draft.known.sequenceMax = getMetadataValue(sequence.metadata, 'max')
  draft.known.sequenceMin = getMetadataValue(sequence.metadata, 'min')
  draft.known.sequenceOwnedBy = getMetadataValue(sequence.metadata, 'owned_by')
  draft.known.sequenceStart = getMetadataValue(sequence.metadata, 'start')
  draft.customMetadata = createKeyValueItems(
    sequence.metadata.filter(entry => !sequenceKnownMetadataKeys.has(normalizeMetadataKey(entry.key)))
  )

  return draft
}

export const createPgmlDetailMetadataDraftFromIndex = (index: PgmlIndex) => {
  const draft = createBaseDraft('index')

  draft.known.indexColumns = createListItems(index.columns)
  draft.known.indexType = index.type

  return draft
}

export const createPgmlDetailMetadataDraftFromConstraint = (constraint: PgmlConstraint) => {
  const draft = createBaseDraft('constraint')

  draft.known.constraintExpression = constraint.expression

  return draft
}
