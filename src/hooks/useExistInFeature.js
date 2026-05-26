import {useEffect, useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import debug from '../utils/debug'
import {flags} from '../FeatureFlags'


// Mirror of `FeatureFlags.js#FEATURE_IMPLICATIONS`. Kept in sync by
// hand — the two-element map doesn't justify a shared module.
// Sub-flags whose presence in the URL also activates the parent.
const FEATURE_IMPLICATIONS = {
  glb: ['glbdraco', 'glbmeshopt', 'glbverbose'],
}


/**
 * This hook checks for a named feature in static FeatureFlags or URL SearchParams, e.g. feature=app,placemark.
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

    const staticFlag = flags.find((f) => f.name.toLowerCase() === lowerName)
    if (staticFlag?.isActive) {
      setExistInFeature(true)
      return
    }

    const enabledFeatures = searchParams.get('feature')
    if (!enabledFeatures) {
      return
    }
    const enabledFeatureArr = enabledFeatures.split(',').map((f) => f.trim().toLowerCase())
    debug().log('useExistInFeature#useEffect[name, searchParams]: enabledFeatureArr: ', enabledFeatureArr)

    if (enabledFeatureArr.includes(lowerName)) {
      setExistInFeature(true)
      return
    }
    // Implication check: a sub-flag in the URL activates its parent.
    // Matches `FeatureFlags.js#isFeatureEnabled` behavior so the React
    // path and the non-React path agree on what's enabled.
    const impliers = FEATURE_IMPLICATIONS[lowerName]
    if (impliers && impliers.some((sub) => enabledFeatureArr.includes(sub))) {
      setExistInFeature(true)
    }
  }, [name, searchParams])


  return existInFeature
}
