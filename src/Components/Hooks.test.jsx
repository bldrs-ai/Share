import React, {ReactElement} from 'react'
import {render} from '@testing-library/react'
import {useIsMobile} from './Hooks'
import {MOBILE_WIDTH} from '../utils/constants'


/** @return {ReactElement} */
function TestComponent() {
  const isMobile = useIsMobile()
  return <>isMobile: {isMobile ? 'true' : 'false'}</>
}


describe('Hooks', () => {
  it('useIsMobile', () => {
    const aLil = 10
    window.innerWidth = MOBILE_WIDTH + aLil
    expect(render(<TestComponent/>).getByText('isMobile: false')).toBeInTheDocument()
    window.innerWidth = MOBILE_WIDTH - aLil
    expect(render(<TestComponent/>).getByText('isMobile: false')).toBeInTheDocument()
  })
})
