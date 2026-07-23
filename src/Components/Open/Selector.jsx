import React, {ReactElement, useEffect, useRef, useState} from 'react'
import {Divider, IconButton, MenuItem, Stack, TextField, Typography} from '@mui/material'
import {
  Close as ClearIcon,
  KeyboardArrowLeft as PrevIcon,
  KeyboardArrowRight as NextIcon,
} from '@mui/icons-material'
import {disablePageReloadApprovalCheck} from '../../utils/event'


const DEBOUNCE_MS = 300
const OTHER_VALUE = '__other__'
/** Sentinel option values for the dropdown pager rows. */
const PREV_VALUE = '__prev__'
const NEXT_VALUE = '__next__'
/** Options shown per dropdown page before the prev/next pager appears. */
const PAGE_SIZE = 10


/**
 * @property {string} label component title
 * @property {boolean|string|number} selected selected component control the selected value of the component
 * @property {Function} setSelected callback to select the element; receives index (number) from dropdown or string from Other... mode
 * @property {Array} list list of elements to populate select options
 * @property {Function} [validate] Optional async fn (value: string) => boolean. When provided, adds "Other..." option.
 * @property {string} [emptyText] Placeholder shown when list is empty. Default: '<None>'
 * @property {Function} [onClear] Optional. When provided and a value is selected, shows a
 *   clear (×) affordance on the dropdown; the parent handles the reset (e.g. cascading clear).
 * @property {string} [data-testid] id for testing
 * @return {ReactElement}
 */
