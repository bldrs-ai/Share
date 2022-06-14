import * as THREE from 'three'


// TODO: separate this into a SpriteSheet supercalss and LabelSheet subclass.
/**
 * From:
 *   https://observablehq.com/@vicapow/three-js-sprite-sheet-example
 *   https://observablehq.com/@vicapow/uv-mapping-textures-in-threejs
 */
export default class SpriteSheet {
  /**
   * @param {number} maxLabels
   * @param {string} maxLabel
   * @param {string} labelTextFont
   * @param {array} padding
   */
  constructor(maxLabels, maxLabel, labelTextFont = sharedDefaultFont, padding = [0, 0]) {
    if (!Number.isInteger(maxLabels)) {
      throw new Error('maxLabels is invalid: ' + maxLabels)
    }
    this.maxLabels = maxLabels
    this.labelCount = 0
    this.labelTextFont = labelTextFont
    this.textBaseline = 'top'
    this.padding = padding
    this.canvas = createCanvas()
    this.ctx = this.canvas.getContext('2d')
    const maxBounds = measureText(this.ctx, maxLabel, labelTextFont)
    const itemSize = Math.max(maxBounds.width, maxBounds.height)
    this.size = Math.sqrt(this.maxLabels) * itemSize
    this.canvas.width = this.size
    this.canvas.height = this.size
    this.curX = 0
    this.curY = 0
    this.lineSizeMax = 0
    const ctx = this.ctx
    ctx.fillStyle = 'rgba(0, 0, 0, 0)'
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.fill()
    this.positions = []
    this.sizes = []
    this.spriteCoords = []

    this.positionAttribute = null
    this.sprites = null
    // document.canvas = this.canvas;
    // console.log('canvas: ', {width: this.canvas.width, height: this.canvas.height},
    //            this.maxLabels, maxBounds, this.size, maxBounds.width);
  }


  /**
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {string} labelText
   * @param {string} fillStyle Parsed as a CSS <color> value, e.g. 'red' or 'rgb(1, 0, 0, 0)'.
   * @return {number} id of label.
   */
  add(x, y, z, labelText, fillStyle = defaultTextColor) {
    if (this.labelCount >= this.maxLabels) {
      throw new Error(`Add called too many times, can only allocate
                       maxLabels(${this.maxLabels}), already have ${this.labelCount}`)
    }
    this.ctx.font = this.labelTextFont
    let bounds = measureText(this.ctx, labelText)
    const size = Math.max(bounds.width, bounds.height)
    if (this.curX + size > this.canvas.width) {
      this.curX = 0
      // TODO: getting a little bleed through from cur to next line,
      // so moving down next line a bit.  This is probably from
      // measureText not being quite tall enough.
      this.curY += this.lineSizeMax + 1
      this.lineSizeMax = 0
    }
    if (size > this.lineSizeMax) {
      this.lineSizeMax = size
    }
    bounds = this.drawAt(labelText, this.curX, this.curY, fillStyle)

    // console.log(`positionAttribute.set(x: ${x}, y: ${y}, z: ${z}, offset: ${this.labelCount})`);
    this.positions.push(x, y, z)

    this.spriteCoords.push(bounds.x / this.size,
        1 - (bounds.y + bounds.height) / this.size,
        bounds.width / this.size,
        bounds.height / this.size)

    this.sizes.push(bounds.width, bounds.height)
    this.curX += bounds.width
    const id = this.labelCount++
    return id
  }


  /**
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {string} fillStyle css
   * @return {object} {x, y, width, height}
   */
  drawAt(text, x, y, fillStyle) {
    const ctx = this.ctx
    ctx.textBaseline = this.textBaseline
    ctx.font = this.labelTextFont
    const bounds = measureText(ctx, text)
    const size = Math.max(bounds.width, bounds.height)
    // console.log(`drawAt, text(${text}), x(${x}), y(${y}), size(${size}), fillStyle(${fillStyle})`);
    ctx.save()
    ctx.translate(x, y)
    this.drawLabel(text, size, size, fillStyle)
    ctx.restore()
    return {x, y, width: size, height: size}
  }


