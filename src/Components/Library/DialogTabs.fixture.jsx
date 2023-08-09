import React from 'react'
import Typography from '@mui/material/Typography'
import Box from '@mui/material/Typography'
import FixtureContext from '../../FixtureContext'
import DialogTabs from './DialogTabs'
import AttentionIcon from '../../assets/icons/Attention.svg'
import Panel from './Panel'


const tabList = ['Explore', 'Open', 'Save']

const contentList = [
  <Panel
    key={1}
    content={
      <Box sx={{textAlign: 'left'}}>
        <Typography variant='h4'>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </Typography>
      </Box>
    }
  />,
  <Panel
    key={2}
    content={
      <Box sx={{textAlign: 'left'}}>
        <Typography variant='h4'>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </Typography>
      </Box>
    }
  />,
  <Panel
    key={3}
    content={
      <Box sx={{textAlign: 'left'}}>
        <Typography variant='h4'>
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
          Lorem ipsum dolor sit amet, consectetur adipiscing elit,
          sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
          Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
          Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
          Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        </Typography>
      </Box>
    }
  />,
]

const headerTextList = ['Explore Sample Projects', 'Open Project', 'Save Project']


// const contentList = ['one', 'two', 'three']

export default (
  <FixtureContext>
    <DialogTabs
      icon={<AttentionIcon className='icon-share'/>}
      headerText={'Here\'s the thing!'}
      isDialogDisplayed={true}
      // eslint-disable-next-line no-empty-function
      setIsDialogDisplayed={() => {}}
      content={'What you should know about doing the thing'}
      actionTitle={'Do do the thing?'}
      actionCb={() => {
        alert('You did the thing')
      }}
      tabList={tabList}
      contentList={contentList}
      headerTextList={headerTextList}
    />
  </FixtureContext>
)
