import React, {useEffect} from 'react'
import ReactDOM from 'react-dom'
import PricingTable from '../Components/Stripe/PricingTable'
import {subscribePageParams} from './subscribeParams'
import './index.css'

/**
 * @return {React.Component}
 */
function App() {
  const {theme, userEmail, clientReferenceId} = subscribePageParams(window.location.search)

  useEffect(() => {
    document.body.classList.remove('light', 'dark')
    document.body.classList.add(theme)
  }, [theme])

  return (
    <div style={{backgroundColor: (theme === 'light') ? '#FFFFFF' : '#414141', minHeight: '100vh'}}>
      <PricingTable theme={theme} userEmail={userEmail} clientReferenceId={clientReferenceId}/>
    </div>
  )
}

ReactDOM.render(
  <React.StrictMode>
    <App/>
  </React.StrictMode>,
  document.getElementById('root'),
)
