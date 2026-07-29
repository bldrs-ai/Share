import {Vector4} from 'three'
import {eachBatch} from '../ifc/batchedModel'
import {repaintBatchedColors} from '../ifc/batchedHighlight'
import {computePartPalette, paletteUnit, writePaletteColors} from '../ifc/productPalette'


/**
 * colorMode — the auto/source axis of the display-override stack
 * (design/new/model-display-controls.md §3).
 *
 * Auto-coloring (`productPalette`) fires at load time for models that carry
 * no presentation data, and until now it was a one-way door: the palette was
 * written straight over `instanceColors` and the file's own colors were gone.
 * `assembleBatchedModel` now snapshots them into `instanceSourceColors`
 * first, which is what lets this module flip between the two at runtime.
 *
 * Both directions are computed from the SOURCE table, never from whatever is
 * currently on screen — so repeated toggling can't drift (auto → source →
 * auto lands on exactly the first auto), and the palette's colorless-model
 * test keeps testing the file's colors rather than the palette's own output
 * (which would classify as "has real color" and refuse to reapply).
 *
 * @see productPalette — the palette itself and its compute/write split.
 * @see batchedHighlight#repaintBatchedColors — why writes go through paint().
 */


/** Color sources selectable per scope. */
export const ColorMode = Object.freeze({
  /** Share-assigned per-part palette, for models that shipped no color. */
  AUTO: 'auto',
  /** Whatever the file said — grey, for a colorless STEP. */
  SOURCE: 'source',
})


const _rgba = new Vector4()


/**
 * Collect the batches that carry a source-color snapshot.
 *
 * A mesh without one predates the snapshot (an older cached model, a
 * hand-built test double) and can't participate in the toggle — there's no
 * "source" to go back to. Skipped rather than guessed at.
 *
 * @param {object} model BatchedMesh or Group
 * @return {Array<object>} meshes with `instanceSourceColors`
 */
function revertibleMeshes(model) {
  const meshes = []
  eachBatch(model, (mesh) => {
    if (mesh.instanceSourceColors && mesh.instanceColors) {
      meshes.push(mesh)
    }
  })
  return meshes
}


/**
 * Whether the auto palette is available for this model — i.e. the file
 * carried no color of its own and there are at least two parts to tell
 * apart. Drives whether the UI offers Auto as a meaningful choice.
 *
 * @param {object} model BatchedMesh or Group
 * @return {boolean}
 */
export function hasAutoColor(model) {
  const meshes = revertibleMeshes(model)
  return meshes.length > 0 &&
    computePartPalette(meshes.map((mesh) => paletteUnit(mesh, mesh.instanceSourceColors))) !== null
}


/**
 * Which mode the model is currently showing, read off the scene rather than
 * assumed from how it loaded — the load-time state depends on the
 * `autoColorParts` flag, and later overrides can move it. Any instance whose
 * live color differs from its source means the palette is on.
 *
 * @param {object} model BatchedMesh or Group
 * @return {string} a {@link ColorMode}
 */
export function activeColorMode(model) {
  for (const mesh of revertibleMeshes(model)) {
    const source = mesh.instanceSourceColors
    const live = mesh.instanceColors
    for (let i = 0; i < source.length; i++) {
      if (live[i].x !== source[i].x || live[i].y !== source[i].y || live[i].z !== source[i].z) {
        return ColorMode.AUTO
      }
    }
  }
  return ColorMode.SOURCE
}


/**
 * Switch the model between the auto palette and its source colors.
 *
 * Writes the base color table for every instance and then repaints through
 * `repaintBatchedColors`, so an active selection or hover survives the switch
 * and will later restore to the newly-chosen base color.
 *
 * @param {object} model BatchedMesh or Group
 * @param {string} mode a {@link ColorMode}
 * @return {boolean} true if the model now shows palette colors; false if it
 *   shows source colors — including when AUTO was asked for but the palette
 *   doesn't apply (a model with real color of its own stays as authored)
 */
export function setColorMode(model, mode) {
  const meshes = revertibleMeshes(model)
  if (meshes.length === 0) {
    return false
  }

  const palette = mode === ColorMode.AUTO ?
    computePartPalette(meshes.map((mesh) => paletteUnit(mesh, mesh.instanceSourceColors))) :
    null

  for (const mesh of meshes) {
    const source = mesh.instanceSourceColors
    if (palette) {
      writePaletteColors(mesh, palette, source)
    } else {
      // Restore verbatim, alpha included. Fresh objects so the source
      // snapshot stays immutable no matter what a later override does to
      // the live table.
      for (let i = 0; i < source.length; i++) {
        const {x, y, z, w} = source[i]
        mesh.instanceColors[i] = {x, y, z, w}
        mesh.setColorAt(i, _rgba.set(x, y, z, w))
      }
    }
  }

  repaintBatchedColors(model)
  return palette !== null
}
