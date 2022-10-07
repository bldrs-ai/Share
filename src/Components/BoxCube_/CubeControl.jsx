import {
  AmbientLight,
  DirectionalLight,
  Scene,
  WebGLRenderer,
  OrthographicCamera,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import {CubeControlMaterial, LightColor} from '../material'
import {BoxCube, switchPick} from './BoxCube.js'

/* eslint-disable no-magic-numbers, no-unused-vars */

/**
 * BoxCube class constructor
 *
 * @return
 */
export class CubeControls {
  /**
   * BoxCube class constructor
   *
   * @return
   */
  constructor(container, canvas) {
    this.scene = new Scene()
    this.container = container
    this.canvas = canvas
    this.width = this.container.clientWidth
    this.height = this.container.clientHeight

    this.initCamera()
    this.initLight()
    this.initRenderer()
    this.initRayCaster()
    this.boxCube = new BoxCube(this.scene)
    this.onHover()
  }


  /**
   * BoxCube class constructor
   *
   */
  initCamera() {
    this.camera = new OrthographicCamera(
        this.width / -1,
        this.width / 1,
        this.height / 1,
        this.height / -1,
        -1000,
        1000,
    )
    this.camera.position.z = 100
    this.camera.position.y = 100
    this.camera.position.x = 100
  }


  /**
   * BoxCube class constructor
   *
   */
  initLight() {
    this.ambientLight = new AmbientLight(LightColor.light, 2)
    this.scene.add(this.ambientLight)
    this.directionalLight = new DirectionalLight(LightColor.light, 2)
    this.directionalLight.position.set(0, 10, 0)
    this.directionalLight.target.position.set(-5, 0, 0)
    this.scene.add(this.directionalLight)
    this.scene.add(this.directionalLight.target)
  }


  /**
   * BoxCube class constructor
   *
   */
  initRenderer() {
    this.renderer = new WebGLRenderer({canvas: this.canvas, alpha: true, antialias: true})
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.localClippingEnabled = true

    this.renderer.domElement.setAttribute('tabindex', 1)
  }


  /**
   * BoxCube class constructor
   *
   */
  initRayCaster() {
    this.rayCaster = new Raycaster()
    this.rayCaster.firstHitOnly = true
    this.mouse = new Vector2()
  }

  /**
   * BoxCube class constructor
   *
   */
  cast(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect()
    const x1 = event.clientX - bounds.left
    const y1 = event.clientY - bounds.top
    const x2 = bounds.right - bounds.left
    this.mouse.x = (x1 / x2 * 2) - 1
    const y2 = bounds.bottom - bounds.top
    this.mouse.y = -(y1 / y2 * 2) + 1
  }

  /**
   * BoxCube class constructor
   *
   */
  onHover() {
    this.mouseOn = false
    const _this = this
    _this.renderer.domElement.addEventListener('mousemove', function(event) {
      _this.cast(event)
      _this.mouseOn = true
    })
    _this.renderer.domElement.addEventListener('mouseout', function(event) {
      _this.mouseOn = false
    })
  }

  /**
   * BoxCube class constructor
   *
   */
  hover() {
    const _this = this
    if (_this.mouseOn) {
      _this.rayCaster.setFromCamera(_this.mouse, _this.camera)
      const intersects = _this.rayCaster.intersectObjects(_this.scene.children)
      const found = intersects[0]
      if (found) {
        if (!found.object.textCube) {
          _this.renderer.domElement.style.cursor = 'pointer'
          found.object.material = CubeControlMaterial.hoverCube
        }
      } else {
        _this.renderer.domElement.style.cursor = 'default'
      }
    }
  }


  /**
   * BoxCube class constructor
   *
   */
  onPick(camera, controls) {
    const _this = this

    _this.renderer.domElement.onclick = function(event) {
      if (_this.mouse.x !== 0 || _this.mouse.y !== 0) {
        _this.rayCaster.setFromCamera(_this.mouse, _this.camera)

        const intersects = _this.rayCaster.intersectObjects(_this.scene.children)
        const found = intersects[0]
        if (found) {
          switchPick(camera, controls, found.object.name.trim())
        }
      }
    }
  }


  /**
   * BoxCube class constructor
   *
   */
  resetMaterial() {
    for (let i = 0; i < this.scene.children.length; i++) {
      if (this.scene.children[i].material) {
        if (!this.scene.children[i].textCube) {
          this.scene.children[i].material = CubeControlMaterial.normalCube
        }
      }
    }
  }

  /**
   * BoxCube class constructor
   *
   */
  animate(camera, controls) {
    // caemera: camera
    let vector = new Vector3(
        camera.position.x - controls.target.x,
        camera.position.y - controls.target.y,
        camera.position.z - controls.target.z,
    )
    // / vector.x=5,y=10,z=5
    vector = vector.normalize()
    const Vector2a = new Vector3(vector.x * 100, vector.y * 100, vector.z * 100)
    let newV = new Vector3(0, 0, 0)
    newV = newV.add(Vector2a)
    // buoc 1 tinh dc vi tri camera sao cho luon nam trong mat cau co ban kinh la can(3*100^2)
    this.camera.position.x = newV.x
    this.camera.position.y = newV.y
    this.camera.position.z = newV.z

    // buoc 2 xuay 2 camera cung goc
    this.camera.rotation.x = camera.rotation.x
    this.camera.rotation.y = camera.rotation.y
    this.camera.rotation.z = camera.rotation.z

    this.resetMaterial()
    this.hover()

    this.renderer.render(this.scene, this.camera)
  }
}
