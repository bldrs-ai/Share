/**
 * @param {object} Mui color palette.
 * @return {object} Mui component overrides.
 */
export function getComponentOverrides(palette, typography) {
  return {
    MuiTreeItem: {
      styleOverrides: {
        root: {
          '& > div.Mui-selected, & > div.Mui-selected:hover': {
            color: palette.primary.contrastText,
            backgroundColor: palette.primary.main,
            borderRadius: '5px',
          },
          '& > div.MuiTreeItem-content': {
            borderRadius: '5px',
          },
        },
      },
    },
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
            textTransform: 'none',
            border: 'none',
            backgroundColor: palette.primary.main,
          },
        },
      ],
      defaultProps: {
        disableElevation: true,
        disableFocusRipple: true,
        disableRipple: true,
      },
    },
    MuiButtonGroup: {
      variants: [
        {
          props: {variant: 'contained'},
          style: ({theme}) => ({
            backgroundColor: theme.palette.primary.background,
            boxShadow: theme.shadows[1],
            opacity: .9,
          }),
        },
      ],
    },
    MuiToggleButton: {
      styleOverrides: {
        sizeMedium: {
          'width': '40px',
          'height': '40px',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: palette.secondary.background,
            opacity: .9,
          },
        },
        sizeSmall: {
          border: 'none',
          width: '24px',
          height: '24px',
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        root: {
        },
      },
    },
    MuiDialogContent: {
      styleOverrides: {
        root: {
          padding: '0px 10px',
        },
      },
    },
    MuiPaper: {
      variants: [
        {
          props: {variant: 'control'},
          style: ({ownerState, theme}) => ({
            backgroundColor: palette.secondary.background,
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
        {
          props: {variant: 'note'},
          style: {
            backgroundColor: palette.scene.background,
            marginBottom: '10px',
          },
        },
      ],
    },
    MuiDialogTitle: {
      styleOverrides: {
        root: {
          fontWeight: 400,
          textAlign: 'center',
          capitalize: 'none',
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
    MuiSwitch: {
      root: {
        width: 42,
        height: 26,
        padding: 0,
        margin: 8,
      },
      switchBase: {
        'padding': 1,
        '&$checked, &$colorPrimary$checked, &$colorSecondary$checked': {
          'transform': 'translateX(16px)',
          'color': '#fff',
          '& + $track': {
            opacity: 1,
            border: 'none',
          },
        },
      },
      thumb: {
        width: 24,
        height: 24,
      },
      track: {
        borderRadius: 13,
        border: '1px solid #bdbdbd',
        backgroundColor: '#fafafa',
        opacity: 1,
        transition: 'background-color 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms,border 300ms cubic-bezier(0.4, 0, 0.2, 1) 0ms',
      },
    },
  }
}
