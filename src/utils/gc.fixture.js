import v8 from 'v8'
import vm from 'vm'


// V8's own GC for retention tests (open-205: what an in-app model switch
// frees), set up the way engineSourceRetention.test.js does: `--expose-gc` at
// runtime, `gc` fetched from a fresh context, the flag put back so later
// files in this worker don't get a global `gc`.
v8.setFlagsFromString('--expose-gc')
const gc = vm.runInNewContext('gc')
v8.setFlagsFromString('--no-expose-gc')


/** @return {Promise<void>} a turn of the event loop */
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}


/**
 * Force GCs until `ref`'s target is gone, or ten have run. A WeakRef is
 * cleared only by a GC after the task that last dereferenced it, hence the
 * turn before each.
 *
 * @param {WeakRef} ref
 * @return {Promise<boolean>} whether the target was collected
 */
export async function isCollected(ref) {
  for (let i = 0; i < 10; i++) {
    await tick()
    gc()
    if (ref.deref() === undefined) {
      return true
    }
  }
  return false
}
