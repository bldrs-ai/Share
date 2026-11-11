/**
 * In-page code for the source-mode bench. Every function here is shipped
 * into the page as source (`addInitScript` / `page.evaluate`), so each must
 * be self-contained: no reference to anything outside its own body.
 *
 * It complements, not replaces, `src/tests/e2e/loadProbe.ts#probeSource`
 * (first mesh, stage transitions, ready), which `run.mjs` installs first.
 */


/**
 * Installed at document start, next to loadProbe's probe. Records on
 * `window.__bldrsBench`:
 * - `indexAtMs` / `treeAtMs`: when the store's `indexedModel`, then its
 *   `rootElement` (the model tree), first became non-null. A cache hit has
 *   no `indexedModel`; its tree time is still recorded.
 * - `previewAtIndex` / `previewAtTree` / `previewMax`, `firstPreviewMs`:
 *   meshes in the load-preview group (`ProgressiveLoadSession#previewGroup`,
 *   named `bldrsLoadPreview`) at those moments. These are preview MESHES
 *   in the scene, the user-visible count, not conway's preview units (one
 *   unit can emit several meshes); Share#2092's 2,165-vs-640 were units,
 *   from scratch counters this harness does not have.
 * - `longTasks`: every main-thread long task, `[startMs, durationMs]`.
 */
export function benchExtrasSource() {
  const bench = {
    indexAtMs: null,
    treeAtMs: null,
    previewAtIndex: null,
    previewAtTree: null,
    previewMax: 0,
    firstPreviewMs: null,
    longTasks: [],
  }
  window.__bldrsBench = bench
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        bench.longTasks.push([e.startTime, e.duration])
      }
    }).observe({type: 'longtask', buffered: true})
  } catch (e) {
    bench.longTaskError = String(e)
  }
  let group = null
  const previewCount = () => {
    if (group === null || group.parent === null) {
      const scene = window.store?.getState?.().viewer?.context?.getScene?.()
      group = scene?.getObjectByName?.('bldrsLoadPreview') ?? null
    }
    return group === null ? 0 : group.children.length
  }
  const onState = (s) => {
    if (bench.indexAtMs === null && s.indexedModel) {
      bench.indexAtMs = performance.now()
      bench.previewAtIndex = previewCount()
    }
    if (bench.treeAtMs === null && s.rootElement) {
      bench.treeAtMs = performance.now()
      bench.previewAtTree = previewCount()
    }
  }
  const attach = setInterval(() => {
    const store = window.store
    if (store && typeof store.subscribe === 'function') {
      clearInterval(attach)
      store.subscribe(onState)
      onState(store.getState())
    }
  }, 10)
  const tick = () => {
    const n = previewCount()
    if (n > bench.previewMax) {
      bench.previewMax = n
    }
    if (n > 0 && bench.firstPreviewMs === null) {
      bench.firstPreviewMs = performance.now()
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}


/**
 * Stop the viewer painting (utils.ts#pauseViewerRendering's seam) once the
 * load is measured, so the idle-scheduled GLB writer and the source spill
 * that follows it run as they would on a page nobody is orbiting. Under
 * SwiftShader a painting page may never go idle (engineSidecar.spec.ts).
 *
 * @return {boolean} whether the seam was found
 */
export function pauseRenderSource() {
  const context = window.store?.getState?.().viewer?.context
  if (typeof context?.setRenderUpdate !== 'function') {
    return false
  }
  context.setRenderUpdate(() => undefined)
  return true
}


/**
 * A signature of the loaded model to compare a reopen against its cold
 * load (Share#2139: the prototype's sidecar reopen is unverified): the
 * tree's node count and a hash over every node's id, name and child count
 * in DFS order, and one property read of a deterministic leaf (the middle
 * leaf with a numeric `expressID`), hashed, with its time.
 *
 * @param {number} timeoutMs bound on the property read
 * @return {Promise<object>}
 */
export async function modelSignatureSource(timeoutMs) {
  const fnv = (str) => {
    let h = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i)
      h = Math.imul(h, 0x01000193) >>> 0
    }
    return h.toString(16).padStart(8, '0')
  }
  const stable = (v) => {
    if (Array.isArray(v)) {
      return `[${v.map(stable).join(',')}]`
    }
    if (v && typeof v === 'object') {
      return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
    }
    return JSON.stringify(v)
  }
  const s = window.store.getState()
  const root = s.rootElement
  if (!root) {
    return {error: 'no rootElement'}
  }
  const rows = []
  const leaves = []
  const visit = (node) => {
    const kids = node.children ?? []
    const name = node.Name?.value ?? node.name ?? node.LongName?.value ?? ''
    rows.push(`${node.expressID ?? node.id ?? ''}|${name}|${kids.length}`)
    if (kids.length === 0 && Number.isInteger(node.expressID)) {
      leaves.push(node.expressID)
    }
    for (const k of kids) {
      visit(k)
    }
  }
  visit(root)
  const out = {treeNodes: rows.length, treeHash: fnv(rows.join('\n')), leafId: null, propsHash: null, propsReadMs: null}
  if (leaves.length === 0 || typeof s.model?.getItemProperties !== 'function') {
    out.propsError = leaves.length === 0 ? 'no leaf with an expressID' : 'model has no getItemProperties'
    return out
  }
  out.leafId = leaves[Math.floor(leaves.length / 2)]
  const t0 = performance.now()
  try {
    const props = await Promise.race([
      s.model.getItemProperties(out.leafId),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('property read timed out')), timeoutMs)),
    ])
    out.propsReadMs = Math.round(performance.now() - t0)
    out.propsHash = props ? fnv(stable(props)) : null
    out.propsSample = props ? stable(props).slice(0, 160) : null
  } catch (e) {
    out.propsError = String(e?.message ?? e)
  }
  return out
}


/**
 * Remove every `.glb` artifact from OPFS, so the next load of the same file
 * cannot be a cache hit and reopens through its engine and the sidecar
 * beside it (engineSidecar.spec.ts#dropGlbArtifact does the same).
 *
 * @return {Promise<number>} how many were removed
 */
export async function dropGlbArtifactsSource() {
  let removed = 0
  const walk = async (dir) => {
    const names = []
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') {
        await walk(handle)
      } else if (name.includes('.glb')) {
        names.push(name)
      }
    }
    for (const name of names) {
      await dir.removeEntry(name)
      removed++
    }
  }
  await walk(await navigator.storage.getDirectory())
  return removed
}
