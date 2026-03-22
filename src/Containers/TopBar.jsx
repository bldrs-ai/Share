import React, {ReactElement, useState, useCallback} from 'react'
import {IconButton, Stack, Tooltip, Typography} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import {Sun} from 'lucide-react'
import HelpControl from '../Components/Help/HelpControl'
import ProfileControl from '../Components/Profile/ProfileControl'
import LightManager from '../Infrastructure/LightManager'
import useStore from '../store/useStore'


/**
 * Top navigation bar — build version left, model tools center, profile + help right.
 *
 * @return {ReactElement}
 */
export default function TopBar() {
  const theme = useTheme()
  const isLoginEnabled = useStore((state) => state.isLoginEnabled)
  const viewer = useStore((state) => state.viewer)
  const isModelReady = useStore((state) => state.isModelReady)
  const [lightOn, setLightOn] = useState(false)
  const [lightManager, setLightManager] = useState(null)

  const toggleLight = useCallback(() => {
    if (!viewer) return
    let mgr = lightManager
    if (!mgr) {
      mgr = new LightManager(viewer)
      setLightManager(mgr)
    }
    const newState = mgr.toggle()
    setLightOn(newState)
  }, [viewer, lightManager])

  return (
    <Stack
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '40px',
        zIndex: 10,
        pointerEvents: 'none',
        padding: '0 8px 0 50px',
        backgroundColor: theme.palette.secondary.backgroundColor,
        backdropFilter: theme.palette.secondary.backdropFilter,
        borderBottom: `1px solid ${theme.palette.secondary.dark}`,
      }}
      data-testid='TopBar'
    >
      <Typography sx={{
        fontSize: '11px',
        fontFamily: 'monospace',
        opacity: 0.4,
        pointerEvents: 'none',
      }}>
        build 051
      </Typography>

      {/* Center: model tools */}
      {viewer && isModelReady && (
        <Stack direction='row' alignItems='center' sx={{pointerEvents: 'auto'}} spacing={0.5}>
          <Tooltip title={lightOn ? 'Turn off light' : 'Turn on light'} placement='bottom'>
            <IconButton
              size='small'
              onClick={toggleLight}
              sx={{
                color: lightOn ? '#00ff00' : theme.palette.primary.contrastText,
                opacity: lightOn ? 1 : 0.6,
              }}
            >
              <Sun size={16} strokeWidth={1.75}/>
            </IconButton>
          </Tooltip>
        </Stack>
      )}

      <Stack
        direction='row'
        alignItems='center'
        sx={{pointerEvents: 'auto'}}
      >
        {isLoginEnabled && <ProfileControl/>}
        <HelpControl/>
      </Stack>
    </Stack>
  )
}
