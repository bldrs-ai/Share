/**
 * @param {object} Mui color palette.
 * @return {object} Mui component overrides.
 */
export function getComponentOverrides(palette, typography) {
  return {
    MuiButton: {
      styleOverrides: {
        root: {
          fontWeight: 400,
        },
      },
      variants: [
        {
          props: {variant: 'rectangular'},
          style: {
            width: '180px',
            height: '40px',
            borderRadius: '10px',
            border: 'none',
            // backgroundColor: palette.primary.main,
            // color: 'white',
          },
        },
      ],
    },
    MuiButtonGroup: {
      variants: [
        {
          props: {variant: 'contained'},
          style: ({theme}) => ({
            boxShadow: theme.shadows[0],
            opacity: .9,
          }),
        },
        {
          props: {variant: 'outlined'},
          style: ({theme}) => ({
            // backgroundColor: theme.palette.primary.main,
            boxShadow: theme.shadows[0],
            opacity: .9,
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
          // color: 'white',
          // backgroundColor: palette.primary.main,
          maxWidth: '20em',
          borderRadius: '10px',
        },
      },
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
          opacity: .9,
        },
      },
    },
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            // color: palette.primary.contrastText,
            // backgroundColor: palette.primary.main,
            borderRadius: '5px',
          },
          '& > div.MuiTreeItem-content': {
            borderRadius: '5px',
          },
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        sizeMedium: {
          'width': '40px',
          'height': '40px',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: palette.secondary.dark,
            opacity: .9,
          },
        },
        sizeSmall: {
          border: 'none',
          width: '30px',
          height: '30px',
        },
      },
      variants: [
        {
          props: {variant: 'rounded'},
          style: {
            'width': '40px',
            'height': '40px',
            'borderRadius': '10px',
            'border': 'none',
            // 'backgroundColor': palette.scene.background,
            '&.Mui-selected, &.Mui-selected:hover': {
              // backgroundColor: palette.primary.main,
              opacity: .9,
            },
          },
        },
        {
          props: {variant: 'solid'},
          style: {
            'borderRadius': '0px',
            '&.Mui-selected, &.Mui-selected:hover': {
              // backgroundColor: palette.scene.background,
              opacity: .9,
            },
          },
        },
        {
          props: {variant: 'noBackground'},
          style: {
            'width': '40px',
            'height': '40px',
            'borderRadius': '10px',
            'border': 'none',
            'margin': '0px 4px 2px 0px',
            // 'backgroundColor': palette.scene.background,
            '&.Mui-selected, &.Mui-selected:hover': {
              // backgroundColor: palette.primary.main,
              opacity: .9,
            },
          },
        },
      ],
    },
  }
}
