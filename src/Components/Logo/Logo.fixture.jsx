import React from 'react'
import {
  LogoB,
  LogoBWithDomain,
} from './Logo'
import {ThemeCtx} from '../../theme/Theme.fixture'


export const ThemeLogoB = () => <ThemeCtx><LogoB/></ThemeCtx>
export const ThemeLogoBWithDomain = () => <ThemeCtx><LogoBWithDomain/></ThemeCtx>

export default {
  'Icon': <ThemeLogoB/>,
  'Icon with domain': <ThemeLogoBWithDomain/>,
}
