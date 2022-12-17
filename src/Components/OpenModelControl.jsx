import React, {useState, useContext} from 'react'
import {useNavigate} from 'react-router-dom'
import {useTheme} from '@mui/styles'
import Dialog from './Dialog'
import {RectangularButton} from '../Components/Buttons'
import {ColorModeContext} from '../Context/ColorMode'
import ModelsIcon from '../assets/2D_Icons/Model.svg'
import OpenIcon from '../assets/2D_Icons/Open.svg'
import UploadIcon from '../assets/2D_Icons/Upload.svg'
import {
  Box,
  MenuItem,
  Paper,
  Typography,
  Tooltip,
  ToggleButton,
  TextField,
} from '@mui/material'


/**
 * Displays open warning.
 *
 * @return {object} React component
 */
export default function OpenModelControl({fileOpen}) {
  const [isDialogDisplayed, setIsDialogDisplayed] = useState(false)
  const theme = useTheme()
  const colorTheme = useContext(ColorModeContext)

  return (
    <>
      <Paper
        sx={{
          'backgroundColor': colorTheme.isDay() ? '#E8E8E8' : '#4C4C4C',
          '& button': {
            'width': '44px',
            'height': '44px',
            'border': `1px solid ${theme.palette.highlight.heavy}`,
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: '#97979770',
            },
          },
          '& svg': {
            width: '40px',
            height: '40px',
            fill: theme.palette.primary.contrastText,
          },
        }}
        elevation={0}
      >
        <Tooltip title={'Open IFC'} describeChild placement={'top'}>
          <ToggleButton
            selected={isDialogDisplayed}
            onClick={() => {
              setIsDialogDisplayed(true)
            }}
            color="primary"
            value={'Open IFC'}
          >
            <OpenIcon/>
          </ToggleButton>
        </Tooltip>
      </Paper>
      {isDialogDisplayed && (
        <OpenModelDialog
          isDialogDisplayed={isDialogDisplayed}
          setIsDialogDisplayed={setIsDialogDisplayed}
          fileOpen={fileOpen}
        />
      )}
    </>
  )
}


/**
 * @param {boolean} isDialogDisplayed
 * @param {Function} setIsDialogDisplayed
 * @return {object} React component
 */
function OpenModelDialog({
  isDialogDisplayed,
  setIsDialogDisplayed,
  fileOpen,
}) {
  const theme = useTheme()
  const openFile = () => {
    fileOpen()
    setIsDialogDisplayed(false)
  }
  const [selected, setSelected] = React.useState('')
  const navigate = useNavigate()
  const handleSelect = (e) => {
    setSelected(e.target.value)
    const modelPath = {
      0: '/share/v/gh/IFCjs/test-ifc-files/main/Schependomlaan/IFC%20Schependomlaan.ifc#c:60.45,-4.32,60.59,1.17,5.93,-3.77',
      1: '/share/v/gh/Swiss-Property-AG/Momentum-Public/main/Momentum.ifc#c:-38.64,12.52,35.4,-5.29,0.94,0.86',
      2: '/share/v/gh/Swiss-Property-AG/Schneestock-Public/main/ZGRAGGEN.ifc#c:80.66,11.66,-94.06,6.32,2.93,-8.72',
      3: '/share/v/gh/Swiss-Property-AG/Eisvogel-Public/main/EISVOGEL.ifc#c:107.36,8.46,156.67,3.52,2.03,16.71',
      4: '/share/v/gh/Swiss-Property-AG/Seestrasse-Public/main/SEESTRASSE.ifc#c:119.61,50.37,73.68,16.18,11.25,5.74',
      // eslint-disable-next-line max-len
      5: '/share/v/gh/sujal23ks/BCF/main/packages/fileimport-service/ifc/ifcs/171210AISC_Sculpture_brep.ifc/120010/120020/120023/4998/2867#c:-163.46,16.12,223.99,12.03,-28.04,-15.28',
    }
    navigate({
      pathname: modelPath[e.target.value],
    })
    setIsDialogDisplayed(false)
  }

  return (
    <Dialog
      icon={<ModelsIcon/>}
      headerText={
        <Typography variant="h2" sx={{margin: '10px 10px'}}>
          Open
        </Typography>
      }
      isDialogDisplayed={isDialogDisplayed}
      setIsDialogDisplayed={setIsDialogDisplayed}
      content={
        <Box
          sx={{
            width: '260px',
            paddingTop: '6px',
          }}
        >
          <TextField
            sx={{
              'width': '260px',
              '& .MuiOutlinedInput-input': {
                color: theme.palette.highlight.secondary,
              },
              '& .MuiInputLabel-root': {
                color: theme.palette.highlight.secondary,
              },
              '& .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline': {
                borderColor: theme.palette.highlight.secondary,
              },
              '&:hover .MuiOutlinedInput-input': {
                color: theme.palette.highlight.secondary,
              },
              '&:hover .MuiInputLabel-root': {
                color: theme.palette.highlight.secondary,
              },
              '&:hover .MuiOutlinedInput-root .MuiOutlinedInput-notchedOutline':
                {
                  borderColor: theme.palette.highlight.secondary,
                },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-input': {
                color: theme.palette.highlight.secondary,
              },
              '& .MuiInputLabel-root.Mui-focused': {
                color: theme.palette.highlight.secondary,
              },
              '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline':
                {
                  borderColor: theme.palette.highlight.secondary,
                },
            }}
            value={selected}
            onChange={(e) => handleSelect(e)}
            variant="outlined"
            label="Sample Projects"
            select
            size="small"
          >
            <MenuItem value={1}>
              <Typography variant="p">Momentum</Typography>
            </MenuItem>
            <MenuItem value={2}>
              <Typography variant="p">Schneestock</Typography>
            </MenuItem>
            <MenuItem value={3}>
              <Typography variant="p">Eisvogel</Typography>
            </MenuItem>
            <MenuItem value={4}>
              <Typography variant="p">Seestrasse</Typography>
            </MenuItem>
            <MenuItem value={0}>
              <Typography variant="p">Schependomlaan</Typography>
            </MenuItem>
            <MenuItem value={5}>
              <Typography variant="p">Structural Detail</Typography>
            </MenuItem>
          </TextField>
          <Box
            sx={{
              textAlign: 'left',
              paddingLeft: '10px',
              paddingRight: '10px',
            }}
            component="p"
          >
            Models hosted on GitHub are opened by inserting the link to the file
            into the Search.
            <br/>
            Visit our{' '}
            <span>
              <Box
                sx={{
                  fontWeight: 'bold',
                  color: theme.palette.highlight.secondary,
                  cursor: 'pointer',
                  borderBottom: `1px solid ${theme.palette.highlight.secondary}`,
                }}
                component="a"
                target="_blank"
                href="https://github.com/bldrs-ai/Share/wiki/Open-IFC-model-hosted-on-GitHub"
                rel="noreferrer"
              >
                wiki
              </Box>
            </span>{' '}
            to learn more.
          </Box>
          <RectangularButton
            title="Open from local drive"
            icon={<UploadIcon/>}
            onClick={openFile}
            noBackground={true}
            noBorder={false}
          />
          <Box
            sx={{
              textAlign: 'left',
              paddingLeft: '10px',
              paddingRight: '10px',
            }}
            component="p"
          >
            Models opened from local drive cannot be saved or shared.
          </Box>
        </Box>
      }
    />
  )
}
