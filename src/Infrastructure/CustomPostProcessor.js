import {WebGLRenderer, Camera, Scene} from 'three'
import {EffectComposer, EffectPass, OutlineEffect, RenderPass} from 'postprocessing'

/**
 *  A custom post processor utility
 */
export default class CustomPostProcessor {
  _composer = null
  _scene = null
  _camera = null
  static _instance = null

  /**
   * Instanciates a new CustomPostProcessor
   *
   * @param {WebGLRenderer} the renderer
   * @param {Scene} three.js scene
   * @param {Camera} the camera
   */
  constructor(renderer, scene, camera) {
    this._composer = new EffectComposer(renderer)
    this._composer.addPass(new RenderPass(scene, camera))
    this._scene = scene
    this._camera = camera
  }

  /**
   * Gets the the post processor
   *
   * @return {CustomPostProcessor} the post processor instanc
   */
  static get getInstance() {
    return this._instance
  }

  /**
   * Creates a new CustomPostProcessor
   *
   * @param {WebGLRenderer} the renderer
   * @param {Scene} three.js scene
   * @param {Camera} the camera
   */
  static createInstance(renderer, scene, camera) {
    this._instance = new CustomPostProcessor(renderer, scene, camera)
  }

  /**
   * Gets the composer
   *
   * @return {EffectComposer} the composer
   */
  get getComposer() {
    return this._composer
  }

  /**
   * Creates a new outline effect and adds it to the composer
   *
   * @param {object} the effect options
   * @return {OutlineEffect} the outline effect
   */
  createOutlineEffect(name, effectOpts) {
    const outlineEffect = new OutlineEffect(this._scene, this._camera, effectOpts)
    const selectionOutlinePass = new EffectPass(this._camera, outlineEffect)
    this._composer.addPass(selectionOutlinePass)
    return outlineEffect
  }
}
