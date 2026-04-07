// AgentCab Design System — matching web frontend
// Based on OpenClaw frontend CSS variables

import { Platform, StatusBar } from 'react-native'

// Android status bar height (iOS should use useSafeAreaInsets instead)
export const STATUS_BAR_HEIGHT = StatusBar.currentHeight || 44

export const colors = {
  // Primary Blue
  primary50: '#eff6ff',
  primary100: '#dbeafe',
  primary200: '#bfdbfe',
  primary400: '#60a5fa',
  primary500: '#3b82f6',
  primary600: '#2563eb',
  primary700: '#1d4ed8',

  // Shorthand
  primary: '#2563eb',
  primaryDark: '#1d4ed8',
  primaryLight: '#3b82f6',
  primaryGlow: 'rgba(37, 99, 235, 0.3)',

  // Ink (text)
  ink950: '#0f172a',
  ink900: '#1e293b',
  ink800: '#334155',
  ink700: '#475569',
  ink600: '#64748b',
  ink500: '#94a3b8',
  ink400: '#cbd5e1',
  ink300: '#e2e8f0',

  // Sand (backgrounds)
  sand50: '#f8fafc',
  sand100: '#f1f5f9',
  sand200: '#e2e8f0',

  // Semantic
  white: '#ffffff',
  background: '#f8fafc',
  surface: '#ffffff',
  text: '#0f172a',
  textSecondary: '#64748b',
  textMuted: '#94a3b8',
  border: 'rgba(37, 99, 235, 0.12)',
  borderLight: 'rgba(255, 255, 255, 0.6)',

  // Status
  success: '#10b981',
  error: '#ef4444',
  warning: '#f97316',
  danger: '#dc2626',

  // Card
  cardBg: 'rgba(255, 255, 255, 0.8)',
  cardBorder: 'rgba(37, 99, 235, 0.12)',
}

export const gradients = {
  primary: ['#2563eb', '#1d4ed8'] as [string, string],
  hero: ['#ffffff', '#f0f9ff'] as [string, string],
  heroDark: ['#0f172a', '#1e293b'] as [string, string],
  page: ['#ffffff', '#f0f9ff', '#f8fafc'] as [string, string, string],
  card: ['rgba(255,255,255,0.95)', 'rgba(239,246,255,0.8)'] as [string, string],
}

export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 5,
  },
  glow: {
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 6,
  },
}

export const radii = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 50,
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
}

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 24,
  xxl: 32,
  hero: 40,
}

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
}
