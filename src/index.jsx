import React from 'react'
import {render} from 'react-dom'
import {BrowserRouter} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'


console.log('index.jsx')
render(
    <BrowserRouter>
      <BaseRoutes/>
    </BrowserRouter>, document.getElementById('root'))
