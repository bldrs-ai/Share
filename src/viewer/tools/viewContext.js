import useStore from '../../store/useStore'
import {nodeName, nodeType, nodesById, refMaker, walkTree} from './refs'


/**
 * The `view` context source (ai-workspace.md §9, `ContextSource`): ambient
 * per-turn state — what's loaded, its levels, what's selected, what's hidden
 * — so the agent loop and Jev don't spend a tool call to learn it. Short text
 * for the prompt, plus the same as `data`. Counts and names only, capped.
 */


const MAX_LEVELS = 50
const MAX_SELECTION_TYPES = 10
const STOREY_TYPE = 'IFCBUILDINGSTOREY'


/**
 * @param {object} counts type → count
 * @return {string} 'IFCWALL×2, IFCWINDOW×1'
 */
function formatCounts(counts) {
  return Object.entries(counts).map(([type, n]) => `${type}×${n}`).join(', ')
}


/**
 * @return {object} the context block
 */
export function viewSnapshot() {
  const state = useStore.getState()
  const {model, rootElement, viewer} = state
  if (!model || !rootElement) {
    return {id: 'view', text: 'No model is loaded.', data: {loaded: false}}
  }
  const nodes = nodesById(rootElement)
  const refOf = refMaker(viewer)
  const filepath = state.modelPath?.filepath ?? state.modelPath?.gitpath ?? ''
  const name = String(filepath).split('/').filter(Boolean).pop() ?? nodeName(rootElement)
  const format = model.format ?? model.type ?? null
  const levels = []
  let levelCount = 0
  walkTree(rootElement, (node) => {
    if (String(nodeType(node)).toUpperCase() === STOREY_TYPE) {
      levelCount++
      if (levels.length < MAX_LEVELS) {
        levels.push({ref: refOf(Number(node.expressID)), name: nodeName(node)})
      }
    }
  })
  const anchors = (state.selectedAnchorIds ?? []).map(Number).filter(Number.isFinite)
  const selectionTypes = {}
  for (const id of anchors) {
    const type = nodeType(nodes.get(id)) || 'unknown'
    if (type in selectionTypes || Object.keys(selectionTypes).length < MAX_SELECTION_TYPES) {
      selectionTypes[type] = (selectionTypes[type] ?? 0) + 1
    }
  }
  const hiddenCount = Object.values(state.hiddenElements ?? {}).filter(Boolean).length
  const isolating = Boolean(state.isTempIsolationModeOn)
  const isolatedCount = Object.values(state.isolatedElements ?? {}).filter(Boolean).length
  const data = {
    loaded: true,
    model: {name, format},
    // Tree nodes below the root: elements and spatial containers.
    elementCount: Math.max(0, nodes.size - 1),
    levels,
    levelCount,
    selection: {count: anchors.length, types: selectionTypes},
    visibility: {hiddenCount, isolating, isolatedCount},
  }
  const levelText = levelCount === 0 ? 'no levels' :
    `${levelCount} level${levelCount === 1 ? '' : 's'} (${levels.map((l) => l.name || l.ref).join(', ')}` +
      `${levelCount > levels.length ? ', …' : ''})`
  const lines = [
    `Model: ${name}${format ? ` (${format})` : ''}, ${data.elementCount} elements, ${levelText}.`,
    anchors.length === 0 ? 'Selection: none.' :
      `Selection: ${anchors.length} (${formatCounts(selectionTypes)}).`,
    `Hidden: ${hiddenCount}. Isolation: ${isolating ? `on (${isolatedCount})` : 'off'}.`,
  ]
  return {id: 'view', text: lines.join('\n'), data}
}


/**
 * @return {object} the `view` ContextSource
 */
export function createViewContextSource() {
  return {id: 'view', snapshot: viewSnapshot}
}
