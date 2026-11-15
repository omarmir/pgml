# Keep workspace state with its operation owner

Status: implemented. Recorded after Fix 99 focused and independent proof. Final integrated verification remains pending.

## Context

Loads, analysis, saves, modal edits, gestures, and renderer initialization can outlive the host or selection that started them. Earlier loose flags allowed stale completions to corrupt another target, editor buffer, or resource owner. Diagram and analysis now share one canonical workspace module; the unreachable duplicate was deleted.

## Decision

`studio-session` separates latest load intent from accepted document epoch. `usePgmlDocumentLoader` owns one-shot preparation and accepts only the current intent. Commit changes document, persistence target, and source kind together. Failed intent retains the accepted document. `usePgmlWorkspaceAnalysis` separately owns reusable source/revision results and worker disposal.

Canonical reactive source owns autosave serialization. The live editor retains buffered input. Every explicit flush compares the editor's received committed bytes and accepted epoch with the current input before reading that buffer. Structured edits also require current analysis and recheck captured context after an await. Equal-byte document replacement still changes ownership.

App-scoped `useStudioPersistenceSession` controllers serve browser, computer-file, and Gist adapters. Each owns selection generation, persisted baseline, and serial physical writes across remounts. Only adjacent identical requests join. A queued passive request chooses a still-eligible joined owner's complete writer context. `useStudioAutosave` shares browser/file scheduling; source policy and interactive permission behavior remain in the adapters. Private callbacks and Promises are not serialized.

`useDialogDraft` owns captured modal payloads through save and exit. `useSchemaImportSession` shares reading, placement, applying, and format-specific closing for five real format adapters. These modules reject stale request completion; domain validation stays with each caller. `acquireWorkspaceChrome` gives only the current host permission to publish or clear shared header actions and schema status.

`useWindowPointerSession` owns pointer identity, capture, listeners, and frame work for resize and DOM drag. Successful finish and cancellation are separate transitions. Exact session identity and newer-start arbitration prevent callback reentry from leaking listeners. The GPU scene keeps its distinct multi-input `Interaction` local.

`useDiagramRoutingWorker` owns transport failure, pending settlement, replacement, and disposal. The shell's `ConnectionPreviewState` separately owns pending movement and routing settlement, with `LayoutContext` associating positions with accepted document/view. The Pixi scene's `SceneLifetime` publishes one complete `SceneResources` for a current generation. Separate frame batchers, timer, and line-loop handles release with that generation. Both Application and partial renderer cleanup use `rendererDestroyOptions` with `removeView: true` and `releaseGlobalResources: false`. A stale component must not release Pixi process-global pools used by a current renderer.

`PgmlIndex.keys` retains column, explicit expression, or complete SQL identity through import, edit, comparison, migration, and export. Export does not infer key kind from spelling or table membership. Raw sequence source remains intact; modeled dependency ordering belongs to the exporter.

## Consequences

The module interface is the test surface for supersession, same-turn replacement, disposal, remount, queued writes, cancellation, and draft exit. Native browser checks prove gestures and visible workflows. Generated index and sequence SQL also has actual PostgreSQL execution evidence.

Each shared module has real consumers. One-shot document loading and reusable analysis keep different interfaces, as do latest reads, ordered writes, import stages, and modal exit retention. Pure geometry, independent preferences, and already explicit selections retain their existing representation. No generic state-machine engine or dependency was introduced.

## Source references

- [Session ownership](../../app/stores/studio-session.ts) and [current chrome lease](../../app/stores/studio-shell.ts)
- [Document preparation](../../app/composables/usePgmlDocumentLoader.ts) and [analysis](../../app/composables/usePgmlWorkspaceAnalysis.ts)
- [Persistence session](../../app/composables/useStudioPersistenceSession.ts) and [autosave](../../app/composables/useStudioAutosave.ts)
- [Dialog draft](../../app/composables/useDialogDraft.ts) and [import session](../../app/composables/useSchemaImportSession.ts)
- [Pointer session](../../app/composables/useWindowPointerSession.ts) and [routing transport](../../app/composables/useDiagramRoutingWorker.ts)
- [Workspace flush admission](../../app/components/studio/StudioWorkspacePage.vue) and [scene lifetime](../../app/components/pgml/PgmlDiagramGpuScene.vue)
- [Frame batcher](../../app/utils/animation-frame.ts), [index key identity](../../app/utils/pgml-index-keys.ts), and [domain glossary](../../GLOSSARY.md)
