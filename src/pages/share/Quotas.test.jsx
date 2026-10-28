import React from 'react'
import {render, screen, within} from '@testing-library/react'
import {HelmetStoreRouteThemeCtx} from '../../Share.fixture'
import Quotas from './Quotas'


describe('pages/share/Quotas', () => {
  // Owner's wording for the signed-out tier (2026-10-28), shared with the
  // pricing page through quota/tierCopy.js.
  it('lists the signed-out tier\'s four lines, with the benchmark linked, and no export', () => {
    render(<HelmetStoreRouteThemeCtx><Quotas/></HelmetStoreRouteThemeCtx>)

    const list = screen.getByTestId('quotas-signed-out')
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Open local models in your browser. No waiting for upload',
      'IFC and STEP loaded by our Conway engine, fastest in the industry (see the benchmark)',
      'USD, GLB, STL, OBJ and many others also supported',
      'Public Google Drive and GitHub models — unlimited open and share',
    ])
    expect(within(list).getByRole('link', {name: 'see the benchmark'})).toHaveAttribute('href', '/share/about/conway')
    expect(list.textContent).not.toMatch(/export/i)
  })

  it('says public models export unlimited and local files take a slot', () => {
    render(<HelmetStoreRouteThemeCtx><Quotas/></HelmetStoreRouteThemeCtx>)

    const exports = screen.getByTestId('quotas-exports')
    expect(exports).toHaveTextContent('Public models: unlimited export, no slot')
    expect(exports).toHaveTextContent('A file from your computer takes a slot the first time you export it')
  })
})
