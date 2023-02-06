import {useState, useEffect} from 'react'
import {MOBILE_WIDTH} from '../utils/constants'


/**
 * @return {boolean} True iff window width <= MOBILE_WIDTH.
 */
export function useIsMobile() {
  return useWindowDimensions().width <= MOBILE_WIDTH
}


/**
 * @return {object} {width, height}
 */
export function useWindowDimensions() {
  const [windowDimensions, setWindowDimensions] = useState(getWindowDimensions())


  useEffect(() => {
    /** Handle resize. */
    function handleResize() {
      setWindowDimensions(getWindowDimensions())
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])


  return windowDimensions
}


/**
 * @return {object} {width, height}
 */
function getWindowDimensions() {
  const {innerWidth: width, innerHeight: height} = window
  return {
    width,
    height,
  }
}
