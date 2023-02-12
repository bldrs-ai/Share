
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

  const selectionEffectOptions = {
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

  const isolationEffectOptions = {
    blendFunction: BlendFunction.SCREEN,
    edgeStrength: 5,
    pulseSpeed: 0.0,
    visibleEdgeColor: 0x00FFFF,
    hiddenEdgeColor: 0x00FFFF,
    height: window.innerHeight,
    windth: window.innerWidth,
    blur: false,
    xRay: true,
    opacity: 1,
  }

  const selectionOutlineEffect = new OutlineEffect(scene, camera, selectionEffectOptions)
  const isolationOutlineEffect = new OutlineEffect(scene, camera, isolationEffectOptions)
  const selectionOutlinePass = new EffectPass(camera, selectionOutlineEffect)
  const isolationOutlinePass = new EffectPass(camera, isolationOutlineEffect)
  composer.addPass(selectionOutlinePass)
  composer.addPass(isolationOutlinePass)

  return {composer, selectionOutlineEffect, isolationOutlineEffect}
}
