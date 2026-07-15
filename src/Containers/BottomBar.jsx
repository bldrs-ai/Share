import React, {ReactElement} from 'react'
import {Stack} from '@mui/material'
import AboutControl from '../Components/About/AboutControl'
import BotControl from '../Components/Bot/BotControl'
import ElementsControl from '../Components/ElementsControl'
import HelpControl from '../Components/Help/HelpControl'
import LoadReportControl from '../Components/LoadReport/LoadReportControl'
import LoadStatusSlot from '../Components/LoadStatusSlot'
import PerfToolbarSlot from '../Components/PerfToolbarSlot'
import useExistInFeature from '../hooks/useExistInFeature'


/**
 * BottomBar contains AboutControl, ElementsControl, BotChat and HelpControl
 *
 * @property {Function} deselectItems deselects currently selected element
 * @return {ReactElement}
 */
export default function BottomBar({deselectItems}) {
  const isBotEnabled = useExistInFeature('bot')
  return (
    <Stack
      spacing={2}
      direction='row'
      justifyContent='space-between'
      alignItems='center'
      data-testid='BottomBar'
      sx={{position: 'relative'}}
    >
      <AboutControl/>
      <ElementsControl deselectItems={deselectItems}/>
      {/*
        Sub-stack so the perf panel sits flush against the Help/Bot
        control instead of being spread out by the outer
        `justifyContent='space-between'`.  When the `?feature=perf`
        flag is off, `PerfToolbarSlot` returns null and this resolves
        to a single-child stack — no visual difference.

        LoadStatusSlot (live load-log expando) renders only mid-load;
        LoadReportControl (the "i" next to "?") only once a load has
        finished with a report — see conway #301 follow-up.
      */}
      <Stack direction='row' alignItems='center' spacing={2}>
        <LoadStatusSlot/>
        <PerfToolbarSlot/>
        <LoadReportControl/>
        {isBotEnabled ? <BotControl/> : <HelpControl/>}
      </Stack>
    </Stack>
  )
}
