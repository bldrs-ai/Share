import React from 'react'
import Box from '@mui/material/Box'
import {TooltipIconButton} from './Buttons'
import Logo from './Logo'
import PkgJson from '../../package.json'


/**
 * @param {Function} onClick function triggered when logo is cliked
 * @return {React.ReactElement}
 */
export default function LogoButton({onClick}) {
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: '20px',
        left: '20px',
      }}
    >
      <TooltipIconButton
        title={`Bldrs: ${PkgJson.version}`}
        onClick={onClick}
        icon={<Logo/>}
      />
    </Box>
  )
}
