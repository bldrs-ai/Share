/**
 * Setup Esbuild watch for hot reloading.
 */
export default function setupEsbuildWatch() {
  const isEsbuildWatchEnabled = process.env.ESBUILD_WATCH
  if (isEsbuildWatchEnabled) {
    console.warn('Esbuild hot reload ENABLED')
    new EventSource('/esbuild').addEventListener('change', () => location.reload())
  } else {
    console.warn('Esbuild hot reload DISABLED')
  }
}
