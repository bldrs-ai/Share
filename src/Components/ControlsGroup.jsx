import React from 'react'
import ButtonGroup from '@mui/material/ButtonGroup'
import {TooltipIconButton} from './Buttons'
import BranchesIcon from '../assets/2D_Icons/Branches.svg'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import TreeIcon from '../assets/2D_Icons/Tree.svg'


/**
 * OperationsGroup contains tools for cut plane, deselecting items and
 * toggling shortcut visibility
 *
 * @param {object} viewer The IFC viewer
 * @param {Function} unSelectItem deselects currently selected element
 * @return {React.Component}
 */
export default function ControlsGroup({
  unSelectItem,
  showNavPanel,
  showBranchControl,
  showOpenControl,
  isGitHubRepo,
  onClickMenuCb,
  onCLickBranchControlCb,
  onCLickOpenControlCb,
}) {
  return (
    <ButtonGroup orientation="hoizontal">
      <TooltipIconButton
        title='Open Models'
        placement='bottom'
        selected={showOpenControl}
        onClick={onCLickOpenControlCb}
        icon={<OpenIcon/>}
      />
      {isGitHubRepo &&
        <TooltipIconButton
          title='Project Versions'
          placement='bottom'
          selected={showBranchControl}
          onClick={onCLickBranchControlCb}
          icon={<BranchesIcon/>}
        />
      }
      <TooltipIconButton
        title='Elements Hierarchy'
        placement='bottom'
        selected={showNavPanel}
        onClick={onClickMenuCb}
        icon={<TreeIcon/>}
      />
    </ButtonGroup>
  )
}
