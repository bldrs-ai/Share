import {Vector3} from 'three'
import {getHashParams, getHashParamsFromUrl, getObjectParams} from '../utils/location'
import {floatStrTrim, findMarkdownUrls} from '../utils/strings'
import {arrayDiff} from '../utils/arrays'
import {isDevMode} from '../utils/common'


const PLACE_MARK_PREFIX = 'm'


export const extractPlaceMarkUrls = async (issues) => {
  return (await Promise.all(issues.map(async (issue) => {
    return issue.body ? await findMarkdownUrls(issue.body, PLACE_MARK_PREFIX) : []
  }))).flat()
}

export const processPlaceMarkUrls = (urls, location) => {
  const hashUrlMap = new Map(urls.map((url) => [getHashParamsFromUrl(url, PLACE_MARK_PREFIX), url]))
  const hashes = Array.from(hashUrlMap.keys())
  const activeHash = getHashParams(location, PLACE_MARK_PREFIX)
  const inactiveHashes = hashes.filter((hash) => hash !== activeHash)
  return {placeMarksMap: hashUrlMap, inactivePlaceMarkHashes: inactiveHashes, activePlaceMarkHash: activeHash}
}

export const createAndAddSvgGroup = async (hash, placeMark, placeMarkGroupMap) => {
  const markArr = getObjectParams(hash)
  const svgGroup = await placeMark.putDown({
    point: new Vector3(floatStrTrim(markArr[0]), floatStrTrim(markArr[1]), floatStrTrim(markArr[2])),
  })
  placeMarkGroupMap.set(hash, svgGroup)
  return svgGroup
}

export const removeDeletedPlaceMarksIfNeeded = (placeMarkGroupMap, placeMarksMap, placeMark) => {
  if (!isDevMode()) {
    const currentHashes = Array.from(placeMarkGroupMap.keys())
    const deletedHashes = arrayDiff(currentHashes, Array.from(placeMarksMap.keys()))
    deletedHashes.forEach((hash) => placeMark.disposePlaceMark(placeMarkGroupMap.get(hash)))
  }
}
