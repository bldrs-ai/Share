import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'
import WidgetApi from './utils/widgetAPI'

const root = createRoot(document.getElementById('root'))
root.render(
    <BrowserRouter>
      <BaseRoutes/>
    </BrowserRouter>)
