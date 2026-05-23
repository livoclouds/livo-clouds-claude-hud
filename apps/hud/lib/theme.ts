// Centralized theme constants. `next-themes` is configured to read these from
// the ThemeProvider, and any component that needs to detect a theme should
// import THEMES rather than hardcoding string literals.

export const THEMES = ['light', 'dark'] as const;
export type ThemeName = (typeof THEMES)[number];

export const DEFAULT_THEME: ThemeName = 'dark';
export const STORAGE_KEY = 'hud-theme';
export const ATTRIBUTE = 'data-theme';
