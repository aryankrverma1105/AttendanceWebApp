/**
 * Sologix Energy Mobile Design Tokens (Light Solar Theme)
 */
export const theme = {
  colors: {
    background: '#FFFBF0', // Warm white page background
    surface: '#FFFFFF',    // White card surface
    subtle: '#FEF9E7',     // Subtle section background
    foreground: '#1F2937', // Primary dark text
    card: '#FFFFFF',
    cardForeground: '#1F2937',
    popover: '#FFFFFF',
    popoverForeground: '#1F2937',
    primary: '#F59E0B',    // Solar Amber
    primaryHover: '#D97706',
    primaryTint: '#FEF3C7',
    primaryForeground: '#1F2937', // Dark text on amber for contrast
    secondary: '#0EA5E9',  // Sky blue
    secondaryDeep: '#0369A1',
    secondaryTint: '#E0F2FE',
    secondaryForeground: '#1F2937',
    muted: '#FEF9E7',
    mutedForeground: '#6B7280',
    accent: '#16A34A',     // Clean-energy green
    accentTint: '#DCFCE7',
    accentForeground: '#1F2937',
    destructive: '#DC2626', // Error / Location OFF
    destructiveTint: '#FEE2E2',
    destructiveForeground: '#FFFFFF',
    border: '#F3E8C8',     // Warm border
    input: '#E5DCC0',      // Input border
    ring: '#F59E0B',       // Focus ring

    // Status colors
    status: {
      working: '#16A34A',
      away: '#F59E0B',
      overtime: '#0EA5E9',
      onLeave: '#8B5CF6',
      offline: '#9CA3AF',
      error: '#DC2626',
    },

    // Sologix solar color groups
    solar: {
      50: '#FFFBEB',
      100: '#FEF3C7',
      200: '#FDE68A',
      300: '#FCD34D',
      400: '#FBBF24',
      500: '#F59E0B',
      600: '#D97706',
      700: '#B45309',
      800: '#92400E',
      900: '#78350F',
    },
    sky: {
      50: '#F0F9FF',
      100: '#E0F2FE',
      200: '#BAE6FD',
      300: '#7DD3FC',
      400: '#38BDF8',
      500: '#0EA5E9',
      600: '#0284C7',
      700: '#0369A1',
      800: '#075985',
      900: '#0C4A6E',
    },
    leaf: {
      50: '#F0FDF4',
      100: '#DCFCE7',
      200: '#BBF7D0',
      300: '#86EFAC',
      400: '#4ADE80',
      500: '#22C55E',
      600: '#16A34A',
      700: '#15803D',
      800: '#166534',
      900: '#14532D',
    },

    // Semantic iOS-mapped palette for compatibility
    ios: {
      blue: '#0EA5E9',    // Sky blue
      green: '#16A34A',   // Clean energy green
      orange: '#F59E0B',  // Solar amber
      red: '#DC2626',     // Warning / error
      purple: '#8B5CF6',  // On leave violet
      teal: '#0D9488',
      gray: '#6B7280',
      gray5: '#F3E8C8',
      gray6: '#FFFBF0',
    },
  },
  radius: {
    sm: 6,
    md: 8,
    lg: 10,
    xl: 12,    // Buttons & inputs
    '2xl': 16, // Cards
    '3xl': 22,
    full: 9999,
  },
  shadows: {
    warm: {
      shadowColor: '#F59E0B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.10,
      shadowRadius: 16,
      elevation: 2,
    },
  },
};
