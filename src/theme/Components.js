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
            fontWeight: '400',
            backgroundColor: palette.background.button,
          },
        },
        {
          props: {variant: 'component'},
          style: {
            width: '180px',
            height: '40px',
            textTransform: 'none',
            border: 'none',
            fontWeight: '400',
            backgroundColor: palette.background.button,
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
          'margin': '.2em',
          '&.Mui-selected, &.Mui-selected:hover': {
            backgroundColor: palette.background.button,
            opacity: .8,
          },
          '&.MuiToggleButton-root .MuiToggleButton-label > svg': {
            width: '14px',
            height: '14px',
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
          boxShadow: 'none',
        },
      },
      variants: [
        {
          props: {variant: 'control'},
          style: {
            backgroundColor: palette.background.control,
            boxShadow: 'none',
            // boxShadow: '0px 1px 10px -5px rgba(0,0,0,0.2), 0px 1px 1px 0px rgba(0,0,0,0.14), 0px 1px 3px 0px rgba(0,0,0,0.12)',
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
