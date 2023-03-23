import React from 'react'
import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import useTheme from '@mui/styles/useTheme'
import {useWindowDimensions} from '../Components/Hooks'


/**
 * @param {object} modelPath
 * @param {number} searchAndNavWidthPx
 * @param {number} searchAndNavMaxWidthPx
 * @return {object} React component
 */
export default function FileBreadCrumbs({modelPath}) {
  const theme = useTheme()
  const windowDimensions = useWindowDimensions()
  const spacingBetweenSearchAndOpsGroupPx = 20
  const operationsGroupWidthPx = 60
  const searchAndNavWidthPx = windowDimensions.width - (operationsGroupWidthPx + spacingBetweenSearchAndOpsGroupPx)
  const searchAndNavMaxWidthPx = 300
  return (
    <Box sx={{
      'display': 'flex',
      'flexDirection': 'row',
      'borderRadius': '5px',
      'width': '275px',
      'marginTop': '14px',
      'padding': '6px 0px 6px 14px',
      'background': theme.palette.primary.background,
      'color': theme.palette.primary.contrastText,
      'textOverflow': 'ellipsis',
      'overflow': 'hidden',
      'whiteSpace': 'nowrap',
      'opacity': .8,
      '& a': {
        ...theme.typography.tree,
        color: theme.palette.primary.contrastText,
        opacity: .4,
      },
      '@media (max-width: 900px)': {
        width: `${searchAndNavWidthPx}px`,
        maxWidth: `${searchAndNavMaxWidthPx}px`,
      },
    }}
    >
      <Tooltip title={modelPath.org} placement={'bottom'}>
        <Box
          sx={{
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <a
            href={`https://github.com/${modelPath.org}`}
            target='_new'
          >
            {modelPath.org}
          </a>
        </Box>
      </Tooltip>
      <Tooltip title={modelPath.repo} placement={'bottom'}>
        <Box
          sx={{
            maxWidth: '60px',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <a
            href={`https://github.com/${modelPath.org}/${modelPath.repo}`}
            target='_new'
          >
            &gt; {modelPath.repo}
          </a>
        </Box>
      </Tooltip>
      <Tooltip title={modelPath.filepath} placement={'bottom'}>
        <Box
          sx={{
            maxWidth: '60px',
            textOverflow: 'ellipsis',
            overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}
        >
          <a
            href={`https://github.com/${modelPath.org}/${modelPath.repo}/blob/${modelPath.branch}${modelPath.filepath}`}
            target='_new'
          >
            {modelPath.filepath}
          </a>
        </Box>
      </Tooltip>
    </Box>
  )
}
