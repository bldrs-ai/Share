
import {
  BlendFunction,
  EffectComposer,
  EffectPass,
  OutlineEffect,
  RenderPass,
} from 'postprocessing'

/**
 * Create Postprocessing Effect Composer
 *
 * @return {object} containing both {composer, outlineEffect }
 */
export default function createComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))

  const effectOptions = {
    blendFunction: BlendFunction.SCREEN,
    edgeStrength: 1.5,
    pulseSpeed: 0.0,
    visibleEdgeColor: 0xc7c7c7,
    hiddenEdgeColor: 0xff9b00,
    height: window.innerHeight,
    windth: window.innerWidth,
    blur: false,
    xRay: true,
    opacity: 1,
  }

  const outlineEffect = new OutlineEffect(scene, camera, effectOptions)
  const outlinePass = new EffectPass(camera, outlineEffect)
  composer.addPass(outlinePass)

  return {composer, outlineEffect}
}
