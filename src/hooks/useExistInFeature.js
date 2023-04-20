import {useEffect, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import debug from '../utils/debug'


/**
 * Feature Hook
 *
 * @param {string} name Feature flag name
 * @return {Function}
 */
export function useExistInFeature(name) {
  const [existInFeature, setExistInFeature] = useState(false)
  const [searchParams] = useSearchParams()
  debug().log('useExistInFeature: searchParams: ', searchParams.get('feature'))


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
    debug().log('useExistInFeature#useEffect: enabledFeatureArr: ', enabledFeatureArr)

    for (let i = 0; i < enabledFeatureArr.length; i++) {
      if (enabledFeatureArr[i].toLowerCase() === lowerName) {
        setExistInFeature(true)
        return
      }
    }
  }, [name, searchParams])


  return existInFeature
}
