# Share 100 triage

**Reconciliation date:** 2026-11-25. **Evidence commit:** [`c2191c3`](https://github.com/bldrs-ai/Share/commit/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b). The [rubric](ux-rubric.md) sets the procedure. This pass inspected source and test definitions.

## Inventory and placement

The roadmap's earlier reconciliation created epic [#2284](https://github.com/bldrs-ai/Share/issues/2284) on 2026-11-23. A follow-up search for `share-100`, `"copy link"` and `"share dialog"` found closed dialog bugs and stories owned by other epics. It found no UX story covering the dialog itself.

| Issue | Placement |
|---|---|
| [#2374](https://github.com/bldrs-ai/Share/issues/2374) | Linked story for the shipped Share dialog, clipboard and QR flow. It records the remaining desktop and mobile acceptance. Cross-linked to #2284; native parent attachment is pending. |
| [#2336](https://github.com/bldrs-ai/Share/issues/2336) | Camera-link coverage stays under `view-120`. |
| [#184](https://github.com/bldrs-ai/Share/issues/184), [#185](https://github.com/bldrs-ai/Share/issues/185) | Closed dialog fixes retained as history. |

## Evidence

- [`ShareDialog.jsx`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/ShareDialog.jsx) gives the link field, Copy Link and QR code the viewer URL. Camera, active cut planes and display have inclusion controls. An element selection travels in its existing permalink term.
- [`ShareControl.jsx`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/ShareControl.jsx) gates local uploads by route. It offers to open a hosted file and shows a sign-in action for signed-out users.
- [`liveViewLink.spec.ts`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/liveViewLink.spec.ts) covers the live display term, recipient reopening and the cut-plane switch on desktop and mobile. [`shareDisplay.spec.ts`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/shareDisplay.spec.ts) covers inclusion and removal of the display term on both. [`shareLocalFile.spec.ts`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/shareLocalFile.spec.ts) covers the local-only gate on both.
- [`ShareableCamera.spec.ts`](https://github.com/bldrs-ai/Share/blob/c2191c3cc3a84d6ddcc870ea0ca3aaa5725e0c6b/src/Components/Share/ShareableCamera.spec.ts) checks the dialog and visible QR on desktop. Its clipboard stub returns success without asserting the copied value. #2336 tracks the camera-specific gap. #2374 tracks checking that the field, clipboard and QR agree and that the copied link reopens on both form factors.

## Milestone hypothesis

Shared links can bring new visitors straight to a displayed model. Measure recipient opens and the share of those visits that display the intended model. The sender's Share dialog event describes the sender's action. Recipient funnel measurement belongs in bizdev under the [UX rubric](ux-rubric.md#where-each-kind-of-work-lives).
