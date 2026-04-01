/** Палитра как у веб-портала (App.css, data-theme). */

export type ThemeMode = 'light' | 'dark';

export type ThemeColors = {
  mode: ThemeMode;
  primary: string;
  primaryLight: string;
  screenBg: string;
  cardBg: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  textSecondary: string;
  inputBg: string;
  inputBorder: string;
  accentNav: string;
  buttonPrimary: string;
  buttonPrimaryText: string;
  danger: string;
  logoStripStart: string;
  logoStripEnd: string;
  logoText1: string;
  logoText2: string;
  switchTrackOff: string;
  switchTrackOn: string;
  switchThumb: string;
  settingsHeaderBg: string;
};

export const lightColors: ThemeColors = {
  mode: 'light',
  primary: '#1e5cb0',
  primaryLight: '#4aa8d8',
  screenBg: '#f5f9ff',
  cardBg: '#ffffff',
  cardBorder: '#4aa8d8',
  text: '#1e5cb0',
  textMuted: '#666666',
  textSecondary: '#333333',
  inputBg: '#ffffff',
  inputBorder: '#dde1e6',
  accentNav: '#1e5cb0',
  buttonPrimary: '#1e5cb0',
  buttonPrimaryText: '#ffffff',
  danger: '#c62828',
  logoStripStart: '#1e5cb0',
  logoStripEnd: '#2563a8',
  logoText1: '#b8e8ff',
  logoText2: '#e8f4ff',
  switchTrackOff: '#cccccc',
  switchTrackOn: '#1e5cb0',
  switchThumb: '#ffffff',
  settingsHeaderBg: '#f5f9ff',
};

export const darkColors: ThemeColors = {
  mode: 'dark',
  primary: '#5a9bd5',
  primaryLight: '#8ab4f8',
  screenBg: '#1a1d24',
  cardBg: '#252a33',
  cardBorder: '#3d4553',
  text: '#e0e4e8',
  textMuted: '#9ca3af',
  textSecondary: '#e0e4e8',
  inputBg: '#2d333d',
  inputBorder: '#3d4553',
  accentNav: '#8ab4f8',
  buttonPrimary: '#5a9bd5',
  buttonPrimaryText: '#0f172a',
  danger: '#f87171',
  logoStripStart: '#152a45',
  logoStripEnd: '#1e3f66',
  logoText1: '#8ab4f8',
  logoText2: '#c5d8f0',
  switchTrackOff: '#3d4553',
  switchTrackOn: '#5a9bd5',
  switchThumb: '#e0e4e8',
  settingsHeaderBg: '#2d333d',
};
