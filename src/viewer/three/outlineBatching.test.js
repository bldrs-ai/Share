import {OutlineEffect, OverrideMaterialManager} from 'postprocessing'
import {PerspectiveCamera, Scene} from 'three'
import {injectBatchingChunks, patchOutlineForBatchedMeshes} from './outlineBatching'


describe('viewer/three/outlineBatching', () => {
  describe('injectBatchingChunks', () => {
    // A stand-in with the anchors the real depth-comparison.vert has.
    const SHADER = [
      '#include <common>',
      '#include <skinning_pars_vertex>',
      'void main(){',
      '#include <begin_vertex>',
      '#include <project_vertex>',
      '}',
    ].join('\n')

    it('declares batchingMatrix before project_vertex reads it', () => {
      const patched = injectBatchingChunks(SHADER)
      const pars = patched.indexOf('#include <batching_pars_vertex>')
      const vertex = patched.indexOf('#include <batching_vertex>')
      const begin = patched.indexOf('#include <begin_vertex>')
      const project = patched.indexOf('#include <project_vertex>')
      expect(pars).toBeGreaterThan(-1)
      // The ordering IS the fix: `batching_vertex` declares `batchingMatrix`,
      // `project_vertex` multiplies by it, and the pars chunk defines the
      // helpers `batching_vertex` calls. Getting them in the wrong order is
      // the same compile failure with a different line number.
      expect(pars).toBeLessThan(vertex)
      expect(vertex).toBeLessThan(begin)
      expect(begin).toBeLessThan(project)
    })

    it('leaves an already-batching-aware shader alone', () => {
      // Upstream may ship the chunk; patching twice must not double-declare.
      const patched = injectBatchingChunks(SHADER)
      expect(injectBatchingChunks(patched)).toBeNull()
    })

    it('declines a shader missing an anchor rather than guessing', () => {
      expect(injectBatchingChunks('void main(){}')).toBeNull()
      expect(injectBatchingChunks('#include <common>\nvoid main(){}')).toBeNull()
      expect(injectBatchingChunks(undefined)).toBeNull()
    })
  })


  describe('patchOutlineForBatchedMeshes', () => {
    /** @return {OutlineEffect} a real effect, as CustomPostProcessor builds one */
    function makeEffect() {
      return new OutlineEffect(new Scene(), new PerspectiveCamera(), {xRay: true})
    }

    it('patches the real DepthComparisonMaterial, which ships without batching', () => {
      const effect = makeEffect()
      // Pin the upstream premise: when postprocessing adds the chunks itself
      // this assertion fails and the whole module can be deleted.
      expect(effect.maskPass.overrideMaterial.vertexShader)
        .not.toContain('batching')
      expect(patchOutlineForBatchedMeshes(effect)).toBe(true)
      expect(effect.maskPass.overrideMaterial.vertexShader)
        .toContain('#include <batching_vertex>')
    })

    it('leaves the patched original as what the default path binds', () => {
      // The premise the module comment rests on: `OverrideMaterialManager
      // .render` assigns `this.material` — the very object patched in place —
      // and only reaches for its clones when the static workaround flag is
      // on, which postprocessing ships off. If an upgrade flips that default,
      // the clones become load-bearing and this assertion says so.
      expect(OverrideMaterialManager.workaroundEnabled).toBe(false)
      const effect = makeEffect()
      patchOutlineForBatchedMeshes(effect)
      expect(effect.maskPass.overrideMaterialManager.material.vertexShader)
        .toContain('#include <batching_vertex>')
    })

    it('rebuilds the clones the workaroundEnabled path would bind', () => {
      // These clones are dormant in this codebase — `render()` binds
      // `this.material` unless the static `OverrideMaterialManager
      // .workaroundEnabled` is on, and nothing turns it on. Pinning them
      // patched is what makes the reassignment in the module defensible as
      // defense-in-depth rather than cargo cult.
      const effect = makeEffect()
      patchOutlineForBatchedMeshes(effect)
      const manager = effect.maskPass.overrideMaterialManager
      const variants = [
        ...manager.materials,
        ...manager.materialsBackSide,
        ...manager.materialsDoubleSide,
        ...manager.materialsFlatShaded,
      ]
      expect(variants.length).toBeGreaterThan(0)
      for (const variant of variants) {
        expect(variant.vertexShader).toContain('#include <batching_vertex>')
      }
    })

    it('keeps the depth-buffer uniform wired through the re-clone', () => {
      // The manager nulls render-target uniforms while cloning and restores
      // them afterwards; a re-clone that lost `depthBuffer` would compile
      // fine and mask against nothing.
      const effect = makeEffect()
      patchOutlineForBatchedMeshes(effect)
      const material = effect.maskPass.overrideMaterialManager.materials[0]
      expect(material.uniforms.depthBuffer.value).toBe(effect.depthPass.texture)
    })

    it('is idempotent and safe on an effect with no mask pass', () => {
      const effect = makeEffect()
      expect(patchOutlineForBatchedMeshes(effect)).toBe(true)
      expect(patchOutlineForBatchedMeshes(effect)).toBe(false)
      expect(patchOutlineForBatchedMeshes({})).toBe(false)
      expect(patchOutlineForBatchedMeshes(null)).toBe(false)
    })
  })
})
