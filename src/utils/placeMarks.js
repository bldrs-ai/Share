import {setGroupColor} from './svg'
import {assertDefined} from './assert'


export const setPlaceMarkStatus = (svgGroup, isActive, placeMarkGroupMap) => {
  assertDefined(svgGroup, isActive)
  resetPlaceMarksActive(false, placeMarkGroupMap)
  svgGroup.userData.isActive = isActive
  resetPlaceMarkColors()
}


export const resetPlaceMarksActive = (isActive, placeMarkGroupMap) => {
  placeMarkGroupMap.forEach((svgGroup) => {
    svgGroup.userData.isActive = isActive
  })
}


export const resetPlaceMarkColors = (placeMarkGroupMap) => {
  placeMarkGroupMap.forEach((svgGroup) => {
    let color = '#00F0FF'
    if (svgGroup.userData.isActive) {
      color = '#69F566'
    }
    setGroupColor(svgGroup, color)
  })
}
