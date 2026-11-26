# Progressive delivery of a shared model revision

[SHARE-200 UX](https://github.com/bldrs-ai/Share/issues/2144) · [SHARE-T200 implementation](https://github.com/bldrs-ai/Share/issues/2376)

A Share link identifies an exact model revision and its audience. A published revision is usable as soon as the recipient can open it and see its actual state. The effective model is the default payload. The exact original file is an independent, opt-in payload.

Phase C covers the exact-version resolver and audience checks under the existing [link contract](../../new/model-versioning.md#5a-share-link-contract-binding-ux-requirement). Progressive delivery follows post-MVP. Later semantic versions reuse the authoritative source and operation model from [create-300](https://github.com/bldrs-ai/Share/issues/1914); the immutable original and a materialized view of edits retain distinct provenance.

## Effective model delivery

1. After the sender confirms publication, reserve an exact revision and establish its access scope and durable link mapping. Expose the link as soon as an authorized client can open that revision and see its actual state. Keep the revision pinned as batches arrive and newer revisions are published.
2. Reuse Conway's production progressive geometry pipeline and Share's batched GLB/cache work. Prototype independently loadable GLB chunks with a small revision manifest or equivalent index that advertises committed batches. Publish early geometry as it becomes interactive locally. Carry stable revision-scoped element IDs through mesh picking, the ID/type index, nav tree, properties and note anchors. Reuse the existing GLB extensions where they fit. Measure encoding and publication overhead before fixing chunk boundaries or transport.
3. Publish metadata independently of geometry. Expose the ID/type index as soon as it is ready, with explicit completeness. Publish the spatial tree, properties and source format/version as they become available. Provide a headless read path so an agent or CI job can start a scoped query without downloading meshes. Report partial results and coverage so an empty result is definitive only when the relevant index or scope is complete. Published notes remain separately permissioned and can load independently.
4. Record source provenance for the revision and publish the exact original IFC/STEP bytes only when the sender explicitly includes them. Backfill in the background while the model remains usable. Give the source its own availability and failure state and protect early model delivery from competition for bandwidth. If added later, authorize the addition and keep the same revision binding. Preserve the distinction between an original and an export of the effective revision.
5. Advertise a payload only after it can be fetched and checked against the revision. Make publish and retry idempotent, preserve completed work and old links, and surface interrupted publication separately from normal incremental loading. Enforce the declared audience on manifests, geometry, metadata, source and notes. Keep private drafts out.

## PSB prototype and acceptance

**Production baseline from the team:** `PSB.ifc` (900 MB, `test-models-private`) is interactive locally within seconds as geometry streams. Full parse takes about 10 seconds and includes the initial index of all elements by ID and type. Remote timings are still to be measured.

- Start a cold PSB load and publish during loading. Open in a second browser and measure click-to-usable-link, remote open-to-first-interactive-mesh, and local batch interactive-to-remote batch interactive. Verify that a remote pick returns the same element ID. Aim for useful remote interaction within seconds and record network conditions and time origin.
- In parallel, run an authenticated or link-authorized headless read as appropriate. Record local index ready-to-remote index queryable and remote open-to-first-useful-query. Validate an exhaustive type query against the completed local index. Measure bytes read before the first useful result.
- Run with original omitted, included and still pending, and interrupted. Verify that the model and its analysis tools stay usable when original-file delivery is unavailable. Check that a new revision leaves the earlier link pinned.
- Confirm the share's actual scope against #2212, including notes and original-file access. Exercise publisher interruption, resume/retry, and unavailable or corrupted batches. Measure where serialization, upload, delivery, and remote decode account for latency.

The checklist and measurements live in the [implementation issues](README.md#work-items). The PSB baseline above is a production observation from the team. Remote timings have not been measured.

## Earlier versioning proposal

The [earlier design](../../new/model-versioning.md) keeps the original Git, source hosting and semantic versioning discussion. The source-first publication sequence is historical. §5a remains the link contract for Phase C.
