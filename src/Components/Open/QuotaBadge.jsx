import React, {ReactElement} from 'react'
import {Badge} from '@mui/material'
import {TIERS} from '../../OPFS/quota'


/** Show badge once this fraction of the quota is consumed */
const SHOW_THRESHOLD = 1 / 2
/** Switch badge to amber once this fraction is consumed */
const WARN_THRESHOLD = 3 / 4


/**
 * Wraps children with a usage-quota badge on the Open toolbar button.
 * Shown only when >= 50% of the quota is used; turns amber at >= 75%.
 *
 * @property {number} used Number of private models loaded this period
 * @property {number} limit Maximum allowed for this tier
 * @property {string} tier One of TIERS.*
 * @property {ReactElement} children The button to wrap
 * @return {ReactElement}
 */
export default function QuotaBadge({used, limit, tier, children}) {
  if (tier === TIERS.PAID || limit === Infinity || used === 0) {
    return children
  }

  const pct = used / limit
  if (pct < SHOW_THRESHOLD) {
    return children
  }

  return (
    <Badge
      badgeContent={`${used}/${limit}`}
      color={pct >= WARN_THRESHOLD ? 'warning' : 'default'}
      sx={{'& .MuiBadge-badge': {fontSize: '0.6rem', height: '16px', minWidth: '30px', right: -4, top: 4}}}
    >
      {children}
    </Badge>
  )
}
