/**
 * Setup Esbuild watch for hot reloading.
 */
export default function setupEsbuildWatch() {
  const isEsbuildWatchEnabled = process.env.ESBUILD_WATCH
  if (isEsbuildWatchEnabled) {
    new EventSource('/esbuild').addEventListener('change', () => location.reload())
  }
}
