import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import OpenModelControl from './OpenModelControl'
import useStore from '../store/useStore'
import {TooltipIconButton} from './Buttons'
import HistoryIcon from '@mui/icons-material/History'
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined'
import TreeIcon from '../assets/icons/Tree.svg'


/**
 * OperationsGroup contains tools for sharing, notes, properties, cut
 * plane, deselect, theme change and about.
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {React.Component}
 */
export default function OperationsGroup({fileOpen}) {
  const cutPlanes = useStore((state) => state.cutPlanes)
  const levelInstance = useStore((state) => state.levelInstance)
  const selectedElement = useStore((state) => state.selectedElement)

  const isSelected = () => {
    const ifSelected = (
      selectedElement !== null ||
      cutPlanes.length !== 0 ||
      levelInstance !== null
    )
    return ifSelected
  }

  return (
    <ButtonGroup orientation='horizontal' >
      {/* <TooltipIconButton
        title='Open Project'
        icon={<CreateNewFolderIcon color='secondary'/>}
        placement='bottom'
        selected={true}
        onClick={() => (isSelected)}
      /> */}
      <OpenModelControl fileOpen={fileOpen}/>
      <TooltipIconButton
        title='Search'
        icon={<SearchOutlinedIcon/>}
        placement='bottom'
        aboutInfo={false}
        selected={true}
        onClick={() => (isSelected)}
      />
      <TooltipIconButton
        title='Navigation'
        icon={<TreeIcon className='icon-share' color='secondary' style={{width: '17px', height: '17px'}}/>}
        placement='bottom'
        aboutInfo={false}
        selected={true}
        onClick={() => (isSelected)}
      />
      <TooltipIconButton
        title='Project History'
        icon={<HistoryIcon className='icon-share' color='secondary'/>}
        placement='bottom'
        selected={true}
        onClick={() => (isSelected)}
      />
    </ButtonGroup>
  )
}
