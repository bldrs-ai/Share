/**
 * @param {object} Mui color palette.
 * @return {object} Mui component overrides.
 */
export function getComponentOverrides(palette) {
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
    MuiCardActions: {
      styleOverrides: {
        root: {
        },
      },
    },
  }
}