  /**
   * @param {string} text
   * @param {number} width
   * @param {number} height
   * @param {string} fillStyle css
   */
  drawLabel(text, width, height, fillStyle) {
    const ctx = this.ctx
    ctx.textBaseline = this.textBaseline
    ctx.font = this.labelTextFont
    ctx.fillStyle = fillStyle
    ctx.fillText(text, 0, 0)
    // console.log(`fillStyle(${fillStyle}), ctx.fillStyle(${ctx.fillStyle}):`, ctx);
    /*
    ctx.beginPath();
    ctx.strokeStyle = 'white';
    ctx.rect(0, 0, width, height);
    ctx.stroke();
    */
  }


  /**
   * @param {THREE.Float32BufferAttribute} sharedPositionAttribute Optional.
   * @return {object} Sprites
   */
  compile(sharedPositionAttribute) {
    if (sharedPositionAttribute && sharedPositionAttribute.count * 3 != this.positions.length) {
      throw new Error(`Shared positionAttribute.length(${sharedPositionAttribute.count * 3})` +
                      `!= this.positions.length(${this.positions.length})`)
    }
    if (this.positions.length != this.labelCount * 3) {
      throw new Error('Positions array size wrong: ' + this.positions.length)
    }
    if (this.sizes.length != this.labelCount * 2) {
      throw new Error('Positions array size wrong: ' + this.sizes.length)
    }
    if (this.spriteCoords.length != this.labelCount * 4) {
      throw new Error('Positions array size wrong: ' + this.spriteCoords.length)
    }
    this.positionAttribute = sharedPositionAttribute || new THREE.Float32BufferAttribute(this.positions, 3)
    const sizeAttribute = new THREE.Float32BufferAttribute(this.sizes, 2)
    const spriteCoordAttribute = new THREE.Float32BufferAttribute(this.spriteCoords, 4)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', this.positionAttribute)
    geometry.setAttribute('size', sizeAttribute)
    geometry.setAttribute('spriteCoord', spriteCoordAttribute)
    geometry.computeBoundingBox()
    this.sprites = new THREE.Points(geometry, this.createMaterial())
    return this.sprites
  }


  /** @return {object} material */
  createMaterial() {
    const texture = new THREE.CanvasTexture(this.canvas)
    texture.minFilter = THREE.NearestFilter
    texture.magFilter = THREE.NearestFilter
    const material = new THREE.ShaderMaterial( {
      uniforms: {
        map: {value: texture},
        padding: {value: new THREE.Vector2(this.padding[0], this.padding[1])},
      },
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    })
    return material
  }
}


const vertexShader = `
  uniform vec2 padding;
  attribute vec2 size;
  attribute vec4 spriteCoord;
  varying vec4 spriteCoordVarying;
  void main() {
    vec3 offsetPos = vec3(position.x + padding.x, position.y + padding.y, position.z);
    vec4 mvPosition = modelViewMatrix * vec4(offsetPos, 1.0);
    spriteCoordVarying = spriteCoord;
    gl_PointSize = size[0];
    gl_Position = projectionMatrix * mvPosition;
  }
`


const fragmentShader = `
  uniform sampler2D map;
  varying vec4 spriteCoordVarying;
  void main() {
    vec2 spriteUV = vec2(
      spriteCoordVarying.x + spriteCoordVarying.z * gl_PointCoord.x,
      spriteCoordVarying.y + spriteCoordVarying.w * (1.0 - gl_PointCoord.y));
    gl_FragColor = texture2D(map, spriteUV);
  }
`


/** @return {object} canvas*/
function createCanvas() {
  const canvas = document.createElement('canvas')
  canvas.style = 'border: solid 1px red; display: none'
  document.body.appendChild(canvas)
  return canvas
}


/**
 * @param {object} ctx
 * @param {string} text
 * @param {string} fontStyle css
 * @return {object} {width, height}
 */
function measureText(ctx, text, fontStyle) {
  if (fontStyle) {
    ctx.font = fontStyle
  }
  const m = ctx.measureText(text)
  const width = Math.ceil(m.width)
  const height = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)
  // console.log(`text: ${text}, width: ${width}, height: ${height}`, m);
  return {width, height}
}


const defaultTextColor = '#7fa0e0'
const sharedDefaultFont = 'medium arial'
