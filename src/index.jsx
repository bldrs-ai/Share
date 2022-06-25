import React from 'react'
import {render} from 'react-dom'
import {BrowserRouter} from 'react-router-dom'
import BaseRoutes from './BaseRoutes'
import {PathsProvider} from './Paths'


const installPrefix = window.location.pathname.startsWith('/Share') ? '/Share' : ''
const appPrefix = installPrefix + '/share'

render(
    <PathsProvider installPrefix={installPrefix} appPrefix={appPrefix}>
      <BrowserRouter>
        <BaseRoutes/>
      </BrowserRouter>
    </PathsProvider>, document.getElementById('root'))
