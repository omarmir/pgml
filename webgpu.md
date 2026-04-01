# WebGPU R&D Plan with CPU and Editor Unblocking

  ## Summary

  - Build an experimental WebGPU renderer, but do not expect WebGPU alone to fix the current slow paths.
  - Keep exact orthogonal routing on CPU workers. In this codebase the expensive part is route solving and whole-scene recomputation, not just line rasterization.
  - Use WebGPU for higher-fidelity drawing and lower CPU draw overhead: instanced geometry, crisper zoomed rendering, GPU-side culling, and text/overlay improvements.
  - Keep a production fallback path to WebGL because Pixi WebGPU is still experimental and WebGPU browser support is still limited and secure-context only.
  - In parallel, aggressively fix the editor and page pipeline, because issues/conv.pgml already costs about 32 ms for fresh language analysis and about 17.5 ms for parsePgml(...), which is enough to stall
    typing even before rendering.

  ## Backend and Rendering

  - Introduce a renderer backend abstraction so scene state is backend-agnostic and rendering is pluggable.
  - Add rendererBackend: 'auto' | 'webgl' | 'webgpu', defaulting to auto.
  - auto selects WebGPU only when supported and the page is in a secure context; otherwise it falls back to WebGL without changing behavior.
  - Keep the current Pixi/WebGL backend intact as the fallback and baseline.
  - Build a WebGPU backend around GPU-native buffers instead of mostly CPU-rasterized canvas textures:
      - node rectangles, borders, rails, row highlights, compare rings, and badges become batched geometry;
      - line paths become uploaded route-point buffers rendered as batched polylines;
      - text moves to an atlas-based path, with SDF/MSDF text for crisp zooming.
  - Use WebGPU for culling and screen-space LOD, not for exact pathfinding in v1.
  - Keep route solving in the existing worker model, but upload only changed line geometry to GPU buffers after reroute.
  - Dense scene mode stays enabled when totalNodes >= 180, visibleNodes >= 120, or routedLines >= 250.
  - In dense scene mode:
      - use in-motion line simplification during drag;
      - freeze expensive fidelity upgrades during active pan/zoom/drag;
      - render compact table proxies when worldScale < 0.55;
      - restore full detail after 120 ms idle.
  - Remove per-pointer Vue layout churn:
      - keep drag delta inside the scene;
      - preview translated and bridged lines from cached routes;
      - commit final coordinates once on drop;
      - reroute only affected lines whose owner ids changed.
  - Make selection and compare purely visual so they no longer invalidate routed geometry or base node content.

  ## Editor and Data Pipeline

  - Change app/components/pgml/PgmlSourceCodeEditor.vue to keep a local editor buffer and stop emitting the full document on every keystroke.
  - Small documents use a 75 ms commit debounce.
  - Large PGML mode activates at >= 50,000 chars or >= 1,500 lines and uses:
      - 200 ms source commit debounce;
      - explicit-only completions while typing;
      - diagnostics after 500 ms idle;
      - immediate flush on blur, save, or programmatic focus-jump.
  - Move analyzePgmlDocument(...) and parsePgml(...) into a dedicated PGML analysis worker.
  - Tag worker requests with revision ids and drop stale results.
  - Keep the diagram bound to the last committed valid source while typing; do not rebuild the canvas on transient editor-state changes.
  - Gate expensive compare and migration work in app/pages/diagram.vue:
      - only compute compare models, compare entries, and migration bundles when the compare or migrations panel is open, or when the user explicitly exports those artifacts.
  - Lazy-mount hidden heavy panels and detail editors so typing and diagram interaction do not pay for closed UI surfaces.

  ## Interfaces and Types

  - Change the scene contract so moveEnd carries final { id, kind, x, y }, and remove continuous layout commits from moveNode.
  - Add flushPendingChanges() and hasPendingChanges() to the source editor handle.
  - Add backend selection state and capability detection types for auto, webgl, webgpu, and fallback reason reporting.
  - Split connection data into stable route geometry and transient style state.
  - Add PGML analysis-worker request/response types carrying revision, source, analysis, and parsedModel.

  ## Test Plan

  - Keep the current WebGL path fully covered and use it as the correctness baseline.
  - Add backend selection tests for:
      - secure-context unsupported WebGPU fallback;
      - explicit webgl override;
      - explicit webgpu refusal with clear fallback or error behavior.
  - Update the diagram FPS benchmark to use GPU-scene debug state instead of legacy DOM anchors.
  - Add dense fixtures around 150/300 tables with enough routed lines to exercise dense mode.
  - Add a WebGPU local benchmark pass and compare it against the WebGL baseline for:
      - pan/zoom median frame time;
      - drag average FPS;
      - reroute settle time after drop;
      - zoom fidelity and text sharpness.
  - Add an editor benchmark on issues/conv.pgml that verifies:
      - no full parse/analyze on every keystroke in large-doc mode;
      - compare/migration work stays idle while the related panels are closed;
      - typing remains responsive while the diagram updates only after idle commit.
  - Acceptance targets:
      - WebGL fallback meets the existing fluidity targets from the prior plan;
      - WebGPU on supported browsers matches or beats WebGL performance and removes visible texture-resolution popping on zoom;
      - text and line fidelity are visibly sharper at high zoom without increasing interaction jank.

  ## Assumptions

  - This is an experimental WebGPU branch, not a production-only backend replacement.
  - Exact routing remains CPU-side in v1; WebGPU is used for drawing, culling, LOD, and fidelity improvements.
  - Production behavior must remain correct on browsers without WebGPU support.
  - Adaptive degradation is still allowed during active interaction or active typing, but full detail must restore automatically after idle.
  - PGML syntax, saved document format, exports, and version-history semantics remain unchanged.

  ## References

  - PixiJS renderer guide: https://pixijs.com/8.x/guides/components/renderers
  - PixiJS application guide: https://pixijs.com/8.x/guides/components/application
  - MDN WebGPU API overview: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
