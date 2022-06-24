import React from 'react'


const PathsContext = React.createContext({installPrefix: undefined, appPrefix: undefined})

export const usePaths = () => {
  const paths = React.useContext(PathsContext)

  return paths
}

export const PathsProvider = ({installPrefix, appPrefix, children}) => {
  return (
    <PathsContext.Provider value={{installPrefix: installPrefix, appPrefix: appPrefix}}>
      {children}
    </PathsContext.Provider>
  )
}
