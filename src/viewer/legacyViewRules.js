// The legacy `?view=` rule sets ShareViewer's IfcViewsManager knows, shared
// with the engine worker's "not available here" check (engine/engineIfcLoad.js
// #hasLegacyViewRules) so the two cannot disagree about which names exist.
// The whole stack is deleted before ?feature=engineWorker defaults on
// (engine-worker.md §8 item 7, viewer-replacement.md §8.1).
export const viewRules = {
  'default': [],
  'ch.sia380-1.heatmap': ['Rule1', 'Rule2'],
}
