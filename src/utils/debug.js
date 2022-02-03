const DEBUG_LEVEL = 4;
export default function debug(level = 0) {
  return level < DEBUG_LEVEL ? console : {log: () => {}};
}
