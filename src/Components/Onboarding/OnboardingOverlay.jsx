import React, {ReactElement, useEffect, useState} from 'react'
import {useNavigate} from 'react-router-dom'
import Box from '@mui/material/Box'
import Fade from '@mui/material/Fade'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import {useTheme} from '@mui/material/styles'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import useStore from '../../store/useStore'
import {handleFileDrop, handleDragOverOrEnter, handleDragLeave} from '../../utils/dragAndDrop'


/**
 * Full-screen overlay that highlights specific UI elements for first-time users
 *
 * @property {boolean} isVisible Controls whether the overlay is shown
 * @property {Function} onClose Callback when overlay should be dismissed
 * @return {ReactElement}
 */
export default function OnboardingOverlay({isVisible, onClose}) {
  const [openButtonPosition, setOpenButtonPosition] = useState(null)
  const [shareButtonPosition, setShareButtonPosition] = useState(null)
  const [isDragActive, setIsDragActive] = useState(false)

  // Store state and navigation
  const appPrefix = useStore((state) => state.appPrefix)
  const isOpfsAvailable = useStore((state) => state.isOpfsAvailable)
  const setAlert = useStore((state) => state.setAlert)
  const navigate = useNavigate()

  // Find actual button positions when overlay becomes visible
  useEffect(() => {
    if (isVisible) {
      const findButtonPositions = () => {
        // Find Open button using data-testid
        const openButton = document.querySelector('[data-testid="control-button-open"]')
        if (openButton) {
          const rect = openButton.getBoundingClientRect()
          setOpenButtonPosition({
            top: rect.top + (rect.height / 2),
            left: rect.left + (rect.width / 2),
          })
        }

        // Find Share button using data-testid
        const shareButton = document.querySelector('[data-testid="control-button-share"]')
        if (shareButton) {
          const rect = shareButton.getBoundingClientRect()
          setShareButtonPosition({
            top: rect.top + (rect.height / 2),
            left: rect.left + (rect.width / 2),
          })
        }
      }

      // Small delay to ensure buttons are rendered
      const buttonFindDelay = 100
      const timer = setTimeout(findButtonPositions, buttonFindDelay)
      return () => clearTimeout(timer)
    }
  }, [isVisible])

  /**
   * Handles file drop into drag-n-drop area
   *
   * @param {Event} event - The drop event
   */
  const handleDrop = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    setIsDragActive(false)
    await handleFileDrop(
      event,
      navigate,
      appPrefix,
      isOpfsAvailable,
      setAlert,
      () => onClose(true), // onSuccess callback - close overlay and skip help dialog
    )
  }

  if (!isVisible) {
    return null
  }

  return (
    <Fade in={isVisible} timeout={300}>
      <Box
        onClick={() => onClose(false)}
        onDragOver={(event) => {
          event.preventDefault()
          event.stopPropagation()
          handleDragOverOrEnter(event, setIsDragActive)
        }}
        onDragEnter={(event) => {
          event.preventDefault()
          event.stopPropagation()
          handleDragOverOrEnter(event, setIsDragActive)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          event.stopPropagation()
          handleDragLeave(event, setIsDragActive)
        }}
        onDrop={handleDrop}
        sx={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: isDragActive ? 'rgba(0, 100, 200, 0.3)' : 'rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          pointerEvents: 'auto',
          margin: '0 !important',
          padding: '0 !important',
          marginLeft: '0 !important',
          marginRight: '0 !important',
          marginTop: '0 !important',
          marginBottom: '0 !important',
          transition: 'background-color 0.2s ease',
          // Create cutout mask for button positions - single mask with multiple holes
          ...(openButtonPosition && shareButtonPosition && {
            WebkitMask: `
              radial-gradient(circle 35px at ${openButtonPosition.left}px ${openButtonPosition.top}px, 
                transparent 0px, transparent 35px, black 36px),
              radial-gradient(circle 35px at ${shareButtonPosition.left}px ${shareButtonPosition.top}px, 
                transparent 0px, transparent 35px, black 36px)
            `,
            WebkitMaskComposite: 'source-in',
            mask: `
              radial-gradient(circle 35px at ${openButtonPosition.left}px ${openButtonPosition.top}px, 
                transparent 0px, transparent 35px, black 36px),
              radial-gradient(circle 35px at ${shareButtonPosition.left}px ${shareButtonPosition.top}px, 
                transparent 0px, transparent 35px, black 36px)
            `,
            maskComposite: 'intersect',
          }),
        }}
        data-testid='onboarding-overlay'
      >
        {/* Open Button Highlight */}
        {openButtonPosition && (
          <OnboardingHighlight
            position={openButtonPosition}
            text="Open models"
            arrowDirection="bottom-right"
          />
        )}

        {/* Share Button Highlight */}
        {shareButtonPosition && (
          <OnboardingHighlight
            position={shareButtonPosition}
            text="Share model"
            arrowDirection="bottom-left"
          />
        )}

        {/* Central Message */}
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 10000,
          }}
        >
          <Stack spacing={3} alignItems='center'>
            <FileUploadIcon
              sx={{
                fontSize: '42rem',
                color: '#ffffff',
                filter: 'drop-shadow(0px 0px 10px rgba(255,255,255,0.3))',
              }}
            />
            <Typography
              variant='h1'
              sx={{
                fontWeight: 600,
                color: isDragActive ? '#00ff88' : '#ffffff',
                textShadow: '2px 2px 8px rgba(0,0,0,0.8)',
                letterSpacing: '0.5px',
                transition: 'color 0.2s ease',
              }}
            >
              {isDragActive ? 'Drop your file here!' : 'Drag and drop models into page to open'}
            </Typography>
            <Typography
              variant='body1'
              sx={{
                color: 'rgba(255,255,255,0.9)',
                textShadow: '1px 1px 4px rgba(0,0,0,0.8)',
                fontSize: '1.1rem',
              }}
            >
              Click anywhere to continue
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Fade>
  )
}


