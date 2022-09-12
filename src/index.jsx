import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import {Auth0ProviderWithHistory} from './Components/Auth0ProviderWithHistory'
import BaseRoutes from './BaseRoutes'


const root = createRoot(document.getElementById('root'))
root.render(
    <BrowserRouter>
      <Auth0ProviderWithHistory>
        <BaseRoutes/>
      </Auth0ProviderWithHistory>,
    </BrowserRouter>,
)
