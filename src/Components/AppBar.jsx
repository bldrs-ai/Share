import React, {ReactElement} from 'react'
import MuiAppBar from '@mui/material/AppBar'
import Stack from '@mui/material/Stack'
import Toolbar from '@mui/material/Toolbar'
import useTheme from '@mui/material/styles/useTheme'
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
          <SearchBar placeholder='Search' id='search'/>
          <LoginMenu/>
        </Stack>
      </Toolbar>
    </MuiAppBar>
  )
}
