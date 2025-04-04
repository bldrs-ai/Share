import {useEffect} from 'react'
import ReactGA from 'react-ga4'
import {useLocation} from 'react-router-dom'


/** Enables Google Analytics. */
export default function usePageTracking() {
  const location = useLocation()

  useEffect(() => {
    // Initialize GA once, when the component first mounts:
    ReactGA.initialize(GA_ID)
  }, [])

  useEffect(() => {
    ReactGA.send({
      hitType: 'pageview',
      page: location.pathname + location.search + location.hash,
    })
  }, [location])
}


// For test
export const GA_ID = 'G-GRLNVMZRGW'
