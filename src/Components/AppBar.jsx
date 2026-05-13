import React, {ReactElement} from 'react'
import {AppBar as MuiAppBar, Stack, Toolbar} from '@mui/material'
import {useTheme} from '@mui/material/styles'
import ControlsGroup from './ControlsGroup'
import LoginMenu from './LoginMenu'
import SearchBar from './Search/SearchBar'


/**
 * @property {boolean} isRepoActive TODO(pablo): maybe better in store
 * @return {ReactElement}
 */
export default function AppBar({isRepoActive}) {
  const theme = useTheme()
  return (
    <MuiAppBar
      color='secondary'
      elevation={0}
      position='fixed'
      size='small'
      sx={{
        backgroundColor: theme.palette.primary.sceneBackground,
        opacity: .95,
        // TODO(pablo): weird bleed of appbar but not container below.
        // Ends up with a border
        marginRight: '4px',
      }}
    >
      <Toolbar>
        <Stack
          direction='row'
          spacing={1}
          justifyContent='space-evenly'
          alignItems='center'
          sx={{width: '100%'}}
        >
          <ControlsGroup isRepoActive={isRepoActive}/>
          <SearchBar/>
          <LoginMenu/>
        </Stack>
      </Toolbar>
    </MuiAppBar>
  )
}
