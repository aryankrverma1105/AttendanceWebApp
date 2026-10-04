/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './App.{js,ts,tsx}',
    './screens/**/*.{js,ts,tsx}',
    './components/**/*.{js,ts,tsx}',
    './lib/**/*.{js,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        background: '#FFFBF0', // Warm white page background
        surface: '#FFFFFF',    // Pure white cards
        foreground: '#1F2937', // Primary dark text
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#1F2937',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#1F2937',
        },
        primary: {
          DEFAULT: '#F59E0B',  // Solar Amber
          dark: '#D97706',
          foreground: '#1F2937', // Dark text on amber for contrast
        },
        secondary: {
          DEFAULT: '#0EA5E9',  // Sky blue
          dark: '#0369A1',
          foreground: '#FFFFFF',
        },
        muted: {
          DEFAULT: '#FEF9E7',  // Soft cream
          foreground: '#6B7280', // Secondary text
        },
        accent: {
          DEFAULT: '#16A34A',  // Clean-energy green
          foreground: '#FFFFFF',
        },
        destructive: {
          DEFAULT: '#DC2626',  // Red for Location OFF / Error
          foreground: '#FFFFFF',
        },
        border: '#F3E8C8',     // Warm sunny border
        input: '#E5DCC0',      // Input border
        ring: '#F59E0B',       // Solar amber focus ring

        // Solar color family
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
        // Sky color family
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
        // Leaf / clean-energy green family
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

        // iOS semantic aliases mapped to Light Solar Theme
        ios: {
          blue: '#0EA5E9',
          green: '#16A34A',
          orange: '#F59E0B',
          red: '#DC2626',
          purple: '#8B5CF6',
          teal: '#0D9488',
          indigo: '#0369A1',
          gray: '#6B7280',
          gray2: '#9CA3AF',
          gray3: '#D1D5DB',
          gray4: '#E5DCC0',
          gray5: '#F3E8C8',
          gray6: '#FFFBF0',
        },
      },
      borderRadius: {
        '4xl': '28px',
        '3xl': '22px',
        '2xl': '16px', // Cards
        xl: '12px',    // Buttons & inputs
        lg: '10px',
        md: '8px',
        sm: '6px',
      },
      boxShadow: {
        solar: '0 4px 16px rgba(245, 158, 11, 0.10)',
        warm: '0 2px 8px rgba(217, 119, 6, 0.08)',
        ios: '0 2px 8px rgba(245, 158, 11, 0.06)',
        'ios-lg': '0 4px 16px rgba(245, 158, 11, 0.10)',
      },
    },
  },
  plugins: [],
};
