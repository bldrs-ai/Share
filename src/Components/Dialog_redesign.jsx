import React from 'react'
import {
  Box,
  MuiDialog,
  DialogContent,
  DialogTitle,
  Divider,
} from '@mui/material/Dialog'
import {grey} from '@mui/material/colors'
import {
  UilBuilding,
  UilUpload,
  UilMultiply,
  UilGraduationCap,
  UilGithub,
} from '@iconscout/react-unicons'
import {assertDefined} from '../utils/assert'
import {RectangularButton} from './Buttons'
import InputBar from './InputBar'


/**
 * A generic base dialog component.
 *
 * @param {string} headerContent Short message describing the operation
 * @param {string} bodyContent
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
export default function Dialog({
  headerContent,
  bodyContent,
  isDialogDisplayed,
  setIsDialogDisplayed,
}) {
  assertDefined(
      headerContent,
      bodyContent,
      isDialogDisplayed,
      setIsDialogDisplayed,
  )
  const close = () => setIsDialogDisplayed(false)
  return (
    <MuiDialog open={isDialogDisplayed} onClose={close} maxWidth={'sm'}>
      <DialogTitle>{headerContent}</DialogTitle>
      <DialogContent
        sx={(theme) => ({
          height: '400px',
          maxWidth: '300px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-around',
          alignContent: 'center',
        })}
      >
        {bodyContent}
      </DialogContent>
    </MuiDialog>
  )
}


/**
 * Content for the open Dialog
 *
 * @return {object} React component
 */
export function OpenDialogBodyContent() {
  return (
    <Box
      sx={{
        height: '400px',
        maxWidth: '300px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-around',
        alignContent: 'center',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignContent: 'center',
        }}
      >
        <Box
          sx={{
            fontFamily: 'Helvetica',
            marginBottom: '12px',
            fontWeight: 600,
            fontSize: '10px',
            lineHeight: '12px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#0085FF',
            textAlign: 'center',
          }}
        >
          Recommended Method
        </Box>
        <InputBar startAdornment={<UilGithub/>}/>
        <Box
          sx={{
            marginTop: '10px',
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignContent: 'center',
            cursor: 'pointer',
          }}
        >
          <UilGraduationCap
            sx={{color: '#979797', width: '13px', height: '13px'}}
          />
          <Box
            sx={{
              fontFamily: 'Helvetica',
              marginLeft: '5px',
              width: '200px',
              color: '#979797',
              fontSize: '12px',
            }}
          >
            How do I host .ifc files on GitHub?
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignContent: 'center',
        }}
      >
        <Divider/>
        <Box
          sx={{
            fontFamily: 'Helvetica',
            position: 'absolute',
            alignSelf: 'center',
            textAlign: 'center',
            width: '40px',
            color: '#777777',
            backgroundColor: grey[100],
          }}
        >
          or
        </Box>
      </Box>
      <RectangularButton
        title="Upload from device"
        onClick={() => console.log('clicked')}
        icon={<UilUpload/>}
      />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignContent: 'center',
        }}
      >
        <Divider/>
        <Box
          sx={{
            fontFamily: 'Helvetica',
            position: 'absolute',
            alignSelf: 'center',
            textAlign: 'center',
            width: '40px',
            color: '#777777',
            backgroundColor: grey[100],
          }}
        >
          or
        </Box>
      </Box>
      <RectangularButton
        title="Load Sample Model"
        onClick={() => console.log('clicked')}
        icon={<UilBuilding/>}
      />
    </Box>
  )
}


/**
 * Title for the open Dialog
 *
 * @return {object} React component
 */
export function OpenDialogHeaderContent() {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignContent: 'center',
        maxWidth: '500px',
      }}
    >
      <Box
        sx={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignContent: 'center',
        }}
      >
        <Box sx={{fontWeight: 'bold', fontSize: '30px'}}>
          Open file
          <Box
            sx={{
              fontWeight: 500,
              fontSize: '14px',
              lineHeight: '17px',
              color: '#777777',
            }}
          >
            We support .ifc file types
          </Box>
        </Box>
      </Box>
      <Box>
        <UilMultiply style={{color: '#505050'}}/>
      </Box>
    </Box>
  )
}
