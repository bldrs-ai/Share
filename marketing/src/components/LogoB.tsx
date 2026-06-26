import {SvgIcon, type SvgIconProps} from '@mui/material'


/**
 * Bldrs "B" mark. Inlined here instead of imported from the SPA's
 * src/assets/LogoB.svg so the marketing build stays self-contained
 * (no shared asset paths, no theme-aware logo coloring to maintain).
 *
 * Lime left face + white front face. If we want a light-mode variant
 * later, swap to theme-aware colors via sx props.
 */
export default function LogoB(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 68 90" {...props}>
      <g>
        <path
          fill="#00FF00"
          stroke="black"
          strokeWidth="0.5"
          d="M17.9675 2L4.93939 8.07977V87.9853H17.9675V2Z"
        />
        <path
          fill="#00FF00"
          stroke="black"
          strokeWidth="0.5"
          d="M19.5708 43.6635V87.9538L36.2068 87.9852L36.2541 39.292L19.5708 43.6635Z"
        />
        <path
          fill="white"
          stroke="black"
          strokeWidth="0.5"
          d="M17.9675 2L45.7607 4.9999V40.2734L36.2068 39.3472L19.5707 43.6636V87.9853H17.9675V2Z"
        />
        <path
          fill="white"
          stroke="black"
          strokeWidth="0.5"
          d="M36.1648 39.292L36.2068 87.9852H64V42.0577L36.1648 39.292Z"
        />
      </g>
    </SvgIcon>
  )
}
