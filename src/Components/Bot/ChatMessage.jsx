// ChatMessage.jsx
import React, {ReactElement} from 'react'
import {
  Box,
  Typography,
  Avatar,
  useTheme,
  Paper,
  Stack,
} from '@mui/material'
import dayjs from 'dayjs' // tiny date-format helper (2 kB gzip)


/** @return {ReactElement} */
export default function ChatMessage({
  /* REQUIRED */
  position = 'left', // 'left' | 'right'
  text = '',
  type = 'text', // 'text' | 'image' | 'system' (future)
  /* OPTIONAL */
  title,
  titleColor,
  avatar, // string URL or React element
  date,
  notch = true,
  style = {},
}) {
  const theme = useTheme()

  /* bubble colours (theme-aware) */
  const userBg = theme.palette.primary.main // right side
  const userFg = theme.palette.primary.contrastText
  const botBg = theme.palette.mode === 'dark' ?
    theme.palette.grey[700] :
    theme.palette.grey[200]
  const botFg = theme.palette.getContrastText(botBg)

  const isUser = position === 'right'
  const bg = isUser ? userBg : botBg
  const fg = isUser ? userFg : botFg

  /* notch triangle (pseudo-element) */
  const notchSize = 8

  return (
    <Stack
      direction={isUser ? 'row-reverse' : 'row'}
      alignItems="flex-end"
      spacing={2}
    >
      {/* avatar only if supplied */}
      {avatar && (
        typeof avatar === 'string' ?
          <Avatar src={avatar}/> :
          avatar
      )}

      {/* bubble */}
      <Box sx={{position: 'relative', maxWidth: '80%', ...style, backgroundColor: 'none'}}>
        <Paper
          elevation={0}
          sx={{
            backgroundColor: bg,
            color: fg,
            px: 2,
            py: 1,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
            maxWidth: '100%',
            borderRadius: 2,
            ...(position === 'right' ?
              {borderTopLeftRadius: 12, borderTopRightRadius: 0, borderBottomLeftRadius: 12, borderBottomRightRadius: 12} :
              {borderTopLeftRadius: 0, borderTopRightRadius: 12, borderBottomLeftRadius: 12, borderBottomRightRadius: 12}),
          }}
        >
          {title && (
            <Typography
              variant="caption"
              sx={{
                color: titleColor || fg,
                fontWeight: 600,
                display: 'block',
                marginBottom: 0.5,
              }}
            >
              {title}
            </Typography>
          )}

          {type === 'text' && (
            <Typography
              variant="body2"
              sx={{
                color: fg,
                fontSize: '0.9rem',
                lineHeight: 1.4,
              }}
            >
              {text}
            </Typography>
          )}

          {date && (
            <Typography
              variant="caption"
              sx={{
                mt: 0.5,
                opacity: 0.65,
                display: 'block',
                textAlign: 'right',
                fontSize: '0.7rem',
              }}
            >
              {dayjs(date).format('HH:mm')}
            </Typography>
          )}
        </Paper>


        {notch && (
          <Box
            sx={{
              position: 'absolute',
              width: 0,
              height: 0,
              borderStyle: 'solid',
              ...(isUser ?
                {
                  right: -notchSize,
                  borderWidth: `${notchSize}px 0 ${notchSize}px ${notchSize}px`,
                  borderColor: `transparent transparent transparent ${bg}`,
                } :
                {
                  left: -notchSize,
                  borderWidth: `${notchSize}px ${notchSize}px ${notchSize}px 0`,
                  borderColor: `transparent ${bg} transparent transparent`,
                }),
            }}
          />
        )}
      </Box>
    </Stack>
  )
}
