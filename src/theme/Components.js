/**
 * @param {object} Mui color palette.
 * @return {object} Mui component overrides.
 */
export function getComponentOverrides(palette, typography) {
  return {
    MuiAutocomplete: {
      styleOverrides: {
        root: {
          // To align 'Search' placeholder with top row buttons
          margin: '5px',
          padding: '5px',
        },
        // TODO(pablo): We set MuiIcon button styles below for convenience, but it
        // means resetting other uses like these.
        clearIndicator: {
          width: '1em',
          height: '1em',
          margin: 0,
          padding: 0,
          // border: 'solid 3px blue',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 400,
        },
      },
      variants: [{
        props: {variant: 'rectangular'},
        style: {
          width: '180px',
          height: '40px',
          borderRadius: '10px',
          border: 'none',
        },
      }],
    },
    MuiButtonGroup: {
      variants: [{
        props: {orientation: 'horizontal'},
        style: {
          '& .MuiButtonBase-root + .MuiButtonBase-root': {
            marginLeft: '0.25em', // same as vertical
          },
        },
      }, {
        props: {orientation: 'vertical'},
        style: {
          '& .MuiButtonBase-root + .MuiButtonBase-root': {
            marginTop: '0.25em', // same as horizontal
          },
        },
      }, {
        props: {variant: 'controls'},
        style: {},
      }, {
        props: {variant: 'contained'},
        style: ({theme}) => ({
          boxShadow: theme.shadows[0],
        }),
      }, {
        props: {variant: 'outlined'},
        style: ({theme}) => ({
          boxShadow: theme.shadows[0],
        }),
      }],
    },
    MuiIconButton: {
      styleOverrides: {
        root: StandardButton, // Same as MuiToggleButton
      },
    },
    MuiInputBase: {
      variants: [
        {
          props: {variant: 'edit'},
          style: ({theme}) => ({
            border: `1px solid ${theme.palette.primary.main}`,
            padding: '.5em',
            borderRadius: '10px',
          }),
        },
      ],
    },
    MuiCard: {
      styleOverrides: {
        root: {
          // ?? Mui cards don't seem to have theme support for color grading
          // the different elts.
          // background: palette.secondary.main,
          width: '100%',
        },
      },
    },
    MuiCardContent: {
      styleOverrides: {
        root: {
          // 'padding': '0px 20px',
          '& img': {
            width: '100%',
          },
          // TODO(pablo): react-markdown has leading margin on first elt
          '& p': {
            marginTop: 0,
          },
          // TODO(pablo): react-markdown sets smaller?
          'fontSize': '1rem',
          'lineHeight': 1.5,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: '10px',
        },
      },
    },
    MuiDialogActions: {
      styleOverrides: {
        root: {
          justifyContent: 'center',
          padding: '1em 0px',
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '0px 10px',
          overflowX: 'hidden',
        },
      },
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 400,
          textAlign: 'center',
        },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: {
          padding: '0.5em 0',
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: ({theme}) => ({
          '&.Mui-selected': {
            backgroundColor: theme.palette.secondary.dark,
            fontWeight: 'bold',
          },
          '&.Mui-selected:hover': {
            // TODO(pablo): merge with above. Can't figure out combined selector
            backgroundColor: theme.palette.secondary.dark,
            fontWeight: 'bold',
            fontStyle: 'italic',
          },
        }),
      },
    },
    MuiPaper: {
      variants: [
        {
          props: {variant: 'control'},
          style: ({ownerState, theme}) => ({
            boxShadow: theme.shadows[ownerState.elevation],
          }),
        },
        {
          props: {variant: 'background'},
          style: ({ownerState, theme}) => ({
            boxShadow: theme.shadows[ownerState.elevation],
            padding: '10px',
          }),
        },
        /* {
          props: {variant: 'note'},
          style: {
            marginBottom: '10px',
            backgroundColor: 'yellow',
          },
        }, */
      ],
    },
    MuiSelect: {
      styleOverrides: {
        root: {
          // background: palette.primary.main,
        },
      },
    },
    MuiSnackbarContent: {
      styleOverrides: {
        root: {
          // backgroundColor: palette.primary.main,
          borderRadius: '10px',
        },
      },
    },
    MuiSvgIcon: {
      variants: [{
        // Used in HelpControl to indicate activity state
        props: {variant: 'success'},
        style: {
          color: palette.success.main,
        },
      }],
    },
    MuiSwitch: {
      styleOverrides: {
        track: {
          border: `solid 1px ${palette.secondary.contrastText}`,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          // backgroundColor: palette.primary.main,
          borderRadius: '10px',
          // opacity: .9,
        },
      },
    },
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: palette.secondary.contrastText,
            backgroundColor: palette.secondary.active,
          },
          '& > div.MuiTreeItem-content': {
            borderRadius: '0px',
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: StandardButton, // Same as MuiIconButton
      },
      variants: [{
        props: {variant: 'control'},
        style: {
        },
      }],
    },
  }
}


const StandardButton = {
  fontSize: '1rem',
  width: '3em',
  height: '3em',
  borderRadius: '10px',
  margin: '5px',
  padding: '5px',
  border: 'none',
}
