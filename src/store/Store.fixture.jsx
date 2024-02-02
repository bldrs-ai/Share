import React, {useEffect} from 'react'
import useStore from './useStore'


/**
 * Sets up a store with a test repository.
 *
 * @property {Array.<React.Component>} children Component under test
 * @return {React.Component}
 */
export function StoreCtx({children}) {
  const setRepository = useStore((state) => state.setRepository)
  useEffect(() => {
    setRepository('pablo-mayrgundter', 'Share')
  }, [setRepository])

  return <>{children}</>
}
