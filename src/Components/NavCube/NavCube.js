/* eslint-disable no-magic-numbers */
import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three'
import {LightColor, NavCubeMaterial} from './NavCubeMaterial'
import {BoxCube, switchPick} from './BoxCube'

/**
 * Nav Cube class
 */
export class NavCube {
  /**
   * Nav Cube constructor
   */
  constructor(viewer, isCameraPerpective) {
    this.viewer = viewer
    this.scene = new Scene()
    this.initContainer()
    this.initCamera()
    this.initLight()
    this.initRenderer()
    this.initRayCaster()
    this.boxCube = new BoxCube(this.scene)
    this.onHover()
    console.log('from NavCube', isCameraPerpective)
  }

  /**
   * Initialize container
   */
  initContainer() {
    this.width = 120
    this.height = 120
    this.container = document.createElement('div')
    this.container.style.position = 'absolute'
    this.container.style.width = `${this.width}px`
    this.container.style.height = `${this.height}px`
    this.container.style.bottom = 0
    this.container.style.right = 0
    this.container.style.zIndex = 999
    this.viewer.container.appendChild(this.container)
    this.canvas = document.createElement('canvas')
    this.canvas.style.position = 'absolute'
    this.canvas.style.width = '100%'
    this.canvas.style.height = '100%'
    this.canvas.style.top = 0
    this.canvas.style.left = 0
    this.container.appendChild(this.canvas)
  }

  /**
   * Initialize camera
   */
  initCamera() {
    this.perspectiveCamera = new PerspectiveCamera(45, this.width / this.height, 1, 2000)
    this.perspectiveCamera.userData.Radius = 400
    this.perspectiveCamera.position.z = this.perspectiveCamera.userData.Radius
    this.perspectiveCamera.position.y = this.perspectiveCamera.userData.Radius
    this.perspectiveCamera.position.x = this.perspectiveCamera.userData.Radius

    this.orthographicCamera = new OrthographicCamera(
        this.width / -1,
        this.width / 1,
        this.height / 1,
        this.height / -1,
        -1000,
        1000,
    )
    this.orthographicCamera.userData.Radius = 100
    this.orthographicCamera.position.z = this.orthographicCamera.userData.Radius
    this.orthographicCamera.position.y = this.orthographicCamera.userData.Radius
    this.orthographicCamera.position.x = this.orthographicCamera.userData.Radius
    if (this.viewer.context.ifcCamera.activeCamera.isPerspectiveCamera) {
      this.camera = this.perspectiveCamera
    } else {
      this.camera = this.orthographicCamera
    }
    this.viewer.context.ifcCamera.onChange = function(event) {
      if (this.viewer.context.ifcCamera.activeCamera.isPerspectiveCamera) {
        this.camera = this.perspectiveCamera
      } else {
        this.camera = this.orthographicCamera
      }
    }
  }

  /**
   * Initialize light
   */
  initLight() {
    /* eslint-disable no-magic-numbers */
    this.ambientLight = new AmbientLight(LightColor.light, 2)
    this.scene.add(this.ambientLight)
    this.directionalLight = new DirectionalLight(LightColor.light, 2)
    this.directionalLight.position.set(-100, 0, 0)
    this.directionalLight.target.position.set(-50, 0, 0)
    this.scene.add(this.directionalLight)
    this.scene.add(this.directionalLight.target)
  }
  /**
   * Initialize render
   */
  initRenderer() {
    this.renderer = new WebGLRenderer({canvas: this.canvas, alpha: true, antialias: true})
    this.renderer.setSize(this.width, this.height)
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.localClippingEnabled = true
    this.renderer.domElement.setAttribute('tabindex', 1)
  }
  /**
   * Initialize ray caster
   */
  initRayCaster() {
    this.rayCaster = new Raycaster()
    this.rayCaster.firstHitOnly = true
    this.mouse = new Vector2()
  }
  /**
   * cast?
   */
  cast(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect()
    const x1 = event.clientX - bounds.left
    const y1 = event.clientY - bounds.top
    const x2 = bounds.right - bounds.left
    /* eslint-disable no-magic-numbers */
    this.mouse.x = ((x1 / x2) * 2) - 1
    const y2 = bounds.bottom - bounds.top
    this.mouse.y = (-(y1 / y2) * 2) + 1
  }
  /**
   * on hover method
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
   * hover
   */
  hover() {
    const _this = this
    const filterElementHover = _this.scene.children.filter((child) => {
      return child.userData.Element
    })
    if (_this.mouseOn) {
      _this.rayCaster.setFromCamera(_this.mouse, _this.camera)
      const intersects = _this.rayCaster.intersectObjects(filterElementHover)
      const found = intersects[0]
      if (found) {
        if (!found.object.textCube) {
          _this.renderer.domElement.style.cursor = 'pointer'
          found.object.material = NavCubeMaterial.hoverCube
        }
      } else {
        _this.renderer.domElement.style.cursor = 'default'
      }
    }
  }
  /**
   * reset material
   */
  resetMaterial() {
    for (let i = 0; i < this.scene.children.length; i++) {
      if (this.scene.children[i].material) {
        if (!this.scene.children[i].textCube) {
          this.scene.children[i].material = NavCubeMaterial.normalCube
        }
      }
    }
  }
  /**
   * on pick
   */
  onPick(ifcModel) {
    const _this = this
    const camera = _this.viewer.context.ifcCamera.cameraControls
    const filterElementClick = _this.scene.children.filter((child) => {
      return child.userData.Element
    })
    _this.renderer.domElement.onclick = function(event) {
      if (_this.mouse.x !== 0 || _this.mouse.y !== 0) {
        _this.rayCaster.setFromCamera(_this.mouse, _this.camera)
        const intersects = _this.rayCaster.intersectObjects(filterElementClick)
        const found = intersects[0]
        if (found) {
          switchPick(camera, ifcModel, found.object.name.trim())
        }
      }
    }
  }
  /**
   * animate
   */
  animate() {
    const camera = this.viewer.context.ifcCamera.activeCamera

    const controls = this.viewer.context.ifcCamera.cameraControls
    const r = this.camera.userData.Radius
    let vector = new Vector3(
        camera.position.x - controls._target.x,
        camera.position.y - controls._target.y,
        camera.position.z - controls._target.z,
    )
    vector = vector.normalize()
    const Vector2_ = new Vector3(vector.x * r, vector.y * r, vector.z * r)
    let newV = new Vector3(0, 0, 0)
    newV = newV.add(Vector2_)
    this.camera.position.x = newV.x
    this.camera.position.y = newV.y
    this.camera.position.z = newV.z

    this.camera.rotation.x = camera.rotation.x
    this.camera.rotation.y = camera.rotation.y
    this.camera.rotation.z = camera.rotation.z

    this.resetMaterial()
    this.hover()

    this.renderer.render(this.scene, this.camera)
  }
  /**
   * animate viewer
   */
  onAnimateViewer() {
    const _this = this
    const animate = () => {
      _this.animate()

      requestAnimationFrame(animate)
    }
    animate()
  }
}
