import React, {useState} from 'react'
import {IconButton, Menu, MenuItem, Stack, Typography} from '@mui/material'
import {Settings as SettingsIcon} from '@mui/icons-material'


/**
 * Reusable account footer row: right-aligned label, gap, settings icon with a drop-down menu.
 *
 * @property {string} label Text shown (e.g. "pablo-mayrgundter - GitHub")
 * @property {string} testId data-testid for the root Stack
 * @property {string} settingsButtonTestId data-testid for the settings icon button
 * @property {Array<{label: string, onClick: Function, testId: string}>} menuItems Menu entries
 * @return {React.ReactElement}
 */
export default function AccountFooter({label, testId, settingsButtonTestId, menuItems}) {
  const [menuAnchorEl, setMenuAnchorEl] = useState(null)

  const handleOpen = (event) => setMenuAnchorEl(event.currentTarget)
  const handleClose = () => setMenuAnchorEl(null)

  return (
    <Stack
      direction='row'
      alignItems='center'
      sx={{width: '100%', pt: 0.5}}
      data-testid={testId}
    >
      <Typography
        variant='caption'
        color='text.secondary'
        noWrap
        sx={{flex: 1, textAlign: 'right'}}
      >
        {label}
      </Typography>
      <IconButton
        size='small'
        onClick={handleOpen}
        title='Settings'
        sx={{margin: 0}}
        data-testid={settingsButtonTestId}
      >
        <SettingsIcon fontSize='small'/>
      </IconButton>
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleClose}
      >
        {menuItems.map((item) => (
          <MenuItem
            key={item.label}
            onClick={() => {
              handleClose()
              item.onClick()
            }}
            data-testid={item.testId}
          >
            {item.label}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  )
}
