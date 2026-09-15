/**
 * v2 palette — see REQUIREMENTS.md §4.1. Mirrors tailwind.config.js's theme.extend.colors
 * for contexts that need raw hex values (SVG stroke/fill, icon colors) rather than className.
 */
export const colors = {
  background: '#0B1A16',
  surface: '#F3EEE3',
  surfaceDark: '#15191B',
  accent: '#C7BDF5',
  textOnSurface: '#17181A',
  textOnDark: '#F5F3EF',
  danger: '#E8674F',
  muted: '#8A8578',
} as const;
