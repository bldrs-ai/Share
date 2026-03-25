import React from 'react'
import {Box, Button} from '@mui/material'
import {Search as SearchIcon} from '@mui/icons-material'
import RecentFilesList from './RecentFilesList'


/**
 * Renders a RecentFilesList plus a centered Browse button.
 *
 * @param {object} props
 * @param {Array<object>} props.files
 * @param {Function} props.onOpen Called with (entry) when a recent is clicked
 * @param {Function} props.onBrowse Called when Browse is clicked
 * @param {string} [props.browseButtonLabel]
 * @param {React.ReactElement} [props.browseButtonIcon]
 * @param {string} [props.browseButtonTestId]
 * @return {React.ReactElement}
 */
export default function RecentFilesBrowseSection({
  files,
  onOpen,
  onBrowse,
  browseButtonLabel = 'Browse',
  browseButtonIcon = <SearchIcon/>,
  browseButtonTestId,
}) {
  return (
    <>
      <RecentFilesList
        files={files}
        onOpen={onOpen}
      />
      <Box sx={{display: 'flex', justifyContent: 'center'}}>
        <Button
          variant='contained'
          startIcon={browseButtonIcon}
          onClick={onBrowse}
          sx={{textTransform: 'none', m: '1em'}}
          data-testid={browseButtonTestId}
        >
          {browseButtonLabel}
        </Button>
      </Box>
    </>
  )
}
