import { onScopeDispose, type ComputedRef, type Ref } from 'vue'
import { useStudioAutosave } from './useStudioAutosave'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { useStudioSessionStore, type ApplyStudioLoadedText, type StudioLoadIntent, type PgmlStudioSchemaDialogMode } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  downloadSchemaText,
  exampleSchemaName,
  formatSavedPgmlSchemaTime,
  normalizeSchemaName,
  orderSavedSchemas,
  type SavedPgmlSchema,
  untitledSchemaName
} from '~/utils/studio-browser-schemas'
import type { BrowserPersistenceTarget } from './useStudioPersistenceSession'

const localStorageSaveErrorMessage = 'Unable to save to local storage.'

type UsePgmlStudioSchemasOptions = {
  applyLoadedSchemaText?: ApplyStudioLoadedText
  autosaveEnabled?: ComputedRef<boolean>
  browserPersistenceEnabled?: ComputedRef<boolean>
  buildSchemaText: (includeLayout: boolean) => string
  canEmbedLayout: ComputedRef<boolean>
  initialSource: string
  restoreLatestOnSetup?: boolean
  source: Ref<string>
}

type PersistSchemaOptions = {
  closeDialog: boolean
  schemaId: string | null
}

export const usePgmlStudioSchemas = ({
  applyLoadedSchemaText,
  autosaveEnabled,
  browserPersistenceEnabled,
  buildSchemaText,
  canEmbedLayout,
  initialSource,
  restoreLatestOnSetup = true,
  source
}: UsePgmlStudioSchemasOptions) => {
  let scopeActive = true
  let activeLoadIntent: StudioLoadIntent | null = null
  onScopeDispose(() => {
    scopeActive = false
    if (activeLoadIntent !== null) studioSessionStore.cancelWorkspaceLoad(activeLoadIntent)
  })
  const isAutosaveEnabled = autosaveEnabled ?? computed(() => true)
  const isBrowserPersistenceEnabled = browserPersistenceEnabled ?? computed(() => true)
  const studioSessionStore = useStudioSessionStore()
  const studioSourcesStore = useStudioSourcesStore()
  const { browserSchemas: savedSchemas } = storeToRefs(studioSourcesStore)
  const { includeLayoutInSchema, loadDialogOpen, schemaDialogMode, schemaDialogOpen, saveSchemaTargetId, schemaDialogName } = storeToRefs(studioSessionStore)
  const session = studioSessionStore.getBrowserPersistence()
  const initializeSession = session.selection.value.kind === 'empty'
  if (initializeSession) {
    session.select({ kind: 'draft', name: source.value.trim().length > 0 ? exampleSchemaName : untitledSchemaName }, null)
  }
  const target = computed(() => session.selection.value.kind === 'selected' ? session.selection.value.target : null)
  const currentSchemaId = computed(() => target.value?.kind === 'saved' ? target.value.id : null)
  const currentSchemaName = computed(() => target.value === null ? untitledSchemaName : target.value.name)
  const currentSchemaUpdatedAt = computed(() => target.value?.kind === 'saved' ? target.value.updatedAt : null)
  const hasSavedSchemaInSession = session.hasSavedInSession
  const isSavingToLocalStorage = session.isSaving
  const lastPersistedSnapshot = session.persistedSnapshot
  const localStorageSaveError = session.error

  const schemaActionTitle = computed(() => schemaDialogMode.value === 'save' ? 'Save schema' : 'Download schema')
  const schemaActionDescription = computed(() => {
    if (schemaDialogMode.value === 'save') {
      return canEmbedLayout.value
        ? 'Save the current PGML to browser local storage. Browser saves always include the current canvas layout so autosave stays aligned with the saved schema.'
        : 'The current PGML has a parse error, so only the raw text can be saved right now.'
    }

    return canEmbedLayout.value
      ? 'Choose whether to embed the current canvas layout into the downloaded PGML text.'
      : 'The current PGML has a parse error, so only the raw text can be saved right now.'
  })
  const saveSchemaTarget = computed(() => {
    return orderedSavedSchemas.value.find(schema => schema.id === saveSchemaTargetId.value) || null
  })
  const saveSchemaActionLabel = computed(() => {
    return saveSchemaTarget.value ? 'Overwrite saved schema' : 'Save to browser'
  })
  const orderedSavedSchemas = computed(() => {
    return orderSavedSchemas(savedSchemas.value)
  })
  const getSnapshot = (name: string, text: string) => {
    return JSON.stringify({
      name,
      text
    })
  }
  const getAutosaveName = () => {
    return normalizeSchemaName(currentSchemaName.value)
  }
  const getPersistedText = () => {
    return buildSchemaText(true)
  }
  const getCurrentSnapshot = () => {
    return getSnapshot(getAutosaveName(), getPersistedText())
  }
  const parseSnapshot = (snapshot: string) => {
    return JSON.parse(snapshot) as {
      name: string
      text: string
    }
  }
  const currentSnapshot = computed(() => {
    return getCurrentSnapshot()
  })
  watch(currentSnapshot, snapshot => session.observe(snapshot), { immediate: true, flush: 'sync' })
  const syncCurrentSnapshot = () => {
    session.select({ kind: 'draft', name: currentSchemaName.value }, currentSnapshot.value)
  }
  const applySchema = (text: string, commitPersistence: () => void, intent: StudioLoadIntent) => {
    activeLoadIntent = intent
    if (applyLoadedSchemaText) return applyLoadedSchemaText({ text, intent, commitPersistence })
    return studioSessionStore.commitWorkspaceLoad(intent, () => {
      source.value = text
      commitPersistence()
    })
  }
  const applyUnsavedSchema = (nextSchema: { name: string, text: string }, intent: StudioLoadIntent) => {
    return applySchema(nextSchema.text, () => {
      session.select({ kind: 'draft', name: nextSchema.name }, getSnapshot(nextSchema.name, nextSchema.text))
      studioSessionStore.updateSchemaDialogDraft({ targetId: null })
    }, intent)
  }
  const hasPendingLocalChanges = computed(() => {
    return lastPersistedSnapshot.value !== currentSnapshot.value
  })
  const isSavedToLocalStorage = computed(() => {
    return currentSchemaId.value !== null && !hasPendingLocalChanges.value
  })

  const loadExample = (intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('browser')) => {
    return applyUnsavedSchema({
      name: exampleSchemaName,
      text: initialSource
    }, intent)
  }

  const clearSchema = (intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('browser')) => {
    return applyUnsavedSchema({
      name: untitledSchemaName,
      text: ''
    }, intent)
  }

  const readSavedSchemas = () => {
    studioSourcesStore.refreshBrowserSchemas()
    session.clearError()
  }

  const persistSavedSchemas = (schemas: SavedPgmlSchema[]) => {
    return studioSourcesStore.persistBrowserSchemas(schemas)
  }
  const upsertSavedSchema = (schema: SavedPgmlSchema, existingSchemaId: string | null) => {
    if (!existingSchemaId) {
      return [schema, ...savedSchemas.value]
    }

    let didReplaceExistingSchema = false
    const nextSavedSchemas = savedSchemas.value.map((entry) => {
      if (entry.id !== existingSchemaId) {
        return entry
      }

      didReplaceExistingSchema = true

      return schema
    })

    return didReplaceExistingSchema ? nextSavedSchemas : [schema, ...nextSavedSchemas]
  }

  const syncPersistedState = (schema: SavedPgmlSchema) => {
    session.select({ kind: 'saved', id: schema.id, name: schema.name, updatedAt: schema.updatedAt }, getSnapshot(schema.name, schema.text))
  }

  const openSchemaDialog = (mode: PgmlStudioSchemaDialogMode) => {
    studioSessionStore.openSchemaDialog(mode, { name: currentSchemaName.value, targetId: mode === 'save' ? currentSchemaId.value : null })
  }

  const selectSaveSchemaTarget = (schema: SavedPgmlSchema) => {
    studioSessionStore.updateSchemaDialogDraft({ targetId: schema.id, name: schema.name })
  }

  const clearSaveSchemaTarget = () => {
    studioSessionStore.updateSchemaDialogDraft({ targetId: null })
  }

  const persistSchemaToBrowser = (
    name: string,
    text: string,
    options: PersistSchemaOptions
  ) => {
    const updatedAt = new Date().toISOString()
    const matchingSchema = savedSchemas.value.find(entry => entry.id === options.schemaId)
    const existingSchemaId = options.schemaId
    const nextSchema: SavedPgmlSchema = matchingSchema
      ? {
          ...matchingSchema,
          name,
          text,
          updatedAt
        }
      : {
          id: existingSchemaId || nanoid(),
          name,
          text,
          updatedAt
        }
    const nextSavedSchemas = upsertSavedSchema(nextSchema, existingSchemaId)

    if (!persistSavedSchemas(nextSavedSchemas)) {
      return null
    }

    savedSchemas.value = nextSavedSchemas
    return nextSchema
  }

  const persistSnapshotToBrowser = async (snapshot: string, options: PersistSchemaOptions) => {
    if (!isBrowserPersistenceEnabled.value) return false
    const dialogRevision = studioSessionStore.schemaDialogRevision
    const { name } = parseSnapshot(snapshot)
    const savedTarget = savedSchemas.value.find(schema => schema.id === options.schemaId)
    const writeTarget: BrowserPersistenceTarget = savedTarget === undefined
      ? { kind: 'draft', name }
      : { kind: 'saved', id: savedTarget.id, name, updatedAt: savedTarget.updatedAt }
    const didSave = await session.save({
      target: writeTarget,
      snapshot,
      mode: options.closeDialog ? 'manual' : 'autosave',
      isAutosaveEligible: () => scopeActive && isAutosaveEnabled.value && isBrowserPersistenceEnabled.value && !studioSessionStore.isWorkspaceLoading,
      onError: () => localStorageSaveErrorMessage,
      write: (_capturedTarget, capturedSnapshot) => {
        if (!isBrowserPersistenceEnabled.value) return { ok: false, message: localStorageSaveErrorMessage }
        const { name, text } = parseSnapshot(capturedSnapshot)
        const nextSchema = persistSchemaToBrowser(name, text, options)
        if (nextSchema === null) return { ok: false, message: localStorageSaveErrorMessage }
        return { ok: true, target: { kind: 'saved', id: nextSchema.id, name: nextSchema.name, updatedAt: nextSchema.updatedAt } }
      }
    })
    if (didSave && options.closeDialog) studioSessionStore.closeSchemaDialog(dialogRevision)
    return didSave
  }
  const persistAutosaveSnapshotsToBrowser = async (snapshot: string) => {
    const generation = session.generation.value
    let nextSnapshot = snapshot

    while (scopeActive && isAutosaveEnabled.value && isBrowserPersistenceEnabled.value && !studioSessionStore.isWorkspaceLoading && generation === session.generation.value && nextSnapshot !== lastPersistedSnapshot.value) {
      const didSave = await persistSnapshotToBrowser(nextSnapshot, {
        closeDialog: false,
        schemaId: currentSchemaId.value
      })

      if (!didSave || nextSnapshot === currentSnapshot.value) {
        return
      }

      nextSnapshot = currentSnapshot.value
    }
  }

  const saveSchemaToBrowser = async () => {
    if (!isBrowserPersistenceEnabled.value) {
      return false
    }

    const isSavingFromDialog = schemaDialogOpen.value && schemaDialogMode.value === 'save'
    const name = isSavingFromDialog && schemaDialogName.value !== null
      ? normalizeSchemaName(schemaDialogName.value)
      : getAutosaveName()

    return persistSnapshotToBrowser(getSnapshot(name, getPersistedText()), {
      closeDialog: true,
      schemaId: isSavingFromDialog ? saveSchemaTargetId.value : currentSchemaId.value
    })
  }

  const downloadSchema = () => {
    const name = normalizeSchemaName(schemaDialogName.value !== null ? schemaDialogName.value : currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)

    downloadSchemaText(name, text)
    studioSessionStore.closeSchemaDialog()
  }

  const loadSavedSchema = (schema: SavedPgmlSchema, intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('browser')) => {
    return applySchema(schema.text, () => {
      syncPersistedState(schema)
      studioSessionStore.closeLoadDialog()
    }, intent)
  }

  const deleteSavedSchema = (schemaId: string) => {
    if (!isBrowserPersistenceEnabled.value) {
      return
    }

    const nextSavedSchemas = savedSchemas.value.filter(entry => entry.id !== schemaId)

    if (!persistSavedSchemas(nextSavedSchemas)) {
      session.fail(localStorageSaveErrorMessage)
      return
    }

    savedSchemas.value = nextSavedSchemas

    if (currentSchemaId.value === schemaId) {
      syncCurrentSnapshot()
    }

    if (saveSchemaTargetId.value === schemaId) {
      studioSessionStore.updateSchemaDialogDraft({ targetId: null })
    }

    session.clearError()
  }

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)

  if (import.meta.client) {
    readSavedSchemas()

    if (initializeSession && restoreLatestOnSetup) {
      const latestSavedSchema = orderSavedSchemas(savedSchemas.value)[0]
      if (latestSavedSchema) {
        void loadSavedSchema(latestSavedSchema)
      } else {
        syncCurrentSnapshot()
      }
    } else if (initializeSession) {
      syncCurrentSnapshot()
    }
  }

  useStudioAutosave({
    snapshot: currentSnapshot,
    eligible: computed(() => import.meta.client && isAutosaveEnabled.value && isBrowserPersistenceEnabled.value && !studioSessionStore.isWorkspaceLoading && hasPendingLocalChanges.value),
    resumeOnSetup: !initializeSession && hasPendingLocalChanges.value,
    save: persistAutosaveSnapshotsToBrowser
  })

  const updateSchemaDialogName = (name: string) => studioSessionStore.updateSchemaDialogDraft({ name })

  return {
    clearSchema,
    clearSaveSchemaTarget,
    currentSchemaId,
    currentSchemaName,
    currentSchemaUpdatedAt,
    deleteSavedSchema,
    downloadSchema,
    formatSavedAt,
    hasPendingLocalChanges,
    hasSavedSchemaInSession,
    includeLayoutInSchema,
    isSavedToLocalStorage,
    isSavingToLocalStorage,
    localStorageSaveError,
    loadDialogOpen,
    loadExample,
    loadSavedSchema,
    openSchemaDialog,
    orderedSavedSchemas,
    saveSchemaActionLabel,
    saveSchemaTarget,
    saveSchemaTargetId,
    saveSchemaToBrowser,
    selectSaveSchemaTarget,
    schemaActionDescription,
    schemaActionTitle,
    updateSchemaDialogName,
    closeSchemaDialog: studioSessionStore.closeSchemaDialog,
    schemaDialogName,
    schemaDialogMode,
    schemaDialogOpen
  }
}
