import React from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'
import WidgetApi from "./WidgetApi/WidgetApi";

const root = createRoot(document.getElementById('root'))

new WidgetApi()

root.render(
    <BrowserRouter>
      <BaseRoutes/>
    </BrowserRouter>)
