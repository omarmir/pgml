# PGML domain glossary

## Document and source ownership

| Term | Meaning and owner |
| --- | --- |
| Load intent | `StudioLoadIntent` records a requested browser, file, or Gist replacement and its revision. `beginWorkspaceLoad` supersedes older reads before they finish. |
| Accepted document | The document committed with its persistence target and source kind by `commitWorkspaceLoad`. Failed or cancelled load intent retains this document. |
| Accepted document epoch | `workspaceDocumentRevision` identifies a document replacement, including an equal-byte replacement. Load, import, restore, and reset can change it. Ordinary typing and failed load intent do not. |
| Canonical source | The committed reactive workspace `source`. Autosave serializes this value. |
| Live editor source | The CodeMirror buffer, including edits awaiting commit. An explicit save, download, navigation, or topology change flushes only a buffer still associated with the current input. |
| Editor input association | The committed input bytes and accepted document epoch received by an editor. `getCommittedInput` and `getDocumentContextRevision` expose this association. `flushPendingEditorChanges` compares both before flushing, including same-turn changes before child props update. |
| Analyzed source | The source and request revision carried with diagnostics and model by `usePgmlWorkspaceAnalysis`. Structured edits require a current result. The diagram can retain its last renderable model while analysis catches up. |

## Persistence and drafts

| Term | Meaning and owner |
| --- | --- |
| Persistence target | The selected browser, computer-file, or Gist destination. Browser targets distinguish draft from saved schema. A Gist target includes Gist id and filename. |
| Persisted baseline | `persistedSnapshot`, acknowledged only after a successful write for the captured selection generation. Dirty state compares the observed snapshot with this baseline. |
| Write owner | The captured target, snapshot, mode, and generation of a persistence request. A physically completed stale write cannot acknowledge a newer target. `useStudioPersistenceSession` owns the queue across view remounts. |
| Joined request owners | Private records for adjacent identical queued requests. A passive save chooses a still-eligible owner's writer at execution. Joined owners, callbacks, and Promises stay outside serialized Pinia state. |
| Autosave eligibility | The current source, dirty, loading, permission-policy, and scope conditions that permit a passive write. `useStudioAutosave` checks reactive eligibility at firing. The adapter and queue check again before physical execution. |
| Captured draft | A `useDialogDraft` payload with its required target and context. Its open, saving, closing, closed, and disposed phases control actions. Closing retains content until `afterLeave`; stale completion cannot mutate a replacement draft. |
| Import session | `useSchemaImportSession` owns editing, reading, placement, applying, and format-specific closing phases. Two host controllers serve five home/workspace format adapters. Reading captures scalar options and File identity; placement retains that input for Back or Apply. |
| Workspace chrome lease | `acquireWorkspaceChrome` grants the current host sole publication of header actions and schema status. A replaced host cannot publish or clear a newer host's chrome. The lease token is private. |

## Diagram resources

| Term | Meaning and owner |
| --- | --- |
| Pointer session | `useWindowPointerSession` owns one exact active session, its pointer id, capture, listeners, and pending movement. Successful finish flushes pending movement and calls `onFinish`. Cancel, capture loss, blur, replacement, and disposal discard pending movement. Newer callback-started sessions win. |
| GPU interaction | The scene's `Interaction` variant owns pan, node press/drag, toggle press, or pinch input. The first pointer/native stream owns pinch origin. Tracked touch points remain input data. |
| Layout owner | A document epoch and active diagram view captured by `LayoutContext`. A newly accepted owner waits for its matching model before rebuilding layout. Failed load intent preserves the accepted owner's dirty positions. |
| Connection preview | `ConnectionPreviewState` owns idle, pending, dragging, settled, and settling payloads. Only matching newest routing completion clears settlement. Cancellation discards preview without committing a position. |
| Routing worker lifetime | `useDiagramRoutingWorker` owns idle, running worker plus pending requests, or disposed. Failure releases the worker and settles requests before replacement. Old worker callbacks require exact owner identity. |
| Renderer generation | `SceneLifetime` owns initializing, ready resources, failure, or disposal for one Pixi generation. `SceneResources` contains the complete published resource set. A superseded initializer destroys its candidate instead of publishing. |
| Local renderer cleanup | `rendererDestroyOptions` removes the obsolete view with `{ removeView: true, releaseGlobalResources: false }`. Both `Application.destroy` and partial renderer cleanup use it. Component cleanup releases its resources without clearing Pixi process-global pools used by another renderer. |
| Render frame channel | `fullRenderBatcher`, `transformRenderBatcher`, and `dragPreviewRenderBatcher` each use `createAnimationFrameBatcher`. They keep separate scheduling priorities and cancel when the scene releases. The deferred timer and recursive line loop retain their own handles. |

## SQL index identity

`PgmlIndexKey` distinguishes a literal `column`, an explicit backtick `expression`, and a complete `sql` key. SQL export quotes column names, groups explicit expressions, and retains complete SQL key modifiers. A column named `lower(email)` differs from the expression `lower(email)`. `PgmlIndex.keys` owns semantics. Legacy `columns` values remain literal column identifiers.

The ownership decision is recorded in [Keep workspace state with its operation owner](docs/adr/0001-workspace-state-ownership.md).
