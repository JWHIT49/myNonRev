import * as store from './store.js';

const THEME_COLORS = { light: '#0b1a3a', dark: '#0a1827' };

export function applyAppearance() {
  const theme = store.get('theme');
  document.documentElement.dataset.theme = ['light', 'dark'].includes(theme) ? theme : 'system';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light']);
}
