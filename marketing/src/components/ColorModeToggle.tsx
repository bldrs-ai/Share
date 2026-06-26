'use client'
import {IconButton, Tooltip} from '@mui/material'
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined'
import NightlightRoundIcon from '@mui/icons-material/NightlightRound'
import SettingsBrightnessIcon from '@mui/icons-material/SettingsBrightness'
import {Themes} from '@/lib/colorMode'
import {useColorMode} from './ColorModeProvider'


/**
 * 3-state toggle cycling Day → Night → System (matches the SPA's
 * ProfileControl semantics). A single click advances; the icon and label
 * reflect the current preference, not the effective mode, so System reads
 * as "follow system" regardless of what the OS resolves to right now.
 */
export default function ColorModeToggle() {
  const {mode, cycleMode} = useColorMode()

  const next =
    mode === Themes.Day ? 'night' : mode === Themes.Night ? 'system' : 'day'
  const label = `Theme: ${mode} (click for ${next})`

  const icon =
    mode === Themes.Day ? <WbSunnyOutlinedIcon fontSize="small"/> :
    mode === Themes.Night ? <NightlightRoundIcon fontSize="small"/> :
    <SettingsBrightnessIcon fontSize="small"/>

  return (
    <Tooltip title={label}>
      <IconButton
        aria-label={label}
        color="inherit"
        onClick={cycleMode}
        size="small"
      >
        {icon}
      </IconButton>
    </Tooltip>
  )
}
