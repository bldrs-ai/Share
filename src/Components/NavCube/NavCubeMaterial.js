import {MeshLambertMaterial, MeshBasicMaterial, DoubleSide, Color} from 'three'


export const LightColor = {
  light: 0x404040,
  normalCube: new Color('#e0e0e0'),
  hoverCube: new Color('#e0e0e0'),
  textCube: new Color('#459A47'),
  refPlan: new Color('rgb(245, 245, 245)'),
  ring: new Color('rgb(123, 130, 28)'),
}
export const NavCubeMaterial = {
  mainCube: (textTex) => {
    return new MeshBasicMaterial({
      color: 'skyblue',
      map: textTex,
      wireframe: true,
    })
  },
  normalCube: new MeshBasicMaterial({
    transparent: true,
    opacity: 1,
    color: LightColor.normalCube,
    depthTest: true,
    // wireframe: true,
  }),
  hoverCube: new MeshLambertMaterial({
    transparent: true,
    opacity: 1,
    color: LightColor.hoverCube,
    depthTest: true,
  }),
  textCube: new MeshLambertMaterial({
    transparent: true,
    opacity: 1,
    color: LightColor.textCube,
    depthTest: true,
  }),

  ring: new MeshLambertMaterial({
    transparent: true,
    opacity: 0.5,
    color: LightColor.hoverCube,
    side: DoubleSide,
    depthWrite: true,
    depthTest: true,
  }),
  textRing: new MeshLambertMaterial({
    transparent: true,
    opacity: 1,
    color: LightColor.ring,
    side: DoubleSide,
    depthWrite: true,
    depthTest: true,
  }),
}
