/**
 * Theme definitions — 3 themes × 2 modes = 6 variants.
 * Applied as CSS custom properties on document.documentElement.
 */

export const themes = [
  {
    name: 'Green',
    icon: 'Leaf',
    light: {
      '--color-bg': '#ffffff',
      '--color-surface': '#f5f5f5',
      '--color-surface-hover': '#eeeeee',
      '--color-text': '#101010',
      '--color-text-secondary': '#555555',
      '--color-border': '#e0e0e0',
      '--color-primary': '#00ff00',
      '--color-primary-hover': '#00cc00',
      '--color-primary-text': '#000000',
      '--color-scene-bg': '#f0f0f0',
      '--color-toolbar-bg': 'rgba(245,245,245,0.88)',
      '--color-toolbar-border': 'rgba(0,0,0,0.08)',
      '--color-selected': 'rgba(0,255,0,0.15)',
      '--color-highlight': '#00F0FF',
    },
    dark: {
      '--color-bg': '#1a1a1a',
      '--color-surface': '#252525',
      '--color-surface-hover': '#2e2e2e',
      '--color-text': '#e0e0e0',
      '--color-text-secondary': '#888888',
      '--color-border': '#333333',
      '--color-primary': '#00ff00',
      '--color-primary-hover': '#33ff33',
      '--color-primary-text': '#000000',
      '--color-scene-bg': '#1a1a1a',
      '--color-toolbar-bg': 'rgba(26,26,26,0.88)',
      '--color-toolbar-border': 'rgba(255,255,255,0.08)',
      '--color-selected': 'rgba(0,255,0,0.15)',
      '--color-highlight': '#00F0FF',
    },
  },
  {
    name: 'Yello',
    icon: 'Zap',
    light: {
      '--color-bg': '#FEFBF4',
      '--color-surface': '#F5F0E6',
      '--color-surface-hover': '#EDE7D9',
      '--color-text': '#1C1A14',
      '--color-text-secondary': '#6B6555',
      '--color-border': '#E5DFD0',
      '--color-primary': '#E5A000',
      '--color-primary-hover': '#CC8E00',
      '--color-primary-text': '#000000',
      '--color-scene-bg': '#F5F0E6',
      '--color-toolbar-bg': 'rgba(254,251,244,0.88)',
      '--color-toolbar-border': 'rgba(0,0,0,0.06)',
      '--color-selected': 'rgba(229,160,0,0.15)',
      '--color-highlight': '#00F0FF',
    },
    dark: {
      '--color-bg': '#1C1A14',
      '--color-surface': '#28251C',
      '--color-surface-hover': '#332F24',
      '--color-text': '#E5DFD0',
      '--color-text-secondary': '#8A8472',
      '--color-border': '#3A3628',
      '--color-primary': '#E5A000',
      '--color-primary-hover': '#FFB520',
      '--color-primary-text': '#000000',
      '--color-scene-bg': '#1C1A14',
      '--color-toolbar-bg': 'rgba(28,26,20,0.88)',
      '--color-toolbar-border': 'rgba(255,255,255,0.06)',
      '--color-selected': 'rgba(229,160,0,0.15)',
      '--color-highlight': '#00F0FF',
    },
  },
  {
    name: 'Blue',
    icon: 'Droplets',
    light: {
      '--color-bg': '#F8FAFC',
      '--color-surface': '#EFF4F8',
      '--color-surface-hover': '#E2EAF2',
      '--color-text': '#0F172A',
      '--color-text-secondary': '#475569',
      '--color-border': '#CBD5E1',
      '--color-primary': '#3B82F6',
      '--color-primary-hover': '#2563EB',
      '--color-primary-text': '#ffffff',
      '--color-scene-bg': '#EFF4F8',
      '--color-toolbar-bg': 'rgba(248,250,252,0.88)',
      '--color-toolbar-border': 'rgba(0,0,0,0.06)',
      '--color-selected': 'rgba(59,130,246,0.15)',
      '--color-highlight': '#00F0FF',
    },
    dark: {
      '--color-bg': '#0F172A',
      '--color-surface': '#1E293B',
      '--color-surface-hover': '#273548',
      '--color-text': '#E2E8F0',
      '--color-text-secondary': '#94A3B8',
      '--color-border': '#334155',
      '--color-primary': '#3B82F6',
      '--color-primary-hover': '#60A5FA',
      '--color-primary-text': '#ffffff',
      '--color-scene-bg': '#0F172A',
      '--color-toolbar-bg': 'rgba(15,23,42,0.88)',
      '--color-toolbar-border': 'rgba(255,255,255,0.06)',
      '--color-selected': 'rgba(59,130,246,0.15)',
      '--color-highlight': '#00F0FF',
    },
  },
]


const THEME_KEY = 'bldrs-theme'
const MODE_KEY = 'bldrs-mode'


/**
 * Apply a theme's CSS custom properties to the document root.
 */
export function applyTheme(themeIndex, mode) {
  const theme = themes[themeIndex] || themes[0]
  const colors = theme[mode] || theme.light
  for (const [token, value] of Object.entries(colors)) {
    document.documentElement.style.setProperty(token, value)
  }
}


/**
 * Get the saved theme and mode from localStorage.
 */
export function getSavedTheme() {
  const themeIndex = parseInt(localStorage.getItem(THEME_KEY) || '0', 10)
  const mode = localStorage.getItem(MODE_KEY) || 'light'
  return {themeIndex, mode}
}


/**
 * Save theme selection to localStorage.
 */
export function saveTheme(themeIndex, mode) {
  localStorage.setItem(THEME_KEY, String(themeIndex))
  localStorage.setItem(MODE_KEY, mode)
}


/**
 * Get the current scene background color from the applied CSS var.
 */
export function getSceneBackground() {
  return getComputedStyle(document.documentElement).getPropertyValue('--color-scene-bg').trim() || '#1a1a1a'
}
