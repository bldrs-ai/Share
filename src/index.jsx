import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'


if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
  const {worker} = require('./__mocks__/browser')
  worker.start({
    onUnhandledRequest(req) {
      if (req.url.host === 'api.github.com') {
        console.error(`Found an unhandled ${req.method} request to ${req.url}`)
      }
    },
  })
}

const root = createRoot(document.getElementById('root'))
root.render(
    <BrowserRouter>
      <BaseRoutes />
    </BrowserRouter>)
