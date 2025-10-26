import {useEffect, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import debug from '../utils/debug'


/**
 * This hook checks for the existence of a named feature in the URL SearchParams (via react-router), e.g. feature=app,placemark.
 *
 * @param {string} name Feature flag name
 * @return {Function}
 */
export default function useExistInFeature(name) {
  const [existInFeature, setExistInFeature] = useState(false)
  const [searchParams] = useSearchParams()


  useEffect(() => {
    setExistInFeature(false)
    if (!name) {
      return
    }
    const lowerName = name.toLowerCase()
    const enabledFeatures = searchParams.get('feature')
    if (!enabledFeatures) {
      return
    }
    const enabledFeatureArr = enabledFeatures.split(',')
    debug().log('useExistInFeature#useEffect[name, searchParams]: enabledFeatureArr: ', enabledFeatureArr)

    for (let i = 0; i < enabledFeatureArr.length; i++) {
      if (enabledFeatureArr[i].toLowerCase() === lowerName) {
        setExistInFeature(true)
        return
      }
    }
  }, [name, searchParams])


  return existInFeature
}
