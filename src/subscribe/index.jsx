import React, {useEffect} from 'react'
import ReactDOM from 'react-dom'
import PricingTable from '../Components/Stripe/PricingTable'
import './index.css'

// Utility to get query parameters
/**
 *  @return {string|null} The value of the query parameter or null if not found.
 */
function getQueryParam(param) {
  const params = new URLSearchParams(window.location.search)
  return params.get(param)
}

/**
 * @return {React.Component}
 */
function App() {
  // Retrieve the theme from the query string, default to 'light' if not provided.
  const theme = getQueryParam('theme') || 'light'

  useEffect(() => {
    document.body.classList.remove('light', 'dark')
    document.body.classList.add(theme)
  }, [theme])

  return (
    <div style={{backgroundColor: (theme === 'light') ? '#FFFFFF' : '#414141', minHeight: '100vh'}}>
      <PricingTable theme={theme}/>
    </div>
  )
}

ReactDOM.render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>,
  document.getElementById('root'),
)