export default function Selector({
  label,
  selected,
  setSelected,
  list,
  validate,
  emptyText = '<None>',
  onClear,
  ...props
}) {
  const [isTextMode, setIsTextMode] = useState(false)
  const [inputText, setInputText] = useState('')
  const [validationStatus, setValidationStatus] = useState('idle')
  const [page, setPage] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const pagerClickRef = useRef(false)
  const debounceRef = useRef(null)
  const textInputRef = useRef(null)

  // Reset to the first page whenever the option set changes (e.g. a new
  // org is picked and the repo list is replaced).
  useEffect(() => {
    setPage(0)
  }, [list])

  const handleSelect = (e) => {
    const value = e.target.value
    // Pager rows change the visible page without selecting or closing —
    // pagerClickRef tells onClose to keep the menu open (see the Select).
    if (value === PREV_VALUE || value === NEXT_VALUE) {
      pagerClickRef.current = true
      const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
      setPage((p) => {
        const next = value === PREV_VALUE ? p - 1 : p + 1
        return Math.min(pageCount - 1, Math.max(0, next))
      })
      return
    }
    if (value === OTHER_VALUE) {
      setIsTextMode(true)
      setInputText('')
      setValidationStatus('idle')
      setPage(0)
      return
    }
    disablePageReloadApprovalCheck()
    setSelected(value)
  }

  const handleTextChange = (e) => {
    const value = e.target.value
    setInputText(value)
    setPage(0)
    setValidationStatus('idle')

    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    const query = value.trim().toLowerCase()
    if (!query) {
      return
    }
    // The live filter below already handles names present in the list, so
    // only fall back to async validation for a typed value that is NOT in
    // the list (e.g. an exact repo the API can resolve but wasn't fetched).
    const hasListMatch = list.some((item) => item !== null && item !== undefined && String(item).toLowerCase().includes(query))
    if (hasListMatch || !validate) {
      return
    }
    setValidationStatus('checking')
    debounceRef.current = setTimeout(async () => {
      try {
        const found = await validate(value.trim())
        setValidationStatus(found ? 'found' : 'no-match')
      } catch {
        setValidationStatus('no-match')
      }
    }, DEBOUNCE_MS)
  }

  const handleAccept = () => {
    if (validationStatus === 'found') {
      disablePageReloadApprovalCheck()
      setValidationStatus('idle')
      setSelected(inputText.trim())
    }
  }

  const handleClear = () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setIsTextMode(false)
    setInputText('')
    setValidationStatus('idle')
  }

  // Pick one of the live-filtered matches by its index into the full list.
  const selectMatch = (index) => {
    disablePageReloadApprovalCheck()
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    setIsTextMode(false)
    setInputText('')
    setValidationStatus('idle')
    setSelected(index)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      // Enter accepts an EXACT (case-insensitive) in-list match — e.g.
      // "test-models" selects that entry even though it's also a prefix of
      // "test-models-private". A prefix-only query is left as-is so the user
      // keeps typing; the API-validate fallback still handles out-of-list names.
      const typed = inputText.trim().toLowerCase()
      const exactIdx = list.findIndex((item) => typeof item === 'string' && item.toLowerCase() === typed)
      if (exactIdx >= 0) {
        selectMatch(exactIdx)
        return
      }
      handleAccept()
    } else if (e.key === 'Escape') {
      handleClear()
    }
  }

  const handleBlur = () => {
    if (validationStatus === 'found') {
      handleAccept()
    }
  }

  useEffect(() => {
    if (isTextMode) {
      textInputRef.current?.focus()
    }
  }, [isTextMode])

  useEffect(() => () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
  }, [])

  if (isTextMode) {
    let statusColor = 'text.secondary'
    let statusText = null
    if (validationStatus === 'checking') {
      statusText = 'Checking...'
    } else if (validationStatus === 'found') {
      statusColor = 'success.main'
      statusText = 'Found'
    } else if (validationStatus === 'no-match') {
      statusText = 'No match'
      statusColor = 'error.main'
    }

    // Live-filter the list by the typed query, then paginate the matches
    // (same PAGE_SIZE + pager as the dropdown). Empty query shows the full
    // list so the text input doubles as a paged browser.
    const query = inputText.trim().toLowerCase()
    const matches = list
      .map((item, i) => ({item, i}))
      .filter(({item}) => item !== null && item !== undefined && item !== '' &&
        (query === '' || String(item).toLowerCase().includes(query)))
    const matchPageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE))
    const matchPage = Math.min(page, matchPageCount - 1)
    const matchStart = matchPage * PAGE_SIZE
    const visibleMatches = matches.slice(matchStart, matchStart + PAGE_SIZE)

    return (
      <Stack sx={{marginBottom: '.5em', width: '100%'}}>
        <TextField
          inputRef={textInputRef}
          value={inputText}
          variant='outlined'
          label={label}
          size='small'
          sx={{
            'width': '100%',
            '& .MuiOutlinedInput-root': {paddingRight: '6px'},
          }}
          InputProps={{
            endAdornment: (
              <IconButton
                onMouseDown={(e) => e.preventDefault()}
                onClick={handleClear}
                data-testid={`selector-clear-${label.toLowerCase()}`}
                sx={{width: '28px', height: '28px', padding: 0, margin: 0}}
              >
                <ClearIcon fontSize='small'/>
              </IconButton>
            ),
          }}
          {...props}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
        />
        {statusText && (
          <Typography variant='caption' sx={{color: statusColor, ml: 1, mt: 0.25}}>
            {statusText}
          </Typography>
        )}
        {visibleMatches.length > 0 && (
          <Stack
            data-testid={`selector-matches-${label.toLowerCase()}`}
            sx={{
              mt: 0.25,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              maxHeight: '320px',
              overflowY: 'auto',
            }}
          >
            {matches.length > PAGE_SIZE && (
              <Stack
                direction='row'
                sx={{alignItems: 'center', justifyContent: 'space-between', px: 1, py: 0.25}}
              >
                <IconButton
                  size='small'
                  aria-label='previous page'
                  data-testid={`selector-prev-${label.toLowerCase()}`}
                  disabled={matchPage === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPage(Math.max(0, matchPage - 1))}
                >
                  <PrevIcon fontSize='small'/>
                </IconButton>
                <Typography variant='caption' sx={{color: 'text.secondary'}}>
                  {`${matchStart + 1}–${matchStart + visibleMatches.length} of ${matches.length}`}
                </Typography>
                <IconButton
                  size='small'
                  aria-label='next page'
                  data-testid={`selector-next-${label.toLowerCase()}`}
                  disabled={matchPage >= matchPageCount - 1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setPage(Math.min(matchPageCount - 1, matchPage + 1))}
                >
                  <NextIcon fontSize='small'/>
                </IconButton>
              </Stack>
            )}
            {visibleMatches.map(({item, i}) => (
              <MenuItem
                key={i}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectMatch(i)}
              >
                <Typography variant='p'>{item}</Typography>
              </MenuItem>
            ))}
          </Stack>
        )}
      </Stack>
    )
  }

  const isEmpty = list.length === 0
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const clampedPage = Math.min(page, pageCount - 1)
  const pageStart = clampedPage * PAGE_SIZE
  const pageEnd = Math.min(pageStart + PAGE_SIZE, list.length)
  const pageItems = list.slice(pageStart, pageEnd)
  const isPaged = list.length > PAGE_SIZE

  return (
    <TextField
      value={isEmpty ? '' : selected}
      onChange={(e) => handleSelect(e)}
      variant='outlined'
      label={label}
      select
      size='small'
      sx={{
        'width': '100%',
        'marginBottom': '.5em',
        '& .MuiSelect-select': {textAlign: 'left'},
      }}
      SelectProps={isEmpty ? {
        displayEmpty: true,
        renderValue: () => <span style={{opacity: 1}}>{emptyText}</span>,
      } : {
        open: isOpen,
        onOpen: () => {
          // Jump to the page holding the current selection so its row is
          // rendered (keeps the highlight correct, avoids MUI's
          // out-of-range warning) and paging starts from context.
          if (typeof selected === 'number' && selected >= 0) {
            setPage(Math.floor(selected / PAGE_SIZE))
          }
          setIsOpen(true)
        },
        onClose: () => {
          // A pager row requested a page change — keep the menu open.
          if (pagerClickRef.current) {
            pagerClickRef.current = false
            return
          }
          setIsOpen(false)
        },
        // Derive the field label straight from the value so a selection on
        // any page still shows once the menu closes / repaginates. `?? ''`
        // keeps a stale/out-of-range index from rendering `undefined`.
        renderValue: (val) => (typeof val === 'number' ? (list[val] ?? '') : (val ?? '')),
      }}
      InputProps={(onClear && !isEmpty && selected !== '' && selected !== null && selected !== undefined) ? {
        endAdornment: (
          <IconButton
            aria-label='clear'
            data-testid={`selector-clear-select-${label.toLowerCase()}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              onClear()
            }}
            sx={{mr: 2.5, p: 0.25}}
          >
            <ClearIcon fontSize='small'/>
          </IconButton>
        ),
      } : undefined}
      InputLabelProps={isEmpty ? {shrink: true} : undefined}
      {...props}
    >
      {isEmpty ? (
        <MenuItem value='' disabled>
          <Typography variant='p'>{emptyText}</Typography>
        </MenuItem>
      ) : [
        ...(validate ? [
          <MenuItem key='other' value={OTHER_VALUE}>
            <Typography variant='p'>Enter name...</Typography>
          </MenuItem>,
          <Divider key='divider'/>,
        ] : []),
        ...(isPaged ? [
          <MenuItem
            key='prev'
            value={PREV_VALUE}
            disabled={clampedPage === 0}
            data-testid={`selector-prev-${label.toLowerCase()}`}
          >
            <PrevIcon fontSize='small' sx={{mr: 0.5}}/>
            <Typography variant='caption'>
              {`Prev · ${pageStart + 1}–${pageEnd} of ${list.length}`}
            </Typography>
          </MenuItem>,
          <MenuItem
            key='next'
            value={NEXT_VALUE}
            disabled={clampedPage >= pageCount - 1}
            data-testid={`selector-next-${label.toLowerCase()}`}
          >
            <NextIcon fontSize='small' sx={{mr: 0.5}}/>
            <Typography variant='caption'>Next</Typography>
          </MenuItem>,
          <Divider key='pager-divider'/>,
        ] : []),
        ...pageItems.map((listMember, j) => {
          const globalIndex = pageStart + j
          if (listMember === null || listMember === undefined) {
            return null
          }
          return (
            <MenuItem key={globalIndex} value={globalIndex}>
              <Typography variant='p'>{listMember}</Typography>
            </MenuItem>
          )
        }),
      ]}
    </TextField>
  )
}
