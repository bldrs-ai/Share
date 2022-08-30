import {act} from '@testing-library/react'


/**
 * General fix for act warnings.
 * See https://kentcdodds.com/blog/fix-the-not-wrapped-in-act-warning
 */
export async function actAsyncFlush() {
  await act(async () => await Promise.resolve())
}
