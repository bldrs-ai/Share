import {useState, useEffect} from 'react'


/**
 * @return {Object} {width, height}
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
 * @return {Object} {width, height}
 */
function getWindowDimensions() {
  const {innerWidth: width, innerHeight: height} = window
  return {
    width,
    height,
  }
}
