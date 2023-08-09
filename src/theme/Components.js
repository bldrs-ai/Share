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
    MuiToggleButton: {
      styleOverrides: {
        sizeMedium: {
          'width': '50px',
          'height': '50px',
          'border': 'none',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: palette.primary.background,
            opacity: .8,
          },
        },
        sizeSmall: {
          border: 'none',
          width: '40px',
          height: '40px',
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
          height: '240px',
          padding: '0px 10px',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
        },
      },
      variants: [
        {
          props: {variant: 'control'},
          style: {
            backgroundColor: palette.primary.background,
          },
        },
        {
          props: {variant: 'note'},
          style: {
            backgroundColor: palette.scene.background,
          },
        },
      ],
    },
    MuiTab: {
      styleOverrides: {
        root: {
          'textTransform': 'none',
          'minWidth': 0,
          'fontSize': '.9em',
          'fontWeight': typography.fontWeight,
          'marginRight': 0,
          'color': palette.primary.contrastText,
          'fontFamily': typography.fontFamily,
          '&:hover': {
            color: palette.secondary.main,
          },
          '&.Mui-selected': {
            color: palette.secondary.main,
            fontWeight: typography.fontWeight,
          },
          '&.Mui-focusVisible': {
            backgroundColor: 'green',
          },
          '@media (max-width: 700px)': {
            fontSize: '.7em',
          },
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        root: {
          '& .MuiTabs-indicator': {
            backgroundColor: palette.secondary.main,
          },
        },
      },
    },

    MuiCardActions: {
      styleOverrides: {
        root: {
        },
      },
    },
  }
}
