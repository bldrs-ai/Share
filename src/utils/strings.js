export function stoi(s) {
  const i = parseInt(s)
  if (!isFinite(i)) {
    throw new Error('Expected integer, got: ' + s)
  }
  return i
}
