import React, {useState} from 'react'
import {Box, IconButton, Menu, MenuItem, Stack, Typography} from '@mui/material'
import {Settings as SettingsIcon} from '@mui/icons-material'
import useStore from '../../store/useStore'
import {getProvider} from '../../connections/registry'
import {saveConnections, saveSources} from '../../connections/persistence'


const FONT_WEIGHT_NORMAL = 400
const FONT_WEIGHT_BOLD = 600


/**
 * Displays a single Connection with a settings menu (remove action).
 *
 * @property {object} connection The Connection object
 * @property {boolean} [subtle] When true, renders with subdued grey caption styling
 * @return {React.ReactElement}
 */
export default function ConnectionCard({connection, subtle = false}) {
  const removeConnection = useStore((state) => state.removeConnection)
  const connections = useStore((state) => state.connections)
  const sources = useStore((state) => state.sources)

  const [menuAnchorEl, setMenuAnchorEl] = useState(null)

  const handleOpenMenu = (event) => {
    setMenuAnchorEl(event.currentTarget)
  }

  const handleCloseMenu = () => {
    setMenuAnchorEl(null)
  }

  const handleRemove = async () => {
    handleCloseMenu()
    const provider = getProvider(connection.providerId)
    if (provider) {
      try {
        await provider.disconnect(connection.id)
      } catch {
        // Non-critical; remove from store regardless
      }
    }
    removeConnection(connection.id)
    const remainingConnections = connections.filter((c) => c.id !== connection.id)
    const remainingSources = sources.filter((s) => s.connectionId !== connection.id)
    saveConnections(remainingConnections)
    saveSources(remainingSources)
  }

  return (
    <Stack
      direction='row'
      alignItems='center'
      spacing={1}
      sx={{width: '100%'}}
      data-testid={`connection-card-${connection.id}`}
    >
      <Box sx={{flex: 1, minWidth: 0}}>
        <Typography
          variant={subtle ? 'caption' : 'subtitle1'}
          fontWeight={subtle ? FONT_WEIGHT_NORMAL : FONT_WEIGHT_BOLD}
          color={subtle ? 'text.secondary' : 'text.primary'}
          noWrap
          sx={{textAlign: 'left'}}
        >
          {connection.label}
        </Typography>
      </Box>
      <IconButton
        size='small'
        onClick={handleOpenMenu}
        title='Settings'
        data-testid={`button-settings-${connection.id}`}
      >
        <SettingsIcon fontSize='small'/>
      </IconButton>
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
      >
        <MenuItem
          onClick={handleRemove}
          data-testid={`menu-item-remove-${connection.id}`}
        >
          Remove
        </MenuItem>
      </Menu>
    </Stack>
  )
}