/**
 * Individual highlight component that creates a spotlight effect around UI elements
 *
 * @property {object} position CSS position properties (top, left, right, bottom)
 * @property {string} text Text to display next to the highlight
 * @property {string} arrowDirection Direction the callout should point
 * @return {ReactElement}
 */
function OnboardingHighlight({position, text, arrowDirection}) {
  const theme = useTheme()

  // Create a glowing highlight box
  const highlightSize = 60
  const calloutOffset = 80

  // Determine callout position based on arrow direction
  const getCalloutPosition = () => {
    const calloutHalfWidth = 100 // Half width of callout for centering
    switch (arrowDirection) {
    case 'bottom-right':
      // Position callout to the bottom-right of the highlight circle
      return {
        top: position.top + calloutOffset,
        left: position.left, // Anchor on left edge (top-left of callout)
      }
    case 'bottom-left':
      // Position callout to the bottom-left of the highlight circle
      return {
        top: position.top + calloutOffset,
        right: window.innerWidth - position.left, // Anchor on right edge (top-right of callout)
      }
    case 'bottom':
      return {
        top: position.top + calloutOffset,
        left: position.left - calloutHalfWidth, // Center the callout horizontally
        transform: 'translateX(0)',
      }
    case 'top-left':
      return {
        top: position.top + calloutOffset,
        left: position.left,
      }
    case 'top-right':
      return {
        top: position.top + calloutOffset,
        right: position.right,
      }
    default:
      return {
        top: position.top + calloutOffset,
        left: position.left - calloutHalfWidth,
        transform: 'translateX(0)',
      }
    }
  }

  const calloutPosition = getCalloutPosition()

  return (
    <>
      {/* Spotlight cutout effect - makes icons visible through overlay */}
      <Box
        sx={{
          position: 'absolute',
          width: highlightSize,
          height: highlightSize,
          borderRadius: '50%',
          top: position.top,
          left: position.left,
          transform: 'translate(-50%, -50%)',
          zIndex: 10001, // Above the overlay background
          // Create bright spotlight effect
          backgroundColor: 'rgba(255, 255, 255, 0.9)', // 90% transparent white
          mixBlendMode: 'screen', // Brightens underlying content
          animation: 'onboarding-pulse 2s ease-in-out infinite',
        }}
      />

      {/* Glowing highlight ring */}
      <Box
        sx={{
          position: 'absolute',
          width: highlightSize,
          height: highlightSize,
          borderRadius: '50%',
          backgroundColor: 'transparent',
          border: `3px solid ${theme.palette.primary.main}`,
          boxShadow: `0 0 20px ${theme.palette.primary.main}, 0 0 40px ${theme.palette.primary.main}`,
          animation: 'onboarding-pulse 2s ease-in-out infinite',
          zIndex: 10002, // Above the spotlight
          top: position.top,
          left: position.left,
          transform: 'translate(-50%, -50%)',
        }}
      />

      {/* Text callout */}
      <Paper
        elevation={8}
        sx={{
          position: 'absolute',
          padding: 2,
          backgroundColor: theme.palette.background.paper,
          borderRadius: 2,
          zIndex: 10001,
          maxWidth: 200,
          ...calloutPosition,
        }}
      >
        <Typography
          variant='body2'
          sx={{
            fontWeight: 500,
            color: theme.palette.text.primary,
            textAlign: 'center',
          }}
        >
          {text}
        </Typography>
      </Paper>

      {/* Global styles for pulse animation */}
      <style>
        {`
          @keyframes onboarding-pulse {
            0% {
              box-shadow: 0 0 20px ${theme.palette.primary.main}, 0 0 40px ${theme.palette.primary.main};
              transform: translate(-50%, -50%) scale(1);
            }
            50% {
              box-shadow: 0 0 30px ${theme.palette.primary.main}, 0 0 60px ${theme.palette.primary.main};
              transform: translate(-50%, -50%) scale(1.1);
            }
            100% {
              box-shadow: 0 0 20px ${theme.palette.primary.main}, 0 0 40px ${theme.palette.primary.main};
              transform: translate(-50%, -50%) scale(1);
            }
          }
        `}
      </style>
    </>
  )
}
